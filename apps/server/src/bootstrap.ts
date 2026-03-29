/**
 * Hive Server Bootstrap
 *
 * Initializes all core modules and returns a ready-to-use application context.
 */

import { createAgent, type Agent, type IPlugin, type ILogger, type ChannelMessage, createScheduleEngine, createScheduleRepository, type ScheduleEngine } from '@hive/core'
import { MessageBus } from '@hive/orchestrator'
import { HeartbeatScheduler } from './heartbeat-scheduler.js'
import { resolve } from 'path'
import type { ServerConfig } from './config.js'

export interface HiveContext {
  /** Message bus for event-driven communication */
  bus: MessageBus
  /** Main agent instance */
  agent: Agent
  /** Server configuration */
  config: ServerConfig
  /** Loaded plugins */
  plugins: IPlugin[]
  /** Heartbeat scheduler */
  heartbeatScheduler: HeartbeatScheduler | null
  /** Schedule engine for cron tasks */
  scheduleEngine: ScheduleEngine | null
}

export interface BootstrapOptions {
  config: ServerConfig
}

// ============================================
// Session → Channel 映射（用于 last 推送策略）
// ============================================

const SESSION_CHANNEL_MAP_MAX_SIZE = 10000
const sessionChannelMap = new Map<string, { channelId: string; chatId: string }>()

/**
 * 添加 session→channel 映射，超过上限时淘汰最早的条目
 */
function setSessionChannelMapping(sessionId: string, channelId: string, chatId: string): void {
  if (sessionChannelMap.size >= SESSION_CHANNEL_MAP_MAX_SIZE) {
    const firstKey = sessionChannelMap.keys().next().value
    if (firstKey !== undefined) sessionChannelMap.delete(firstKey)
  }
  sessionChannelMap.set(sessionId, { channelId, chatId })
}

/**
 * 添加 schedule→channel 映射（定时任务创建时记录）
 */
function setScheduleChannelMapping(scheduleId: string, channelId: string, chatId: string): void {
  // 复用 sessionChannelMap，以 scheduleId 为 key
  sessionChannelMap.set(`schedule:${scheduleId}`, { channelId, chatId })
}

/**
 * Create a simple logger
 */
function createLogger(level: string): ILogger {
  const levels = { debug: 0, info: 1, warn: 2, error: 3 }
  const currentLevel = levels[level as keyof typeof levels] ?? 1

  return {
    debug: (msg, ...args) => currentLevel <= 0 && console.log(`[DEBUG] ${msg}`, ...args),
    info: (msg, ...args) => currentLevel <= 1 && console.log(`[INFO] ${msg}`, ...args),
    warn: (msg, ...args) => currentLevel <= 2 && console.warn(`[WARN] ${msg}`, ...args),
    error: (msg, ...args) => currentLevel <= 3 && console.error(`[ERROR] ${msg}`, ...args),
  }
}

/**
 * Load a plugin by name
 */
function isValidPluginPath(name: string): boolean {
  if (name.startsWith('/') || name.startsWith('.')) return false;
  if (name.includes('..')) return false;
  return /^[a-z0-9@/._-]+$/i.test(name);
}

async function loadPlugin(
  pluginName: string,
  pluginConfig: Record<string, unknown>,
  bus: MessageBus,
  logger: ILogger
): Promise<IPlugin | null> {
  try {
    logger.info(`[bootstrap] Loading plugin: ${pluginName}`)

    if (!isValidPluginPath(pluginName)) {
      logger.warn(`[bootstrap] Plugin path rejected (invalid format): ${pluginName}`)
      return null
    }

    const module = await import(pluginName)
    const factory = module.default || module.createPlugin || module[Object.keys(module)[0]]

    if (typeof factory !== 'function') {
      logger.warn(`[bootstrap] Plugin ${pluginName} does not export a factory function`)
      return null
    }

    const plugin = factory()

    await plugin.initialize({
      messageBus: bus,
      logger,
      config: pluginConfig,
      registerChannel: (channel: unknown) => {
        logger.info(`[bootstrap] Channel registered: ${(channel as { id: string }).id}`)
        bus.emit(`channel:registered`, channel)
      },
    })

    logger.info(`[bootstrap] Plugin loaded: ${pluginName}`)
    return plugin
  } catch (error) {
    logger.error(`[bootstrap] Failed to load plugin ${pluginName}:`, error)
    return null
  }
}

// ============================================
// 推送通知辅助函数
// ============================================

/**
 * 解析推送目标
 * 支持 channel='last' 策略（先查 session 映射，再查 schedule 映射）
 */
function resolveNotifyTarget(notifyConfig: { channel?: string; to?: string }, contextId?: string): { channelId: string; chatId: string } | null {
  if (!notifyConfig.channel && !notifyConfig.to) return null

  if (notifyConfig.channel === 'last') {
    if (contextId) {
      const mapping = sessionChannelMap.get(contextId)
      if (mapping) return mapping
      const scheduleMapping = sessionChannelMap.get(`schedule:${contextId}`)
      if (scheduleMapping) return scheduleMapping
    }
    return null
  }

  if (notifyConfig.channel && notifyConfig.to) {
    return { channelId: notifyConfig.channel, chatId: notifyConfig.to }
  }

  return null
}

// ============================================
// Bootstrap
// ============================================

/**
 * Bootstrap the Hive server
 */
export async function bootstrap(options: BootstrapOptions): Promise<HiveContext> {
  const { config } = options
  const logger = createLogger(config.logLevel)

  logger.info('[bootstrap] Initializing MessageBus...')
  const bus = new MessageBus()

  logger.info('[bootstrap] Creating main agent...')
  const agent = createAgent({
    externalConfig: {
      providers: [
        {
          id: config.provider.id,
          name: config.provider.id.toUpperCase(),
          apiKey: config.provider.apiKey,
          model: config.provider.model,
          baseUrl: config.provider.baseUrl || `https://api.${config.provider.id}.com`,
        },
      ],
      activeProvider: config.provider.id,
    },
  })

  logger.info('[bootstrap] Initializing agent...')
  await agent.initialize()

  // Load plugins
  const plugins: IPlugin[] = []
  for (const pluginName of config.plugins) {
    const pluginConfig = config.pluginConfigs[pluginName] || {}
    const plugin = await loadPlugin(pluginName, pluginConfig, bus, logger)
    if (plugin) {
      plugins.push(plugin)
    }
  }

  // Activate plugins
  for (const plugin of plugins) {
    try {
      await plugin.activate()
      logger.info(`[bootstrap] Plugin activated: ${plugin.metadata.name}`)
    } catch (error) {
      logger.error(`[bootstrap] Failed to activate plugin:`, error)
    }
  }

  logger.info(`[bootstrap] Bootstrap complete. ${plugins.length} plugins loaded.`)

  // Start heartbeat scheduler
  let heartbeatScheduler: HeartbeatScheduler | null = null
  if (config.heartbeat.enabled) {
    heartbeatScheduler = new HeartbeatScheduler({ agent, config: config.heartbeat, bus })
    heartbeatScheduler.start()
    logger.info(`[bootstrap] Heartbeat scheduler started (interval: ${config.heartbeat.intervalMs}ms)`)
  }

  // Initialize schedule engine
  let scheduleEngine: ScheduleEngine | null = null
  try {
    const { createDatabase: createDb } = await import('@hive/core')
    const dbManager = createDb({ dbPath: resolve(process.cwd(), '.hive/hive.db') })
    await dbManager.initialize()
    const scheduleRepo = createScheduleRepository(dbManager.getDb())

    scheduleEngine = createScheduleEngine(scheduleRepo, async ({ schedule: task }) => {
      logger.info(`[scheduler] Executing schedule: ${task.name}`)
      try {
        const result = await agent.chat(task.prompt, {
          sessionId: undefined,
        })
        const sessionId = agent.context.hookRegistry.getSessionId()
        logger.info(`[scheduler] Schedule "${task.name}" completed, session: ${sessionId}`)

        // 发送 schedule:completed 事件
        bus.emit('schedule:completed', {
          scheduleId: task.id,
          result: result,
          status: 'success',
          consecutiveErrors: 0,
          notifyConfig: task.notifyConfig,
          scheduleName: task.name,
        })

        return { sessionId, success: true }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        logger.error(`[scheduler] Schedule "${task.name}" failed: ${msg}`)

        // 发送 schedule:completed 事件（失败）
        // 注意：circuit-break 由 ScheduleEngine 内部处理，bootstrap 不重复
        bus.emit('schedule:completed', {
          scheduleId: task.id,
          result: undefined,
          status: 'failed',
          consecutiveErrors: (task.consecutiveErrors ?? 0) + 1,
          notifyConfig: task.notifyConfig,
          scheduleName: task.name,
        })

        return { sessionId: '', success: false, error: msg }
      }
    }, {
      onCircuitBreak: (event) => {
        logger.warn(`[schedule:circuit-break] Task "${event.name}" paused after ${event.consecutiveErrors} consecutive failures`)
        bus.emit('schedule:circuit-break', event)
      },
    })

    const taskCount = await scheduleEngine.start()
    logger.info(`[bootstrap] Schedule engine started (${taskCount} tasks loaded)`)
  } catch (error) {
    logger.warn(`[bootstrap] Schedule engine not available: ${error instanceof Error ? error.message : error}`)
  }

  // ============================================
  // Subscriber: message:received
  // 记录 session → channel 映射 + Agent 处理
  // ============================================
  bus.subscribe('message:received', async (message: { payload: unknown }) => {
    const channelMessage = message.payload as ChannelMessage
    logger.info(`[bootstrap] Message received, dispatching to agent: ${channelMessage.content.slice(0, 50)}`)

    // 记录 session → channel 映射（用于 last 推送策略）
    const sessionId = channelMessage.metadata?.sessionId as string | undefined
    const channelId = channelMessage.metadata?.channelId as string | undefined
    if (sessionId && channelId && channelMessage.to?.id) {
      setSessionChannelMapping(
        sessionId,
        channelId,
        channelMessage.to.id,
      )
    }

    const replyType = channelMessage.type === 'card' ? 'card' : 'markdown'

    try {
      const result = await agent.dispatch(channelMessage.content, {
        chatId: channelMessage.to?.id,
        onPhase: (phase, message) => {
          logger.info(`[agent] [${phase}] ${message}`)
        },
        onTool: (tool) => {
          logger.info(`[agent] [tool] ${tool}`)
        },
      })

      const replyText = result.text
        || (result.success ? '任务完成' : `任务失败：${result.error || '未知错误'}`)

      logger.info(`[agent] completed (${result.duration}ms)`)
      logger.info(`[agent] [response] ${replyText}`)

      bus.publish('message:response', {
        channelId: channelMessage.metadata?.channelId,
        chatId: channelMessage.to?.id,
        replyTo: channelMessage.id,
        content: replyText,
        type: replyType,
      })

      logger.info(`[bootstrap] Agent response sent to channel (format: ${replyType})`)
    } catch (error) {
      logger.error(`[bootstrap] Agent workflow failed:`, error)
      bus.publish('message:response', {
        channelId: channelMessage.metadata?.channelId,
        chatId: channelMessage.to?.id,
        replyTo: channelMessage.id,
        content: `处理失败：${error instanceof Error ? error.message : '未知错误'}`,
        type: replyType,
      })
    }
  })

  // ============================================
  // Subscriber: schedule:completed
  // 将执行结果推送到目标 Channel
  // ============================================
  bus.subscribe('schedule:completed', async (event: { payload: unknown }) => {
    const payload = event.payload as {
      scheduleId: string;
      result?: string;
      status: 'success' | 'failed';
      consecutiveErrors: number;
      notifyConfig?: { mode: string; channel?: string; to?: string; bestEffort?: boolean };
      scheduleName: string;
    }

    if (!payload.notifyConfig || payload.notifyConfig.mode === 'none') {
      return // 不推送
    }

    if (payload.notifyConfig.mode !== 'announce') {
      return
    }

    const target = resolveNotifyTarget(payload.notifyConfig, payload.scheduleId)

    if (!target) {
      if (payload.notifyConfig.bestEffort) {
        logger.info(`[schedule:notify] Target not found, bestEffort skip: ${payload.scheduleName}`)
        return // 静默跳过
      }
      logger.warn(`[schedule:notify] Target not found for: ${payload.scheduleName}`)
      return
    }

    const statusEmoji = payload.status === 'success' ? '✅' : '❌'
    const content = `${statusEmoji} 定时任务「${payload.scheduleName}」执行${payload.status === 'success' ? '成功' : '失败'}\n${payload.result ? `\n${payload.result}` : ''}`

    bus.publish('message:response', {
      channelId: target.channelId,
      chatId: target.chatId,
      content,
      type: 'markdown',
    })

    logger.info(`[schedule:notify] Pushed result to ${target.channelId}/${target.chatId}: ${payload.scheduleName}`)
  })

  // ============================================
  // Subscriber: schedule:circuit-break
  // 连续失败熔断通知
  // ============================================
  bus.subscribe('schedule:circuit-break', async (event: { payload: unknown }) => {
    const payload = event.payload as {
      scheduleId: string;
      name: string;
      consecutiveErrors: number;
    }

    logger.warn(`[schedule:circuit-break] Task "${payload.name}" paused after ${payload.consecutiveErrors} consecutive failures`)

    // 尝试推送到 last channel
    // 目前 circuit-break 通知没有 notifyConfig，暂用日志记录
    // 未来可扩展：读取任务的 notifyConfig 进行推送
  })

  return {
    bus,
    agent,
    config,
    plugins,
    heartbeatScheduler,
    scheduleEngine,
  }
}

/**
 * Graceful shutdown
 */
export async function shutdown(ctx: HiveContext): Promise<void> {
  console.log('[shutdown] Starting graceful shutdown...')

  if (ctx.heartbeatScheduler) {
    ctx.heartbeatScheduler.stop()
  }

  if (ctx.scheduleEngine) {
    await ctx.scheduleEngine.stop()
    console.log('[shutdown] Schedule engine stopped')
  }

  for (const plugin of ctx.plugins) {
    try {
      await plugin.deactivate()
      console.log(`[shutdown] Plugin deactivated: ${plugin.metadata.name}`)
    } catch (error) {
      console.error(`[shutdown] Failed to deactivate plugin:`, error)
    }
  }

  console.log('[shutdown] Shutdown complete')
}

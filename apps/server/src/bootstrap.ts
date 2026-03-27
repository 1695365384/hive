/**
 * Hive Server Bootstrap
 *
 * Initializes all core modules and returns a ready-to-use application context.
 */

import { createAgent, type Agent, type IPlugin, type ILogger, type ChannelMessage } from '@hive/core'
import { MessageBus } from '@hive/orchestrator'
import { HeartbeatScheduler } from './heartbeat-scheduler.js'
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
}

export interface BootstrapOptions {
  config: ServerConfig
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
async function loadPlugin(
  pluginName: string,
  pluginConfig: Record<string, unknown>,
  bus: MessageBus,
  logger: ILogger
): Promise<IPlugin | null> {
  try {
    logger.info(`[bootstrap] Loading plugin: ${pluginName}`)

    // Dynamic import the plugin module
    const module = await import(pluginName)

    // Get the plugin factory function
    const factory = module.default || module.createPlugin || module[Object.keys(module)[0]]

    if (typeof factory !== 'function') {
      logger.warn(`[bootstrap] Plugin ${pluginName} does not export a factory function`)
      return null
    }

    // Create plugin instance
    const plugin = factory()

    // Initialize plugin
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

/**
 * Bootstrap the Hive server
 *
 * This function initializes all core modules in the correct order:
 * 1. MessageBus - event-driven communication
 * 2. Create main agent
 * 3. Load plugins
 * 4. Activate plugins
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

  // Initialize agent
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

  // 桥接：通道消息 → Agent 处理 → 回复
  bus.subscribe('message:received', async (message: { payload: unknown }) => {
    const channelMessage = message.payload as ChannelMessage
    logger.info(`[bootstrap] Message received, dispatching to agent: ${channelMessage.content.slice(0, 50)}`)

    // 根据入站消息类型决定回复格式：卡片→卡片，其他→markdown
    const replyType = channelMessage.type === 'card' ? 'card' : 'markdown'

    try {
      const result = await agent.runWorkflow(channelMessage.content, {
        chatId: channelMessage.to?.id,
        onPhase: (phase, message) => {
          logger.info(`[agent] [${phase}] ${message}`)
        },
        onText: (text) => {
          logger.info(`[agent] [text] ${text.slice(0, 100)}`)
        },
        onTool: (tool, input) => {
          logger.info(`[agent] [tool] ${tool}`)
        },
      })

      // 提取回复文本
      const replyText = result.executeResult?.text
        || (result.success ? `任务完成：${result.analysis?.type || 'simple'}` : `任务失败：${result.error || '未知错误'}`)

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

  return {
    bus,
    agent,
    config,
    plugins,
    heartbeatScheduler,
  }
}

/**
 * Graceful shutdown
 */
export async function shutdown(ctx: HiveContext): Promise<void> {
  console.log('[shutdown] Starting graceful shutdown...')

  // Stop heartbeat scheduler
  if (ctx.heartbeatScheduler) {
    ctx.heartbeatScheduler.stop()
  }

  // Deactivate plugins
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

/**
 * Server 实现
 *
 * 将 Agent、数据库、定时任务引擎、插件加载、Channel 注册表、消息总线订阅、心跳调度
 * 收拢到一个统一的 Server 实例中。
 */

import {
  createAgent,
  createDatabase,
  createScheduleRepository,
  createScheduleEngine,
  createWorkspaceManager,
  HeartbeatScheduler,
  type Agent,
  type IPlugin,
  type IChannel,
  type ChannelMessage,
  type ILogger,
  type ScheduleEngine,
  type WorkspaceManager,
} from '../index.js';
import { MessageBus } from '../bus/MessageBus.js';
import { noopLogger } from '../types/logger.js';
import { ChannelContext } from './ChannelContext.js';
import type { Server, ServerOptions, ServerHeartbeatConfig } from './types.js';

// ============================================
// 工具日志格式化
// ============================================

const TOOL_INPUT_SUMMARIES: Record<string, (input: any) => string> = {
  Bash: (i) => truncate(String(i.command ?? ''), 120),
  Read: (i) => truncate(String(i.file_path ?? ''), 100),
  Write: (i) => truncate(String(i.file_path ?? ''), 100),
  Edit: (i) => truncate(String(i.file_path ?? ''), 100),
  Glob: (i) => truncate(String(i.pattern ?? ''), 80),
  Grep: (i) => truncate(`${i.pattern ?? ''} in ${i.path ?? '.'}`, 80),
  'WebSearch': (i) => truncate(String(i.query ?? ''), 100),
  'WebFetch': (i) => truncate(String(i.url ?? ''), 100),
  'AskUser': () => '',
  explore: (i) => truncate(String(i.prompt ?? ''), 100),
  plan: (i) => truncate(String(i.prompt ?? ''), 100),
};

function formatToolInput(tool: string, input: unknown): string {
  const inputObj = typeof input === 'object' && input !== null ? input as Record<string, unknown> : {};
  const formatter = TOOL_INPUT_SUMMARIES[tool];
  if (formatter) return formatter(inputObj);
  const keys = Object.keys(inputObj);
  return keys.length > 0 ? truncate(JSON.stringify(inputObj), 120) : '';
}

function formatToolResult(tool: string, result: unknown): string {
  const text = typeof result === 'string' ? result : JSON.stringify(result ?? '');
  if (tool === 'explore' || tool === 'plan') {
    return truncate(text, 200);
  }
  return truncate(text, 150);
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + '...';
}

// ============================================
// 插件加载
// ============================================

function isValidPluginPath(name: string): boolean {
  if (name.startsWith('/') || name.startsWith('.')) return false;
  if (name.includes('..')) return false;
  return /^[a-z0-9@/._-]+$/i.test(name);
}

async function loadPlugin(
  pluginName: string,
  pluginConfig: Record<string, unknown>,
  bus: MessageBus,
  logger: ILogger,
  channelContext: ChannelContext,
): Promise<IPlugin | null> {
  try {
    logger.info(`[server] Loading plugin: ${pluginName}`);

    if (!isValidPluginPath(pluginName)) {
      logger.warn(`[server] Plugin path rejected (invalid format): ${pluginName}`);
      return null;
    }

    const module = await import(pluginName);
    const factory = module.default || module.createPlugin || module[Object.keys(module)[0]];

    if (typeof factory !== 'function') {
      logger.warn(`[server] Plugin ${pluginName} does not export a factory function`);
      return null;
    }

    const plugin = factory();

    await plugin.initialize({
      messageBus: bus,
      logger,
      config: pluginConfig,
      registerChannel: (channel: unknown) => {
        const ch = channel as IChannel;
        logger.info(`[server] Channel registered: ${ch.id}`);
        channelContext.register(ch);
        bus.emit(`channel:registered`, channel);
      },
    });

    logger.info(`[server] Plugin loaded: ${pluginName}`);
    return plugin;
  } catch (error) {
    logger.error(`[server] Failed to load plugin ${pluginName}:`, error);
    return null;
  }
}

// ============================================
// Server 实现
// ============================================

class ServerImpl implements Server {
  readonly agent: Agent;
  readonly bus: MessageBus;
  readonly logger: ILogger;

  private channelContext: ChannelContext;
  private plugins: IPlugin[] = [];
  private scheduleEngine: ScheduleEngine | null = null;
  private heartbeatScheduler: HeartbeatScheduler | null = null;
  private started = false;

  /** WorkspaceManager — 由 createServer() 创建，在 start() 中初始化 */
  _workspaceManager: WorkspaceManager | undefined;

  constructor(
    agent: Agent,
    bus: MessageBus,
    logger: ILogger,
    channelContext: ChannelContext,
  ) {
    this.agent = agent;
    this.bus = bus;
    this.logger = logger;
    this.channelContext = channelContext;
  }

  getChannel(id: string): IChannel | undefined {
    return this.channelContext.get(id);
  }

  registerChannel(channel: IChannel): void {
    this.channelContext.register(channel);
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    this.logger.info('[server] Starting...');

    // 初始化工作空间（创建 .hive/cache 等目录结构）
    if (this._workspaceManager) {
      await this._workspaceManager.initialize();
    }

    // 初始化 Agent
    this.logger.info('[server] Initializing agent...');
    await this.agent.initialize();

    // 加载插件（initialize 阶段）
    const pluginsConfig = this._pluginsConfig;
    if (pluginsConfig) {
      for (const { name, config } of pluginsConfig) {
        const plugin = await loadPlugin(name, config, this.bus, this.logger, this.channelContext);
        if (plugin) this.plugins.push(plugin);
      }
    }

    // 启动定时任务引擎
    if (this._dbPath) {
      await this.initScheduleEngine();
    }

    // 启动心跳调度
    if (this._heartbeatConfig) {
      this.startHeartbeat();
    }

    // 订阅消息处理器
    this.subscribeMessageHandler();
    this.subscribeScheduleHandlers();

    // 订阅 message:response 推送到 channel
    this.bus.subscribe('message:response', async (event: { payload: unknown }) => {
      const { channelId, chatId, content, type } = event.payload as {
        channelId?: string;
        chatId?: string;
        content: string;
        type?: string;
      };

      if (!channelId || !chatId) return;

      const channel = this.channelContext.get(channelId);
      if (!channel) {
        this.logger.debug(`[message:response] No channel found for ${channelId}, skipping`);
        return;
      }

      try {
        await channel.send({ to: chatId, content, type: (type || 'markdown') as 'text' | 'markdown' });
        this.logger.info(`[message:response] Pushed to channel ${channelId} chat ${chatId}`);
      } catch (error) {
        this.logger.error(`[message:response] Failed to push to channel ${channelId}:`, error);
      }
    });

    // 激活插件
    for (const plugin of this.plugins) {
      try {
        await plugin.activate();
        this.logger.info(`[server] Plugin activated: ${plugin.metadata.name}`);
      } catch (error) {
        this.logger.error(`[server] Failed to activate plugin:`, error);
      }
    }

    this.logger.info('[server] Started.');
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    this.started = false;

    this.logger.info('[server] Stopping...');

    // 停用插件
    for (const plugin of this.plugins) {
      try {
        await plugin.deactivate();
        this.logger.info(`[server] Plugin deactivated: ${plugin.metadata.name}`);
      } catch (error) {
        this.logger.error(`[server] Failed to deactivate plugin:`, error);
      }
    }

    // 停止心跳
    if (this.heartbeatScheduler) {
      this.heartbeatScheduler.stop();
      this.heartbeatScheduler = null;
    }

    // 停止定时任务引擎
    if (this.scheduleEngine) {
      await this.scheduleEngine.stop();
      this.logger.info('[server] Schedule engine stopped');
    }

    this.logger.info('[server] Stopped.');
  }

  // ============================================
  // 内部方法
  // ============================================

  private _pluginsConfig: Array<{ name: string; config: Record<string, unknown> }> | undefined;
  private _dbPath: string | undefined;
  private _heartbeatConfig: ServerHeartbeatConfig | undefined;
  private _scheduleEngineConfig: ServerOptions['config']['scheduleEngine'];

  setOptions(options: ServerOptions): void {
    this._pluginsConfig = options.config.plugins;
    this._dbPath = options.dbPath;
    this._heartbeatConfig = options.config.heartbeat;
    this._scheduleEngineConfig = options.config.scheduleEngine;
  }

  private async initScheduleEngine(): Promise<void> {
    try {
      const { resolve } = await import('path');
      const dbPath = this._dbPath || resolve(process.cwd(), '.hive/hive.db');
      const dbManager = createDatabase({ dbPath });
      await dbManager.initialize();
      const scheduleRepo = createScheduleRepository(dbManager.getDb());

      const engine = createScheduleEngine(scheduleRepo, async ({ schedule: task }) => {
        this.logger.info(`[scheduler] Executing schedule: ${task.name}`);
        try {
          const result = await this.agent.chat(task.prompt, { sessionId: undefined });
          const sessionId = this.agent.context.hookRegistry.getSessionId();
          this.logger.info(`[scheduler] Schedule "${task.name}" completed, session: ${sessionId}`);

          this.bus.emit('schedule:completed', {
            scheduleId: task.id,
            result,
            status: 'success',
            consecutiveErrors: 0,
            notifyConfig: task.notifyConfig,
            scheduleName: task.name,
          });

          return { sessionId, success: true };
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          this.logger.error(`[scheduler] Schedule "${task.name}" failed: ${msg}`);

          this.bus.emit('schedule:completed', {
            scheduleId: task.id,
            result: undefined,
            status: 'failed',
            consecutiveErrors: (task.consecutiveErrors ?? 0) + 1,
            notifyConfig: task.notifyConfig,
            scheduleName: task.name,
          });

          return { sessionId: '', success: false, error: msg };
        }
      }, {
        onCircuitBreak: this._scheduleEngineConfig?.onCircuitBreak
          ? (event) => {
              this.logger.warn(`[schedule:circuit-break] Task "${event.name}" paused after ${event.consecutiveErrors} consecutive failures`);
              this.bus.emit('schedule:circuit-break', event);
              this._scheduleEngineConfig!.onCircuitBreak!(event);
            }
          : undefined,
      });

      this.agent.schedule.setDependencies(scheduleRepo, engine);

      const taskCount = await engine.start();
      this.scheduleEngine = engine;
      this.logger.info(`[server] Schedule engine started (${taskCount} tasks loaded)`);
    } catch (error) {
      this.logger.warn(`[server] Schedule engine not available: ${error instanceof Error ? error.message : error}`);
    }
  }

  private startHeartbeat(): void {
    const config = this._heartbeatConfig!;
    this.heartbeatScheduler = new HeartbeatScheduler({
      agent: this.agent,
      config: { intervalMs: config.intervalMs, model: config.model, prompt: config.prompt },
      bus: this.bus,
      logger: this.logger,
    });
    this.heartbeatScheduler.start();
  }

  private subscribeMessageHandler(): void {
    this.bus.subscribe('message:received', async (message: { payload: unknown }) => {
      const channelMessage = message.payload as ChannelMessage;
      this.logger.info(`[server] Message received, dispatching to agent: ${channelMessage.content.slice(0, 50)}`);

      const sessionId = channelMessage.metadata?.sessionId as string | undefined;
      const channelId = channelMessage.metadata?.channelId as string | undefined;
      if (sessionId && channelId && channelMessage.to?.id) {
        this.channelContext.setSession(sessionId, channelId, channelMessage.to.id);
      }

      const replyType = channelMessage.type === 'card' ? 'card' : 'markdown';

      try {
        const result = await this.agent.dispatch(channelMessage.content, {
          chatId: channelMessage.to?.id,
          onPhase: (phase, message) => {
            this.logger.info(`[agent] [${phase}] ${message}`);
          },
          onTool: (tool, input) => {
            const summary = formatToolInput(tool, input);
            this.logger.info(`[agent] [tool] ${tool} ${summary}`);
          },
          onToolResult: (tool, output) => {
            const summary = formatToolResult(tool, output);
            this.logger.info(`[agent] [tool-result] ${tool} → ${summary}`);
          },
        });

        const replyText = result.text
          || (result.success ? '任务完成' : `任务失败：${result.error || '未知错误'}`);

        this.logger.info(`[agent] completed (${result.duration}ms)`);
        this.logger.info(`[agent] [response] ${replyText}`);

        this.bus.publish('message:response', {
          channelId: channelMessage.metadata?.channelId,
          chatId: channelMessage.to?.id,
          replyTo: channelMessage.id,
          content: replyText,
          type: replyType,
        });

        this.logger.info(`[server] Agent response sent to channel (format: ${replyType})`);
      } catch (error) {
        this.logger.error(`[server] Agent workflow failed:`, error);
        this.bus.publish('message:response', {
          channelId: channelMessage.metadata?.channelId,
          chatId: channelMessage.to?.id,
          replyTo: channelMessage.id,
          content: `处理失败：${error instanceof Error ? error.message : '未知错误'}`,
          type: replyType,
        });
      }
    });
  }

  private subscribeScheduleHandlers(): void {
    this.bus.subscribe('schedule:completed', async (event: { payload: unknown }) => {
      const payload = event.payload as {
        scheduleId: string;
        result?: string;
        status: 'success' | 'failed';
        consecutiveErrors: number;
        notifyConfig?: { mode: string; channel?: string; to?: string; bestEffort?: boolean };
        scheduleName: string;
      };

      if (!payload.notifyConfig || payload.notifyConfig.mode === 'none') return;
      if (payload.notifyConfig.mode !== 'announce') return;

      const target = this.channelContext.resolveNotifyTarget(payload.notifyConfig, payload.scheduleId);

      if (!target) {
        if (payload.notifyConfig.bestEffort) {
          this.logger.info(`[schedule:notify] Target not found, bestEffort skip: ${payload.scheduleName}`);
          return;
        }
        this.logger.warn(`[schedule:notify] Target not found for: ${payload.scheduleName}`);
        return;
      }

      const statusEmoji = payload.status === 'success' ? '✅' : '❌';
      const content = `${statusEmoji} 定时任务「${payload.scheduleName}」执行${payload.status === 'success' ? '成功' : '失败'}\n${payload.result ? `\n${payload.result}` : ''}`;

      this.bus.publish('message:response', {
        channelId: target.channelId,
        chatId: target.chatId,
        content,
        type: 'markdown',
      });

      this.logger.info(`[schedule:notify] Pushed result to ${target.channelId}/${target.chatId}: ${payload.scheduleName}`);
    });

    this.bus.subscribe('schedule:circuit-break', async (event: { payload: unknown }) => {
      const payload = event.payload as {
        scheduleId: string;
        name: string;
        consecutiveErrors: number;
      };

      this.logger.warn(`[schedule:circuit-break] Task "${payload.name}" paused after ${payload.consecutiveErrors} consecutive failures`);
    });
  }
}

// ============================================
// 工厂函数
// ============================================

/**
 * 创建 Server 实例
 *
 * 统一的入口，将 Agent、数据库、定时任务引擎、插件、Channel、消息总线、心跳
 * 收拢到一个 Server 实例中。调用 `start()` 启动，`stop()` 停止。
 */
export function createServer(options: ServerOptions): Server {
  const logger = options.logger ?? noopLogger;
  const bus = options.bus ?? new MessageBus();
  const channelContext = new ChannelContext();

  // 创建 WorkspaceManager 并在 start() 时初始化
  const dbPath = options.dbPath;
  const workspaceManager = createWorkspaceManager(
    dbPath ? { path: dbPath.replace(/\/hive\.db$/, '') } : undefined,
  );

  const agent = createAgent({
    externalConfig: options.config.externalConfig,
    sessionConfig: { workspaceManager },
    dbPath,
  });

  const server = new ServerImpl(agent, bus, logger, channelContext);
  server.setOptions(options);
  server._workspaceManager = workspaceManager;
  return server;
}

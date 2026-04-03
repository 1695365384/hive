/**
 * Server 实现
 *
 * 将 Agent、数据库、定时任务引擎、插件、Channel 注册表、流式事件回调、心跳调度
 * 收拢到一个统一的 Server 实例中。
 */

import {
  createAgent,
  createDatabase,
  createScheduleRepository,
  createScheduleEngine,
  createWorkspaceManager,
  HeartbeatScheduler,
  probeEnvironment,
  scanEnvironment,
  type Agent,
  type IPlugin,
  type IChannel,
  type ChannelMessage,
  type ILogger,
  type ScheduleEngine,
  type WorkspaceManager,
} from '../index.js';
import { noopLogger } from '../types/logger.js';
import { ChannelContext } from './ChannelContext.js';
import { setSendFileCallback } from '../tools/built-in/send-file-tool.js';
import type {
  Server,
  ServerOptions,
  ServerHeartbeatConfig,
  StreamingEventUnion,
  StreamingHandler,
  FileEvent,
  FileHandler,
} from './types.js';

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
// Server 实现
// ============================================

class ServerImpl implements Server {
  readonly agent: Agent;
  readonly logger: ILogger;

  private channelContext: ChannelContext;
  private plugins: IPlugin[] = [];
  private scheduleEngine: ScheduleEngine | null = null;
  private heartbeatScheduler: HeartbeatScheduler | null = null;
  private started = false;
  private dbManager: ReturnType<typeof createDatabase> | undefined;
  private activeAbortControllers: Map<string, AbortController> = new Map();
  private streamingHandlers: Set<StreamingHandler> = new Set();
  private fileHandlers: Set<FileHandler> = new Set();

  /** WorkspaceManager — 由 createServer() 创建，在 start() 中初始化 */
  _workspaceManager: WorkspaceManager | undefined;

  constructor(
    agent: Agent,
    logger: ILogger,
    channelContext: ChannelContext,
  ) {
    this.agent = agent;
    this.logger = logger;
    this.channelContext = channelContext;
  }

  // ============================================
  // Server 接口实现
  // ============================================

  getChannel(id: string): IChannel | undefined {
    return this.channelContext.get(id);
  }

  registerChannel(channel: IChannel): void {
    this.channelContext.register(channel);
  }

  handleMessage(message: ChannelMessage): void {
    this.dispatchToAgent(message).catch((error) => {
      this.logger.error('[server] handleMessage failed:', error);
    });
  }

  abort(sessionId: string): void {
    const controller = this.activeAbortControllers.get(sessionId);
    if (controller) {
      controller.abort();
      this.agent.taskManager.abortAll();
      this.logger.info(`[server] Agent execution aborted for session ${sessionId}`);
    }
  }

  onStreamingEvent(handler: StreamingHandler): () => void {
    this.streamingHandlers.add(handler);
    return () => this.streamingHandlers.delete(handler);
  }

  onFileEvent(handler: FileHandler): () => void {
    this.fileHandlers.add(handler);
    return () => this.fileHandlers.delete(handler);
  }

  emitFileEvent(event: FileEvent): void {
    for (const handler of this.fileHandlers) {
      try { handler(event); } catch (e) { this.logger.error('[server] FileHandler error:', e); }
    }
  }

  // ============================================
  // 生命周期
  // ============================================

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

    // 初始化插件
    for (const plugin of this.plugins) {
      try {
        await plugin.initialize(
          (msg) => this.handleMessage(msg),
          this.logger,
          (channel: IChannel) => {
            this.logger.info(`[server] Channel registered: ${channel.id}`);
            this.channelContext.register(channel);
          },
          this._workspaceManager
            ? { workspaceDir: this._workspaceManager.getRootPath() }
            : undefined,
        );
        this.logger.info(`[server] Plugin initialized: ${plugin.metadata.name}`);
      } catch (error) {
        this.logger.error(`[server] Failed to initialize plugin ${plugin.metadata.name}:`, error);
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

    // 销毁插件（释放外部资源）
    for (const plugin of this.plugins) {
      try {
        if (plugin.destroy) {
          await plugin.destroy();
          this.logger.info(`[server] Plugin destroyed: ${plugin.metadata.name}`);
        }
      } catch (error) {
        this.logger.error(`[server] Failed to destroy plugin:`, error);
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

    // 关闭数据库连接
    if (this.dbManager) {
      try {
        this.dbManager.close();
        this.logger.info('[server] Database closed');
      } catch (error) {
        this.logger.error(`[server] Failed to close database:`, error);
      }
    }

    // 清理回调
    this.streamingHandlers.clear();
    this.fileHandlers.clear();

    this.logger.info('[server] Stopped.');
  }

  // ============================================
  // 内部方法
  // ============================================

  getPlugin(id: string): IPlugin | undefined {
    return this.plugins.find(p => p.metadata.id === id);
  }

  replacePlugin(id: string, plugin: IPlugin): void {
    const idx = this.plugins.findIndex(p => p.metadata.id === id);
    if (idx >= 0) {
      this.plugins[idx] = plugin;
    } else {
      this.plugins.push(plugin);
    }
  }

  private _dbPath: string | undefined;
  private _heartbeatConfig: ServerHeartbeatConfig | undefined;
  private _scheduleEngineConfig: ServerOptions['config']['scheduleEngine'];

  setOptions(options: ServerOptions): void {
    this.plugins = options.plugins ?? [];
    this._dbPath = options.dbPath;
    this._heartbeatConfig = options.config.heartbeat;
    this._scheduleEngineConfig = options.config.scheduleEngine;
  }

  // ============================================
  // 流式事件发射
  // ============================================

  private emitStreaming(event: StreamingEventUnion): void {
    for (const handler of this.streamingHandlers) {
      try { handler(event); } catch (e) { this.logger.error('[server] StreamingHandler error:', e); }
    }
  }

  // ============================================
  // Channel 消息推送
  // ============================================

  private async pushToChannel(
    channelId: string | undefined,
    chatId: string | undefined,
    content: string,
    type: string,
    filePath?: string,
  ): Promise<void> {
    if (!channelId || !chatId) return;

    const channel = this.channelContext.get(channelId);
    if (!channel) {
      this.logger.debug(`[message:response] No channel found for ${channelId}, skipping`);
      return;
    }

    try {
      await channel.send({ to: chatId, content, type: (type || 'markdown') as 'text' | 'markdown', filePath });
      this.logger.info(`[message:response] Pushed to channel ${channelId} chat ${chatId}`);
    } catch (error) {
      this.logger.error(`[message:response] Failed to push to channel ${channelId}:`, error);
    }
  }

  // ============================================
  // 消息分发（原 subscribeMessageHandler）
  // ============================================

  private async dispatchToAgent(channelMessage: ChannelMessage): Promise<void> {
    this.logger.info(`[server] Message received, dispatching to agent: ${channelMessage.content.slice(0, 50)}`);

    const channelId = channelMessage.metadata?.channelId as string | undefined;
    const recipientId = channelMessage.to?.id ?? crypto.randomUUID();

    // Session key = channelId:recipientId — 隔离不同通道的会话
    const sessionKey = channelId ? `${channelId}:${recipientId}` : recipientId;

    // 注册 session → channel 映射
    if (channelId && channelMessage.to?.id) {
      this.channelContext.setSession(sessionKey, channelId, channelMessage.to.id);
    }

    const replyType = channelMessage.type === 'card' ? 'card' : 'markdown';

    // 注入 send_file 回调
    if (channelId && this.channelContext.get(channelId)) {
      const sendChannelId = channelId;
      const sendChatId = recipientId;
      setSendFileCallback(async (filePath: string) => {
        const channel = this.channelContext.get(sendChannelId)!;
        if (!channel.capabilities.sendFile) {
          return { success: false, error: `Channel ${sendChannelId} does not support file sending` };
        }
        try {
          const result = await channel.send({ to: sendChatId, content: '', filePath, type: 'file' });
          return { success: result.success, error: result.error };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
      });
    }

    try {
      const abortController = new AbortController();
      this.activeAbortControllers.set(sessionKey, abortController);

      // 订阅 Worker 事件并转发到流式回调
      const workerHookIds: string[] = [];

      workerHookIds.push(
        this.agent.context.hookRegistry.on('worker:start', (ctx: any) => {
          this.logger.info(`[agent] [worker:${ctx.workerId}] ${ctx.workerType} started${ctx.description ? `: ${ctx.description}` : ''}`);
          this.emitStreaming({ sessionId: sessionKey, type: 'worker-start', workerId: ctx.workerId, workerType: ctx.workerType, description: ctx.description });
          return { proceed: true };
        }),
      );

      workerHookIds.push(
        this.agent.context.hookRegistry.on('worker:tool-call', (ctx: any) => {
          this.logger.info(`[agent] [worker:${ctx.workerId}] [tool] ${ctx.toolName}`);
          this.emitStreaming({ sessionId: sessionKey, type: 'tool-call', workerId: ctx.workerId, workerType: ctx.workerType, tool: ctx.toolName, input: ctx.input });
          return { proceed: true };
        }),
      );

      workerHookIds.push(
        this.agent.context.hookRegistry.on('worker:tool-result', (ctx: any) => {
          this.emitStreaming({ sessionId: sessionKey, type: 'tool-result', workerId: ctx.workerId, workerType: ctx.workerType, tool: ctx.toolName, output: ctx.output });
          return { proceed: true };
        }),
      );

      workerHookIds.push(
        this.agent.context.hookRegistry.on('worker:reasoning', (ctx: any) => {
          this.emitStreaming({ sessionId: sessionKey, type: 'reasoning', text: ctx.text });
          return { proceed: true };
        }),
      );

      workerHookIds.push(
        this.agent.context.hookRegistry.on('worker:complete', (ctx: any) => {
          const status = ctx.success ? 'completed' : 'failed';
          this.logger.info(`[agent] [worker:${ctx.workerId}] ${ctx.workerType} ${status} (${ctx.duration}ms)${ctx.error ? ` — ${ctx.error}` : ''}`);
          this.emitStreaming({ sessionId: sessionKey, type: 'worker-complete', workerId: ctx.workerId, workerType: ctx.workerType, success: ctx.success, error: ctx.error, duration: ctx.duration });
          return { proceed: true };
        }),
      );

      // Notify streaming subscribers that execution has started
      this.emitStreaming({ sessionId: sessionKey, type: 'start' });

      try {
        const result = await this.agent.dispatch(channelMessage.content, {
          chatId: sessionKey,
          abortSignal: abortController.signal,
          onPhase: (phase, message) => {
            this.logger.info(`[agent] [${phase}] ${message}`);
          },
          onReasoning: (text) => {
            this.emitStreaming({ sessionId: sessionKey, type: 'reasoning', text });
          },
          onText: (text) => {
            this.emitStreaming({ sessionId: sessionKey, type: 'text-delta', text });
          },
          onTool: (tool, input) => {
            const summary = formatToolInput(tool, input);
            this.logger.info(`[agent] [tool] ${tool} ${summary}`);
            this.emitStreaming({ sessionId: sessionKey, type: 'tool-call', tool, input });
          },
          onToolResult: (tool, output) => {
            const summary = formatToolResult(tool, output);
            this.logger.info(`[agent] [tool-result] ${tool} → ${summary}`);
            this.emitStreaming({ sessionId: sessionKey, type: 'tool-result', tool, output });
          },
        });

        // 优先使用 finalText（最后一次工具调用后的文本）
        const replyText = (result as any).finalText
          || result.text
          || (result.success ? '任务完成' : `任务失败：${result.error || '未知错误'}`);

        this.logger.info(`[agent] completed (${result.duration}ms)`);
        this.logger.info(`[agent] [response] ${replyText}`);

        await this.pushToChannel(channelMessage.metadata?.channelId as string | undefined, channelMessage.to?.id as string | undefined, replyText, replyType);

        this.emitStreaming({ sessionId: sessionKey, type: 'complete', success: !abortController.signal.aborted, cancelled: abortController.signal.aborted });

        this.logger.info(`[server] Agent response sent to channel (format: ${replyType})`);
      } finally {
        for (const hookId of workerHookIds) {
          this.agent.context.hookRegistry.off(hookId);
        }
        this.activeAbortControllers.delete(sessionKey);
      }
    } catch (error) {
      this.logger.error(`[server] Agent workflow failed:`, error);
      const errorMsg = error instanceof Error ? error.message : '未知错误';

      await this.pushToChannel(channelMessage.metadata?.channelId as string | undefined, channelMessage.to?.id as string | undefined, `处理失败：${errorMsg}`, replyType);

      const isAborted = error instanceof DOMException && error.name === 'AbortError';
      this.emitStreaming({ sessionId: sessionKey, type: 'complete', success: false, cancelled: isAborted, error: errorMsg });
    }
  }

  // ============================================
  // ScheduleEngine（修复死代码：直接调用替代 bus.emit）
  // ============================================

  private async initScheduleEngine(): Promise<void> {
    try {
      const { resolve } = await import('path');
      const dbPath = this._dbPath || resolve(process.cwd(), '.hive/hive.db');
      const dbManager = createDatabase({ dbPath });
      await dbManager.initialize();
      this.dbManager = dbManager;
      const scheduleRepo = createScheduleRepository(dbManager.getDb());

      const engine = createScheduleEngine(scheduleRepo, async ({ schedule: task }) => {
        this.logger.info(`[scheduler] Executing schedule: ${task.name}`);
        try {
          const result = (await this.agent.dispatch(task.prompt, { chatId: undefined })).text;
          this.logger.info(`[scheduler] Schedule "${task.name}" completed`);

          this.handleScheduleCompleted({
            scheduleId: task.id,
            result,
            status: 'success',
            consecutiveErrors: 0,
            notifyConfig: task.notifyConfig,
            scheduleName: task.name,
          });

          return { sessionId: '', success: true };
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          this.logger.error(`[scheduler] Schedule "${task.name}" failed: ${msg}`);

          this.handleScheduleCompleted({
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

  /** 处理定时任务完成通知（原 subscribeScheduleHandlers 逻辑） */
  private handleScheduleCompleted(payload: {
    scheduleId: string;
    result?: string;
    status: 'success' | 'failed';
    consecutiveErrors: number;
    notifyConfig?: { mode: string; channel?: string; to?: string; bestEffort?: boolean };
    scheduleName: string;
  }): void {
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

    this.pushToChannel(target.channelId, target.chatId, content, 'markdown').catch(() => {});
    this.logger.info(`[schedule:notify] Pushed result to ${target.channelId}/${target.chatId}: ${payload.scheduleName}`);
  }

  // ============================================
  // Heartbeat
  // ============================================

  private startHeartbeat(): void {
    const config = this._heartbeatConfig!;
    this.heartbeatScheduler = new HeartbeatScheduler({
      agent: this.agent,
      config: { intervalMs: config.intervalMs, model: config.model, prompt: config.prompt },
      logger: this.logger,
    });
    this.heartbeatScheduler.start();
  }
}

// ============================================
// 工厂函数
// ============================================

/**
 * 创建 Server 实例
 *
 * 统一的入口，将 Agent、数据库、定时任务引擎、插件、Channel、心跳
 * 收拢到一个 Server 实例中。调用 `start()` 启动，`stop()` 停止。
 */
export function createServer(options: ServerOptions): Server {
  const logger = options.logger ?? noopLogger;
  const channelContext = new ChannelContext();

  // 创建 WorkspaceManager 并在 start() 时初始化
  const dbPath = options.dbPath;
  const workspaceManager = createWorkspaceManager(
    dbPath ? { path: dbPath.replace(/\/hive\.db$/, '') } : undefined,
  );

  // 阶段 1: 同步探测基础环境信息，注入到 Agent 的 system prompt
  const environmentContext = probeEnvironment();

  // 阶段 2: 异步全量 PATH 扫描，存入 SQLite（不阻塞启动）
  if (dbPath) {
    scanEnvironment(dbPath)
      .then(async () => {
        try {
          const Database = (await import('better-sqlite3')).default;
          const db = new Database(dbPath, { readonly: true });
          try {
            const rows = db.prepare(
              'SELECT category, COUNT(*) as count FROM env_tools GROUP BY category ORDER BY count DESC',
            ).all() as Array<{ category: string; count: number }>;

            const nativeAppNames = db.prepare(
              'SELECT name FROM env_tools WHERE category = ? ORDER BY name LIMIT 8',
            ).all('native-app') as Array<{ name: string }>;

            if (rows.length > 0) {
              const parts = rows.map(r => {
                if (r.category === 'native-app' && nativeAppNames.length > 0) {
                  const examples = nativeAppNames.map(n => n.name).join(', ');
                  return `${r.category} (${r.count}: ${examples})`;
                }
                return `${r.category} (${r.count})`;
              });
              environmentContext.categorySummary = parts.join(', ');
            }
          } finally {
            db.close();
          }
        } catch (err) {
          logger.warn(`[server] Failed to read category summary: ${err instanceof Error ? err.message : err}`);
        }
      })
      .catch((err: unknown) => {
        logger.warn(`[server] Phase 2 environment scan failed: ${err instanceof Error ? err.message : err}`);
      });
  }

  const agent = createAgent({
    externalConfig: options.config.externalConfig,
    sessionConfig: { workspaceManager },
    dbPath,
    environmentContext,
  });

  // Inject dbPath into ToolRegistry so env-tool can query SQLite
  if (dbPath) {
    agent.context.runner.getToolRegistry().setEnvDbProvider(() => dbPath);
  }

  const server = new ServerImpl(agent, logger, channelContext);
  server.setOptions(options);
  server._workspaceManager = workspaceManager;
  return server;
}

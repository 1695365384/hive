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
  createGoalRepository,
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
import { FileMemory } from '../memory/FileMemory.js';
import { setRememberCallback } from '../tools/built-in/remember-tool.js';
import { SessionId } from './SessionId.js';
import { ArtifactEmitter } from '../artifacts/ArtifactEmitter.js';
import {
  inferOfficeProgressPhase,
} from '../agents/completion/office-visual-contract.js';
import {
  decideWorkerFinalizations,
  type OpenWorker,
} from '../agents/completion/office-worker-finalize.js';
import { createGoalStore, type GoalStore } from '../agents/completion/GoalStore.js';
import {
  resolveIdleContinuation,
  isIncompleteGoal,
  MAX_GOAL_CONTINUES,
} from '../agents/completion/TodoEnforcer.js';
import { blockedActions } from '../agents/completion/discipline.js';
import type { TaskProgressEvent } from '../agents/completion/types.js';
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
  private activeDispatchSessionId: string | null = null;
  private goalStore: GoalStore = createGoalStore();
  private streamingHandlers: Set<StreamingHandler> = new Set();
  private fileHandlers: Set<FileHandler> = new Set();
  private artifactEmitter: ArtifactEmitter;

  /** Per-session open workers (awaiting worker-complete) */
  private openWorkersBySession: Map<string, Map<string, OpenWorker>> = new Map();
  private sessionLastUxHeartbeatAt = new Map<string, number>();
  /** Last streaming activity timestamp per session */
  private sessionLastActivityAt: Map<string, number> = new Map();
  /** Heartbeat pollers */
  private sessionHeartbeatTimers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private static readonly WORKER_SILENCE_MS = 30_000;
  private static readonly UX_HEARTBEAT_MS = 8_000;

  /** Reasoning 防抖状态：sessionId → { buffer, timer, workerId?, workerType? } */
  private reasoningBuffers: Map<string, { buffer: string; timer: ReturnType<typeof setTimeout>; workerId?: string; workerType?: string }> = new Map();

  /** WorkspaceManager — 由 createServer() 创建，在 start() 中初始化 */
  _workspaceManager: WorkspaceManager | undefined;

  /** 文件型记忆存储（由 start() 初始化） */
  private _fileMemory: FileMemory | undefined;

  constructor(
    agent: Agent,
    logger: ILogger,
    channelContext: ChannelContext,
  ) {
    this.agent = agent;
    this.logger = logger;
    this.channelContext = channelContext;
    this.artifactEmitter = new ArtifactEmitter(
      (event) => this.emitFileEvent(event),
      logger,
    );
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
      // Keep Goal resumable via Continue — also push blocked UX to the client.
      if (isIncompleteGoal(this.goalStore.get(sessionId))) {
        this.markGoalBlockedForResume(sessionId, ['已中断，可继续完成']);
      }
    }
  }

  async continueGoal(sessionId: string): Promise<{ ok: boolean; error?: string; threadId?: string }> {
    const goal = this.goalStore.get(sessionId);
    const decision = resolveIdleContinuation(goal, {
      inFlight: this.activeAbortControllers.has(sessionId),
    });
    if (decision.action === 'noop') {
      return { ok: false, error: 'No incomplete Goal to continue' };
    }
    if (decision.action === 'busy') {
      return { ok: false, error: 'Goal is already running' };
    }
    if (decision.action === 'exhausted') {
      return { ok: false, error: 'Continue budget exhausted for this Goal' };
    }

    const parsed = SessionId.parse(sessionId);
    const threadId = parsed?.recipientId ?? sessionId;
    const channelId = parsed?.channelId ?? 'ws-chat';

    this.goalStore.bumpContinueAttempts(sessionId);
    this.goalStore.markActive(sessionId);
    const attempts = this.goalStore.get(sessionId)?.continueAttempts ?? 1;
    this.emitTaskProgress(sessionId, {
      phase: 'continue',
      message: `继续完成同一目标 (${attempts}/${MAX_GOAL_CONTINUES})`,
      reasons: goal?.reasons,
      attempt: attempts,
      maxAttempts: MAX_GOAL_CONTINUES,
    });

    this.handleMessage({
      id: crypto.randomUUID(),
      content: decision.prompt,
      type: 'text',
      from: { id: 'desktop-user', type: 'user' },
      to: { id: threadId, type: 'user' },
      timestamp: Date.now(),
      metadata: {
        channelId,
        continueGoal: true,
      },
    });

    return { ok: true, threadId };
  }

  cancelGoal(sessionId: string): { ok: boolean; error?: string } {
    if (this.activeAbortControllers.has(sessionId)) {
      this.abort(sessionId);
    }
    const goal = this.goalStore.get(sessionId);
    if (!goal) {
      return { ok: true };
    }
    this.goalStore.markCancelled(sessionId);
    this.goalStore.clear(sessionId);
    this.emitTaskProgress(sessionId, {
      phase: 'done',
      message: '已取消目标',
    });
    return { ok: true };
  }

  getGoal(sessionId: string) {
    return this.goalStore.get(sessionId);
  }

  getActiveDispatchSessionId(): string | null {
    return this.activeDispatchSessionId;
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
  // Reasoning 防抖合并
  // ============================================

  /**
   * 带防抖的 reasoning 发送：合并短时间内的多个 reasoning delta 为一条消息。
   * 减少前端 UI 上的碎片化思考气泡。
   */
  private emitReasoningDebounced(
    sessionId: string,
    text: string,
    workerId?: string,
    workerType?: string,
  ): void {
    const existing = this.reasoningBuffers.get(sessionId);

    if (existing) {
      // 追加到已有 buffer
      existing.buffer += text;
      // 重置定时器
      clearTimeout(existing.timer);
      existing.timer = setTimeout(() => this.flushReasoning(sessionId), 300);
    } else {
      // 新建 buffer
      const timer = setTimeout(() => this.flushReasoning(sessionId), 300);
      this.reasoningBuffers.set(sessionId, { buffer: text, timer, workerId, workerType });
    }
  }

  /** 刷新 reasoning buffer，发送合并后的消息 */
  private flushReasoning(sessionId: string): void {
    const entry = this.reasoningBuffers.get(sessionId);
    if (!entry || !entry.buffer.trim()) {
      this.reasoningBuffers.delete(sessionId);
      return;
    }

    const event: StreamingEventUnion = {
      sessionId,
      type: 'reasoning',
      text: entry.buffer.trim(),
      ...(entry.workerId && { workerId: entry.workerId }),
      ...(entry.workerType && { workerType: entry.workerType }),
    };

    this.emitStreaming(event);
    this.reasoningBuffers.delete(sessionId);
  }

  /** 会话结束时刷新残留的 reasoning buffer */
  private flushAllReasoning(sessionId: string): void {
    this.flushReasoning(sessionId);
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
      // 初始化文件型记忆存储
      const rootPath = this._workspaceManager.getRootPath();
      this._fileMemory = new FileMemory(rootPath);
      // 注册 remember 工具回调（读取当前 agent context 中的 userId）
      setRememberCallback(async (content: string) => {
        const ctx = this.agent.context;
        if (ctx.currentUserId && ctx.fileMemory) {
          await ctx.fileMemory.appendMemory(ctx.currentUserId, content);
        } else {
          throw new Error('No active user session for memory');
        }
      });
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
    this.sessionLastActivityAt.set(event.sessionId, Date.now());
    for (const handler of this.streamingHandlers) {
      try { handler(event); } catch (e) { this.logger.error('[server] StreamingHandler error:', e); }
    }
  }

  private emitOfficeProgress(
    sessionId: string,
    progress: {
      phase: 'routed' | 'creating' | 'adding_slide' | 'validating' | 'delivering' | 'blocked';
      slide?: number;
      slideTotal?: number;
      message?: string;
      workerId?: string;
    },
  ): void {
    this.logger.info(`[agent] [office-progress] ${progress.phase}${progress.message ? `: ${progress.message}` : ''}`);
    this.emitStreaming({
      sessionId,
      type: 'office-progress',
      phase: progress.phase,
      slide: progress.slide,
      slideTotal: progress.slideTotal,
      message: progress.message,
      workerId: progress.workerId,
    });
  }

  /** Mark Goal blocked and emit clickable Continue/Cancel actions to the UI. */
  private markGoalBlockedForResume(sessionId: string, reasons: string[]): void {
    this.goalStore.markBlocked(sessionId, reasons);
    this.emitTaskProgress(sessionId, {
      phase: 'blocked',
      message: '任务未完成，可继续',
      reasons,
      actions: blockedActions(),
    });
  }

  private emitTaskProgress(
    sessionId: string,
    progress: {
      phase: 'understand' | 'plan' | 'execute' | 'verify' | 'continue' | 'blocked' | 'done';
      message?: string;
      reasons?: string[];
      actions?: Array<{ id: 'continue' | 'cancel' | 'provide-info'; label: string }>;
      attempt?: number;
      maxAttempts?: number;
    },
  ): void {
    this.logger.info(`[agent] [task-progress] ${progress.phase}${progress.message ? `: ${progress.message}` : ''}`);
    this.emitStreaming({
      sessionId,
      type: 'task-progress',
      phase: progress.phase,
      message: progress.message,
      reasons: progress.reasons,
      actions: progress.actions,
      attempt: progress.attempt,
      maxAttempts: progress.maxAttempts,
    });
  }

  private trackWorkerStart(sessionId: string, workerId: string, workerType: string): void {
    let map = this.openWorkersBySession.get(sessionId);
    if (!map) {
      map = new Map();
      this.openWorkersBySession.set(sessionId, map);
    }
    map.set(workerId, { workerId, workerType });
  }

  private trackWorkerComplete(sessionId: string, workerId: string): void {
    this.openWorkersBySession.get(sessionId)?.delete(workerId);
  }

  private startSessionHeartbeat(sessionId: string): void {
    this.clearSessionHeartbeat(sessionId);
    this.sessionLastActivityAt.set(sessionId, Date.now());
    const timer = setInterval(() => {
      const last = this.sessionLastActivityAt.get(sessionId) ?? 0;
      const silentMs = Date.now() - last;
      const inFlight = this.activeAbortControllers.has(sessionId);
      if (!inFlight) return;

      // Soft UX pulse when stream is quiet but turn still alive (throttled)
      if (silentMs >= ServerImpl.UX_HEARTBEAT_MS) {
        const lastBeat = this.sessionLastUxHeartbeatAt.get(sessionId) ?? 0;
        if (Date.now() - lastBeat >= ServerImpl.UX_HEARTBEAT_MS) {
          this.sessionLastUxHeartbeatAt.set(sessionId, Date.now());
          this.emitStreaming({
            sessionId,
            type: 'heartbeat',
            message: '仍在处理，请稍候…',
            silentMs,
          });
        }
      }

      // Hang while dispatch alive but no stream for 30s → force-fail open workers
      if (silentMs >= ServerImpl.WORKER_SILENCE_MS) {
        const open = [...(this.openWorkersBySession.get(sessionId)?.values() ?? [])];
        if (open.length === 0) return;
        this.logger.warn(`[server] worker heartbeat timeout for ${sessionId} (${open.length} open)`);
        this.finalizeOpenWorkers(sessionId, 'heartbeat_timeout');
      }
    }, 5_000);
    this.sessionHeartbeatTimers.set(sessionId, timer);
  }

  private clearSessionHeartbeat(sessionId: string): void {
    const t = this.sessionHeartbeatTimers.get(sessionId);
    if (t) clearInterval(t);
    this.sessionHeartbeatTimers.delete(sessionId);
    this.sessionLastUxHeartbeatAt.delete(sessionId);
  }

  private finalizeOpenWorkers(
    sessionId: string,
    reason: 'turn_end' | 'heartbeat_timeout',
    opts?: { turnError?: string; hasOfficeArtifact?: boolean },
  ): void {
    const map = this.openWorkersBySession.get(sessionId);
    if (!map || map.size === 0) return;
    const open = [...map.values()];
    const decisions = decideWorkerFinalizations(open, {
      reason,
      turnError: opts?.turnError,
      hasOfficeArtifact: opts?.hasOfficeArtifact,
    });
    for (const d of decisions) {
      this.emitStreaming({
        sessionId,
        type: 'worker-complete',
        workerId: d.workerId,
        workerType: d.workerType,
        success: d.success,
        error: d.error,
        duration: 0,
      });
      map.delete(d.workerId);
    }
  }

  private maybeEmitOfficeToolProgress(
    sessionId: string,
    toolName: string,
    input: unknown,
    workerId?: string,
    workerType?: string,
  ): void {
    if (workerType && workerType !== 'office') return;
    const phase = inferOfficeProgressPhase(toolName, input);
    if (!phase) return;
    this.emitOfficeProgress(sessionId, { phase, workerId });
  }

  /**
   * Shared tool-call forwarder — used by BOTH worker hooks and coordinator callbacks.
   * Eliminates the previous duplication where the two paths independently mapped
   * tool events to streaming events.
   */
  private forwardToolCall(sessionId: string, toolName: string, input: unknown, workerId?: string, workerType?: string): void {
    const summary = formatToolInput(toolName, input);
    this.logger.info(`[agent] [tool] ${toolName} ${summary}`);
    this.emitStreaming({ sessionId, type: 'tool-call', tool: toolName, input, workerId, workerType } as StreamingEventUnion);
    this.maybeEmitOfficeToolProgress(sessionId, toolName, input, workerId, workerType);
  }

  /**
   * Shared tool-result forwarder — used by BOTH worker hooks and coordinator callbacks.
   * Same unification as forwardToolCall.
   */
  private forwardToolResult(sessionId: string, toolName: string, output: unknown, workerId?: string, workerType?: string): void {
    const summary = formatToolResult(toolName, output);
    this.logger.info(`[agent] [tool-result] ${toolName} → ${summary}`);
    this.emitStreaming({ sessionId, type: 'tool-result', tool: toolName, output, workerId, workerType } as StreamingEventUnion);
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
      if (channelId === 'ws-chat') {
        this.logger.info(`[message:response] Desktop: streaming events handle delivery (pushToChannel is no-op for text)`);
      } else {
        this.logger.info(`[message:response] Pushed to channel ${channelId} chat ${chatId}`);
      }
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
    const sessionKey = channelId ? SessionId.create(channelId, recipientId) : recipientId;

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

    // Force-push Office docs into Desktop chat (Preview card) even if send-file was skipped
    this.agent.context.onDeliverArtifacts = (filePaths: string[]) => {
      this.artifactEmitter.deliverPaths(sessionKey, filePaths);
    };

    // 设置记忆上下文（用于 dispatch 前后注入/保存记忆）
    const userId = channelMessage.from?.id;
    if (userId && this._fileMemory) {
      this.agent.context.currentUserId = userId;
      this.agent.context.fileMemory = this._fileMemory;
    }

    try {
      const abortController = new AbortController();
      this.activeAbortControllers.set(sessionKey, abortController);
      this.activeDispatchSessionId = sessionKey;

      // GoalStore: fresh user turns replace Goal; Continue keeps the same Goal text
      const isContinue = Boolean(channelMessage.metadata?.continueGoal);
      if (isContinue) {
        this.goalStore.ensure(sessionKey, channelMessage.content);
      } else {
        this.goalStore.start(sessionKey, channelMessage.content);
      }

      // 订阅 Worker 事件并转发到流式回调
      const workerHookIds: string[] = [];

      workerHookIds.push(
        this.agent.context.hookRegistry.on('worker:start', (ctx: any) => {
          this.logger.info(`[agent] [worker:${ctx.workerId}] ${ctx.workerType} started${ctx.description ? `: ${ctx.description}` : ''}`);
          this.trackWorkerStart(sessionKey, ctx.workerId, ctx.workerType);
          this.emitStreaming({
            sessionId: sessionKey,
            type: 'worker-start',
            workerId: ctx.workerId,
            workerType: ctx.workerType,
            description: ctx.description,
            scenarioId: ctx.scenarioId,
          });
          return { proceed: true };
        }),
      );

      workerHookIds.push(
        this.agent.context.hookRegistry.on('worker:tool-call', (ctx: any) => {
          this.forwardToolCall(sessionKey, ctx.toolName, ctx.input, ctx.workerId, ctx.workerType);
          return { proceed: true };
        }),
      );

      workerHookIds.push(
        this.agent.context.hookRegistry.on('worker:tool-result', (ctx: any) => {
          this.forwardToolResult(sessionKey, ctx.toolName, ctx.output, ctx.workerId, ctx.workerType);
          if (ctx.toolName) {
            this.artifactEmitter.scanToolResult(sessionKey, ctx.toolName, ctx.input, ctx.output);
          }
          return { proceed: true };
        }),
      );

      workerHookIds.push(
        this.agent.context.hookRegistry.on('tool:after', (ctx: any) => {
          if (ctx.sessionId === sessionKey && ctx.toolName) {
            this.artifactEmitter.scanToolResult(sessionKey, ctx.toolName, ctx.input, ctx.output);
          }
          return { proceed: true };
        }),
      );

      workerHookIds.push(
        this.agent.context.hookRegistry.on('worker:reasoning', (ctx: any) => {
          this.emitReasoningDebounced(sessionKey, ctx.text, ctx.workerId, ctx.workerType);
          return { proceed: true };
        }),
      );

      workerHookIds.push(
        this.agent.context.hookRegistry.on('worker:complete', (ctx: any) => {
          const status = ctx.success ? 'completed' : 'failed';
          this.logger.info(`[agent] [worker:${ctx.workerId}] ${ctx.workerType} ${status} (${ctx.duration}ms)${ctx.error ? ` — ${ctx.error}` : ''}`);
          this.trackWorkerComplete(sessionKey, ctx.workerId);
          this.emitStreaming({ sessionId: sessionKey, type: 'worker-complete', workerId: ctx.workerId, workerType: ctx.workerType, success: ctx.success, error: ctx.error, duration: ctx.duration });
          return { proceed: true };
        }),
      );

      // Notify streaming subscribers that execution has started
      this.emitStreaming({ sessionId: sessionKey, type: 'start' });
      this.startSessionHeartbeat(sessionKey);

      try {
        const result = await this.agent.dispatch(channelMessage.content, {
          chatId: sessionKey,
          abortSignal: abortController.signal,
          onPhase: (phase, message) => {
            this.logger.info(`[agent] [${phase}] ${message}`);
          },
          onRoute: (route) => {
            this.logger.info(
              `[agent] [route] ${route.mode}` +
                `${route.scenarioId ? ` scenario=${route.scenarioId}` : ''}` +
                `${route.workerType ? ` worker=${route.workerType}` : ''}` +
                `${route.workerTypes?.length ? ` workers=${route.workerTypes.join('+')}` : ''}`,
            );
            this.emitStreaming({
              sessionId: sessionKey,
              type: 'route',
              mode: route.mode,
              scenarioId: route.scenarioId,
              workerType: route.workerType,
              workerTypes: route.workerTypes,
              title: route.title,
            });
            // routed progress is emitted via onOfficeProgress from Coordinator on office delegate
          },
          onSkill: (skill) => {
            this.logger.info(`[agent] [skill] loaded skill=${skill.name}`);
            this.emitStreaming({
              sessionId: sessionKey,
              type: 'skill',
              name: skill.name,
              description: skill.description,
            });
          },
          onOfficeProgress: (progress) => {
            this.emitOfficeProgress(sessionKey, progress);
          },
          onTaskProgress: (progress: TaskProgressEvent) => {
            // After user cancel, ignore late "done" pulses from the dying turn.
            if (abortController.signal.aborted && progress.phase === 'done') {
              const reasons = progress.reasons?.length
                ? progress.reasons
                : ['已中断，可继续完成'];
              this.markGoalBlockedForResume(sessionKey, reasons);
              return;
            }
            this.goalStore.updateFromProgress(sessionKey, progress);
            this.emitTaskProgress(sessionKey, progress);
          },
          onReasoning: (text) => {
            this.emitReasoningDebounced(sessionKey, text);
          },
          onText: (text) => {
            this.emitStreaming({ sessionId: sessionKey, type: 'text-delta', text });
          },
          onTool: (tool, input) => {
            this.forwardToolCall(sessionKey, tool, input);
          },
          onToolResult: (tool, output) => {
            this.forwardToolResult(sessionKey, tool, output);
          },
        });

        // 优先使用 finalText（最后一次工具调用后的文本）
        const replyText = (result as any).finalText
          || result.text
          || (result.success ? '任务完成' : `任务失败：${result.error || '未知错误'}`);

        this.logger.info(`[agent] completed (${result.duration}ms)`);
        this.logger.info(`[agent] [response] ${replyText}`);

        await this.pushToChannel(channelMessage.metadata?.channelId as string | undefined, channelMessage.to?.id as string | undefined, replyText, replyType);

        this.finalizeOpenWorkers(sessionKey, 'turn_end', {
          turnError: result.success ? undefined : (result.error || 'failed'),
          hasOfficeArtifact: !!result.success,
        });

        // Sync GoalStore from completion verification when progress events were skipped.
        // Cancelled turns must stay blocked/resumable — never markDone after abort.
        const cancelled = abortController.signal.aborted;
        const verification = (result as { verification?: { passed: boolean; results?: Array<{ message: string }> } }).verification;
        if (cancelled) {
          if (isIncompleteGoal(this.goalStore.get(sessionKey))) {
            const existing = this.goalStore.get(sessionKey);
            const reasons = existing?.reasons?.length
              ? existing.reasons
              : ['已中断，可继续完成'];
            this.markGoalBlockedForResume(sessionKey, reasons);
          }
        } else if (verification) {
          if (verification.passed) {
            this.goalStore.markDone(sessionKey);
          } else if (isIncompleteGoal(this.goalStore.get(sessionKey))) {
            const reasons = (verification.results ?? [])
              .filter((r) => r && (r as { passed?: boolean }).passed === false)
              .map((r) => r.message)
              .filter(Boolean);
            this.markGoalBlockedForResume(sessionKey, reasons.length ? reasons : ['完成校验未通过']);
          }
        } else if (result.success) {
          this.goalStore.markDone(sessionKey);
        }

        this.emitStreaming({ sessionId: sessionKey, type: 'complete', success: result.success, cancelled, error: result.error, text: replyText });

        this.logger.info(`[server] Agent response sent to channel (format: ${replyType})`);
      } finally {
        this.flushAllReasoning(sessionKey);
        this.clearSessionHeartbeat(sessionKey);
        this.finalizeOpenWorkers(sessionKey, 'turn_end', { turnError: 'incomplete' });
        this.openWorkersBySession.delete(sessionKey);
        this.sessionLastActivityAt.delete(sessionKey);
        for (const hookId of workerHookIds) {
          this.agent.context.hookRegistry.off(hookId);
        }
        this.artifactEmitter.clearSession(sessionKey);
        this.agent.context.onDeliverArtifacts = undefined;
        this.activeAbortControllers.delete(sessionKey);
        if (this.activeDispatchSessionId === sessionKey) {
          this.activeDispatchSessionId = null;
        }
      }
    } catch (error) {
      this.logger.error(`[server] Agent workflow failed:`, error);
      const errorMsg = error instanceof Error ? error.message : '未知错误';

      await this.pushToChannel(channelMessage.metadata?.channelId as string | undefined, channelMessage.to?.id as string | undefined, `处理失败：${errorMsg}`, replyType);

      const isAborted =
        (error instanceof DOMException && error.name === 'AbortError')
        || (error instanceof Error && /abort/i.test(error.message));
      if (isAborted && isIncompleteGoal(this.goalStore.get(sessionKey))) {
        this.markGoalBlockedForResume(sessionKey, ['已中断，可继续完成']);
      }
      this.emitStreaming({ sessionId: sessionKey, type: 'complete', success: false, cancelled: isAborted, error: errorMsg });
    } finally {
      // 清除记忆上下文，避免影响下一次 dispatch
      this.agent.context.currentUserId = undefined;
      this.agent.context.fileMemory = undefined;
    }
  }

  // ============================================
  // ScheduleEngine（修复死代码：直接调用替代 bus.emit）
  // ============================================

  /**
   * Attach SQLite Goal persistence and restore incomplete Goals after restart.
   * Any in-memory "active" Goal becomes blocked (no in-flight work after restart).
   */
  private hydrateGoalsFromDb(db: import('better-sqlite3').Database): void {
    try {
      const goalRepo = createGoalRepository(db);
      this.goalStore.attachPersistence(goalRepo);
      const incomplete = goalRepo.loadIncomplete();
      const restored: typeof incomplete = [];
      for (const record of incomplete) {
        if (record.status === 'active') {
          record.status = 'blocked';
          record.reasons = record.reasons.length > 0
            ? record.reasons
            : ['进程重启，可继续完成'];
          record.updatedAt = Date.now();
          goalRepo.save(record);
        }
        restored.push(record);
      }
      this.goalStore.hydrate(restored);
      if (restored.length > 0) {
        this.logger.info(`[server] Restored ${restored.length} incomplete Goal(s) from disk`);
      }
    } catch (error) {
      this.logger.warn(`[server] Goal persistence unavailable: ${error instanceof Error ? error.message : error}`);
    }
  }

  private async initScheduleEngine(): Promise<void> {
    try {
      const { resolve } = await import('path');
      const dbPath = this._dbPath || resolve(process.cwd(), '.hive/hive.db');
      const dbManager = createDatabase({ dbPath });
      await dbManager.initialize();
      this.dbManager = dbManager;
      this.hydrateGoalsFromDb(dbManager.getDb());
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

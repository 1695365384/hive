/**
 * Agent 核心类 - 模块化架构
 *
 * 通过委托给能力模块实现所有功能
 */

import type {
  AgentContext,
  AgentInitOptions,
  ThoroughnessLevel,
  TimeoutConfig,
  HeartbeatConfig,
  HeartbeatTaskConfig,
  HeartbeatResult,
} from './types.js';
import type {
  NotificationType,
} from '../../hooks/types.js';
import { AgentContextImpl } from './AgentContext.js';
import { TimeoutDelegation, NotificationDelegation } from './notification.js';
import { TimeoutCapability } from '../capabilities/TimeoutCapability.js';
import { ProviderCapability } from '../capabilities/ProviderCapability.js';
import { SkillCapability } from '../capabilities/SkillCapability.js';
import { CoordinatorCapability } from '../capabilities/CoordinatorCapability.js';
import type { DispatchOptions, DispatchResult } from '../capabilities/CoordinatorCapability.js';
import type { ProviderConnectionTestResult } from '../capabilities/ProviderCapability.js';
import { SessionCapability } from '../capabilities/SessionCapability.js';
import { ScheduleCapability } from '../capabilities/ScheduleCapability.js';
import { SessionDelegation } from './session-delegation.js';
import { PackManager } from '../../vertical/PackManager.js';
import type { VerticalPack } from '../../vertical/types.js';
import type { Skill, SkillMatchResult, SkillSystemConfig } from '../../skills/index.js';
import type { ProviderConfig } from '../../providers/index.js';
import type { Session, Message } from '../../session/index.js';

/**
 * Agent 核心类
 *
 * 所有功能通过能力模块实现
 */
export class Agent {
  private _context: AgentContextImpl;
  private providerCap: ProviderCapability;
  private skillCap: SkillCapability;
  private coordinatorCap: CoordinatorCapability;
  private sessionCap: SessionCapability;
  private scheduleCap: ScheduleCapability;
  private sessionDelegation: SessionDelegation;
  private timeoutDelegation: TimeoutDelegation;
  private notificationDelegation: NotificationDelegation;
  /** Vertical Pack 管理器 */
  private packManager: PackManager = new PackManager();
  private initialized: boolean = false;
  private disposed: boolean = false;

  /**
   * 构造函数
   *
   * @param options - Agent 初始化选项
   */
  constructor(options: AgentInitOptions = {}) {
    const {
      externalConfig,
      skillConfig,
      sessionConfig,
      timeout: timeoutConfig,
      environmentContext,
    } = options;

    this._context = new AgentContextImpl({ externalConfig, skillConfig, timeoutConfig, environmentContext });

    // 创建能力模块
    this.providerCap = new ProviderCapability();
    this.skillCap = new SkillCapability();
    this.coordinatorCap = new CoordinatorCapability();
    this.sessionCap = new SessionCapability(sessionConfig);
    this.scheduleCap = new ScheduleCapability();
    this.sessionDelegation = new SessionDelegation(this.sessionCap);
    this.timeoutDelegation = new TimeoutDelegation(this._context);
    this.notificationDelegation = new NotificationDelegation(this._context);

    // 注册能力模块到上下文（使 getCapability() 可用）
    // 注意：注册顺序决定 initializeAsync 的调用顺序
    // session 必须先于 provider，因为 provider 的持久化依赖 session 的数据库
    this._context.registerCapability(this.sessionCap);
    this._context.registerCapability(this.providerCap);
    this._context.registerCapability(this.skillCap);
    this._context.registerCapability(this.coordinatorCap);
    this._context.registerCapability(this.scheduleCap);
  }

  /**
   * 获取 Agent 上下文
   *
   * 用于访问 hookRegistry 等共享资源
   */
  get context(): AgentContext {
    return this._context;
  }

  /**
   * 获取定时任务能力
   */
  get schedule(): ScheduleCapability {
    return this.scheduleCap;
  }

  // ============================================
  // Vertical Pack 系统
  // ============================================

  /**
   * 注册一个 Vertical Pack（必须在 initialize() 之前调用）
   *
   * 支持链式调用：
   * ```typescript
   * agent
   *   .use(new LegalPack())
   *   .use(new CompliancePack());
   * await agent.initialize();
   * ```
   *
   * @returns this（支持链式）
   */
  use(pack: VerticalPack): this {
    this.packManager.use(pack);
    return this;
  }

  /**
   * 卸载单个 Vertical Pack，精确移除它注册的全部资源
   *
   * 用于运行时切换垂直场景（如从法务场景切到医疗场景），
   * 或在命名冲突修复后热重载 pack。
   *
   * 注意：只能在 `initialize()` 之后、`dispose()` 之前调用。
   * 卸载后会清除该 pack 注册的工具/SubAgent/Capability/Hook/Skill。
   *
   * @param packId  要卸载的 pack id
   * @returns 是否成功卸载
   */
  async unuse(packId: string): Promise<boolean> {
    if (!this.initialized) {
      // 尚未初始化：直接从 PackManager 移除注册即可（资源尚未 apply）
      if (this.packManager.has(packId)) {
        // 复用 unloadPack 的清理逻辑，但 target 尚未 apply，归属表为空
        const removed = this.packManager.forceRemove(packId);
        return removed;
      }
      return false;
    }
    return this.packManager.unloadPack(packId, this._context, this);
  }

  /**
   * 获取 PackManager（用于查询已注册的 pack）
   */
  get packs(): PackManager {
    return this.packManager;
  }

  /**
   * 初始化
   *
   * 内部流程：
   * 1. apply 所有已注册的 Vertical Pack（注册 capability/tool/skill/hook/agent）
   * 2. initializeAll()（初始化所有 capability，含 pack 带的）
   */
  async initialize(): Promise<void> {
    if (!this.initialized) {
      // 先 apply packs，这样 pack 的 capability 能走正常的 init 流程
      await this.packManager.apply(this, this._context);
      await this._context.initializeAll();
      this.initialized = true;
    }
  }

  /**
   * 销毁 Agent
   *
   * 触发 session:end 和 capability:dispose hooks
   */
  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }

    // 保存会话
    await this.sessionCap.save();

    // 触发 session:end hook
    const sessionId = this._context.hookRegistry.getSessionId();
    await this._context.hookRegistry.emit('session:end', {
      sessionId,
      success: true,
      reason: 'Agent disposed',
      timestamp: new Date(),
      duration: 0, // 由调用者计算
    });

    // 销毁所有能力模块
    await this._context.disposeAll();

    // 销毁所有 Vertical Pack（反向顺序）
    await this.packManager.disposeAll();

    this.disposed = true;
  }

  // ============================================
  // 统一任务执行
  // ============================================

  /**
   * 统一任务分发 — 唯一的任务执行入口
   */
  async dispatch(task: string, options?: DispatchOptions): Promise<DispatchResult> {
    return this.coordinatorCap.run(task, options);
  }

  /**
   * 获取 TaskManager（用于管理活跃 Worker）
   */
  get taskManager() {
    return this.coordinatorCap.getTaskManager();
  }

  // ============================================
  // 提供商管理（委托给 ProviderCapability）
  // ============================================

  get currentProvider(): ProviderConfig | null {
    return this.providerCap.current;
  }

  listProviders(): ProviderConfig[] {
    return this.providerCap.listAll();
  }

  listPresets() {
    return this.providerCap.listPresets();
  }

  async listAllProviders() {
    return this.providerCap.listAllProviders();
  }

  async listProviderModels(providerId: string) {
    return this.providerCap.listProviderModels(providerId);
  }

  useProvider(name: string, apiKey?: string): boolean {
    return this.providerCap.useSync(name, apiKey);
  }

  /**
   * 测试 API key 是否有效（不切换当前配置）
   *
   * 构造临时配置发起最小化 LLM 调用，用于 UI 的「测试连接」按钮。
   */
  async testProviderConnection(
    providerId: string,
    apiKey: string,
    model?: string,
  ): Promise<ProviderConnectionTestResult> {
    return this.providerCap.testProviderConnection(providerId, apiKey, model);
  }

  // ============================================
  // 技能管理（委托给 SkillCapability）
  // ============================================

  listSkills(): Skill[] {
    return this.skillCap.listAll();
  }

  listSkillMetadata() {
    return this.skillCap.listMetadata();
  }

  getSkill(name: string): Skill | undefined {
    return this.skillCap.get(name);
  }

  matchSkill(input: string): SkillMatchResult | null {
    return this.skillCap.matchSync(input);
  }

  registerSkill(skill: Skill): void {
    this.skillCap.register(skill);
  }

  generateSkillInstruction(skill: Skill): string {
    return this.skillCap.generateInstruction(skill);
  }

  // ============================================
  // 会话管理（委托）
  // ============================================

  get currentSession(): Session | null {
    return this.sessionDelegation.currentSession;
  }

  async createSession(config?: { title?: string; providerId?: string; model?: string }): Promise<Session> {
    await this.initialize();
    return this.sessionDelegation.createSession(config);
  }

  async loadSession(sessionId: string): Promise<Session | null> {
    await this.initialize();
    return this.sessionDelegation.loadSession(sessionId);
  }

  async resumeLastSession(): Promise<Session | null> {
    await this.initialize();
    return this.sessionDelegation.resumeLastSession();
  }

  getSessionMessages(): Message[] {
    return this.sessionDelegation.getSessionMessages();
  }

  getFormattedHistory(): string {
    return this.sessionDelegation.getFormattedHistory();
  }

  async listSessions() {
    await this.initialize();
    return this.sessionDelegation.listSessions();
  }

  async deleteCurrentSession(): Promise<boolean> {
    return this.sessionDelegation.deleteCurrentSession();
  }

  // ============================================
  // 工作空间管理
  // ============================================

  // ============================================
  // 超时和心跳管理（委托）
  // ============================================

  get timeoutCap(): TimeoutCapability {
    return this.timeoutDelegation.timeoutCap;
  }

  startHeartbeat(config: HeartbeatConfig): void {
    this.timeoutDelegation.startHeartbeat(config);
  }

  stopHeartbeat(): void {
    this.timeoutDelegation.stopHeartbeat();
  }

  updateActivity(): void {
    this.timeoutDelegation.updateActivity();
  }

  isStalled(): boolean {
    return this.timeoutDelegation.isStalled();
  }

  getLastActivity(): number | null {
    return this.timeoutDelegation.getLastActivity();
  }

  getTimeoutConfig(): Required<TimeoutConfig> {
    return this.timeoutDelegation.getTimeoutConfig();
  }

  updateTimeoutConfig(config: Partial<TimeoutConfig>): void {
    this.timeoutDelegation.updateTimeoutConfig(config);
  }

  // ============================================
  // 心跳任务（Layer 2 原语）
  // ============================================

  /**
   * 执行一次心跳巡检
   *
   * SDK 层心跳原语，供宿主应用调度周期性任务。
   * 宿主应用负责调度（setInterval / node-cron / agenda 等）。
   *
   * @param config - 心跳任务配置
   * @returns 心跳结果
   */
  async runHeartbeatOnce(config?: HeartbeatTaskConfig): Promise<HeartbeatResult> {
    return this.timeoutDelegation.runHeartbeatOnce(
      async (prompt, opts) => (await this.dispatch(prompt, { modelId: opts?.modelId })).text,
      config
    );
  }

  // ============================================
  // 推送能力（便捷方法）
  // ============================================

  /**
   * 推送通知
   *
   * @param type - 通知类型
   * @param title - 通知标题
   * @param message - 通知内容
   * @param metadata - 可选元数据
   */
  async notify(
    type: NotificationType,
    title: string,
    message: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    return this.notificationDelegation.notify(type, title, message, metadata);
  }

  async updateProgress(
    taskId: string,
    progress: number,
    description: string,
    currentStep?: string,
    totalSteps?: number
  ): Promise<void> {
    return this.notificationDelegation.updateProgress(taskId, progress, description, currentStep, totalSteps);
  }

  async emitThinking(
    thought: string,
    type: 'analyzing' | 'planning' | 'executing' | 'reflecting',
    metadata?: Record<string, unknown>
  ): Promise<void> {
    return this.notificationDelegation.emitThinking(thought, type, metadata);
  }
}

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
import { SessionCapability } from '../capabilities/SessionCapability.js';
import { ScheduleCapability } from '../capabilities/ScheduleCapability.js';
import { ProgressCapability } from '../capabilities/ProgressCapability.js';
import { WorkflowCheckpointCapability } from '../capabilities/WorkflowCheckpointCapability.js';
import { SessionDelegation } from './session-delegation.js';
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
  private progressCap: ProgressCapability;
  private workflowCheckpointCap: WorkflowCheckpointCapability;
  private sessionDelegation: SessionDelegation;
  private timeoutDelegation: TimeoutDelegation;
  private notificationDelegation: NotificationDelegation;
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
    this.progressCap = new ProgressCapability();
    this.workflowCheckpointCap = new WorkflowCheckpointCapability({ dbPath: options.dbPath });
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
    this._context.registerCapability(this.progressCap);
    this._context.registerCapability(this.workflowCheckpointCap);
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

  /**
   * 初始化
   */
  async initialize(): Promise<void> {
    if (!this.initialized) {
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

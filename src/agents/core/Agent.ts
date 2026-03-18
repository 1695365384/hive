/**
 * Agent 核心类 - 模块化架构
 *
 * 通过委托给能力模块实现所有功能
 */

import type {
  AgentContext,
  AgentOptions,
  WorkflowOptions,
  WorkflowResult,
  TaskAnalysis,
  ThoroughnessLevel,
  AgentType,
  AgentResult,
} from './types.js';
import type { SessionStartHookContext, SessionEndHookContext, SessionErrorHookContext } from '../../hooks/types.js';
import { AgentContextImpl } from './AgentContext.js';
import { ProviderCapability } from '../capabilities/ProviderCapability.js';
import { SkillCapability } from '../capabilities/SkillCapability.js';
import { ChatCapability } from '../capabilities/ChatCapability.js';
import { SubAgentCapability } from '../capabilities/SubAgentCapability.js';
import { WorkflowCapability } from '../capabilities/WorkflowCapability.js';
import { SessionCapability } from '../capabilities/SessionCapability.js';
import type { Skill, SkillMatchResult, SkillSystemConfig } from '../../skills/index.js';
import type { ProviderConfig } from '../../providers/index.js';
import type { Session, Message } from '../../session/index.js';
import type { SessionCapabilityConfig } from '../capabilities/SessionCapability.js';
import type { WorkspaceInitConfig } from '../../workspace/index.js';

/**
 * Agent 核心类
 *
 * 所有功能通过能力模块实现
 */
export class Agent {
  private _context: AgentContextImpl;
  private providerCap: ProviderCapability;
  private skillCap: SkillCapability;
  private chatCap: ChatCapability;
  private subAgentCap: SubAgentCapability;
  private workflowCap: WorkflowCapability;
  private sessionCap: SessionCapability;
  private initialized: boolean = false;
  private disposed: boolean = false;

  constructor(
    skillConfig?: SkillSystemConfig,
    sessionConfig?: SessionCapabilityConfig,
    workspaceConfig?: WorkspaceInitConfig | string
  ) {
    this._context = new AgentContextImpl(skillConfig);

    // 处理工作空间配置
    let finalSessionConfig = sessionConfig;
    if (workspaceConfig) {
      const wsConfig: WorkspaceInitConfig = typeof workspaceConfig === 'string'
        ? { path: workspaceConfig }
        : workspaceConfig;

      finalSessionConfig = {
        ...sessionConfig,
        workspace: wsConfig,
      };
    }

    // 创建能力模块
    this.providerCap = new ProviderCapability();
    this.skillCap = new SkillCapability();
    this.chatCap = new ChatCapability();
    this.subAgentCap = new SubAgentCapability();
    this.workflowCap = new WorkflowCapability();
    this.sessionCap = new SessionCapability(finalSessionConfig);

    // 注册并立即初始化能力模块（同步初始化）
    this.providerCap.initialize(this._context);
    this.skillCap.initialize(this._context);
    this.chatCap.initialize(this._context);
    this.subAgentCap.initialize(this._context);
    this.workflowCap.initialize(this._context);
    this.sessionCap.initialize(this._context);
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
   * 初始化
   */
  async initialize(): Promise<void> {
    if (!this.initialized) {
      await this._context.initializeAll();
      // 初始化会话能力（异步部分）
      await this.sessionCap.initializeAsync();
      // 初始化提供商能力（配置持久化）
      await this.providerCap.initializeAsync();
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

  useProvider(name: string, apiKey?: string): boolean {
    return this.providerCap.useSync(name, apiKey);
  }

  isCCSwitchInstalled(): boolean {
    return this.providerCap.isCCSwitchInstalled();
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
  // 对话功能（委托给 ChatCapability）
  // ============================================

  async chat(prompt: string, options?: AgentOptions): Promise<string> {
    const sessionId = this._context.hookRegistry.getSessionId();
    const startTime = Date.now();

    // 触发 session:start hook
    await this._context.hookRegistry.emit('session:start', {
      sessionId,
      prompt,
      timestamp: new Date(),
    });

    try {
      const result = await this.chatCap.send(prompt, options);

      // 触发 session:end hook
      await this._context.hookRegistry.emit('session:end', {
        sessionId,
        success: true,
        timestamp: new Date(),
        duration: Date.now() - startTime,
      });

      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      // 触发 session:error hook
      await this._context.hookRegistry.emit('session:error', {
        sessionId,
        error: err,
        timestamp: new Date(),
        recoverable: false,
      });

      // 触发 session:end hook（失败）
      await this._context.hookRegistry.emit('session:end', {
        sessionId,
        success: false,
        reason: err.message,
        timestamp: new Date(),
        duration: Date.now() - startTime,
      });

      throw error;
    }
  }

  async chatStream(prompt: string, options?: AgentOptions): Promise<void> {
    const sessionId = this._context.hookRegistry.getSessionId();
    const startTime = Date.now();

    // 触发 session:start hook
    await this._context.hookRegistry.emit('session:start', {
      sessionId,
      prompt,
      timestamp: new Date(),
    });

    try {
      await this.chatCap.sendStream(prompt, options);

      // 触发 session:end hook
      await this._context.hookRegistry.emit('session:end', {
        sessionId,
        success: true,
        timestamp: new Date(),
        duration: Date.now() - startTime,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      // 触发 session:error hook
      await this._context.hookRegistry.emit('session:error', {
        sessionId,
        error: err,
        timestamp: new Date(),
        recoverable: false,
      });

      // 触发 session:end hook（失败）
      await this._context.hookRegistry.emit('session:end', {
        sessionId,
        success: false,
        reason: err.message,
        timestamp: new Date(),
        duration: Date.now() - startTime,
      });

      throw error;
    }
  }

  // ============================================
  // 子 Agent（委托给 SubAgentCapability）
  // ============================================

  async explore(prompt: string, thoroughness: ThoroughnessLevel = 'medium'): Promise<string> {
    return this.subAgentCap.explore(prompt, thoroughness);
  }

  async plan(prompt: string): Promise<string> {
    return this.subAgentCap.plan(prompt);
  }

  async general(prompt: string): Promise<string> {
    return this.subAgentCap.general(prompt);
  }

  async runSubAgent(name: AgentType, prompt: string): Promise<AgentResult> {
    return this.subAgentCap.run(name, prompt);
  }

  // 扩展 Agent 便捷方法
  async reviewCode(target: string): Promise<string> {
    return this.subAgentCap.reviewCode(target);
  }

  async generateTests(target: string): Promise<string> {
    return this.subAgentCap.generateTests(target);
  }

  async writeDocs(target: string): Promise<string> {
    return this.subAgentCap.writeDocs(target);
  }

  async debug(target: string): Promise<string> {
    return this.subAgentCap.debug(target);
  }

  async refactor(target: string): Promise<string> {
    return this.subAgentCap.refactor(target);
  }

  async securityAudit(target: string): Promise<string> {
    return this.subAgentCap.securityAudit(target);
  }

  // ============================================
  // 工作流（委托给 WorkflowCapability）
  // ============================================

  analyzeTask(task: string): TaskAnalysis {
    return this.workflowCap.analyzeTask(task);
  }

  async runWorkflow(task: string, options?: WorkflowOptions): Promise<WorkflowResult> {
    return this.workflowCap.run(task, options);
  }

  async preview(task: string, options?: WorkflowOptions): Promise<{
    analysis: TaskAnalysis;
    intelligentPrompt: string;
  }> {
    return this.workflowCap.preview(task, options);
  }

  // ============================================
  // 会话管理（委托给 SessionCapability）
  // ============================================

  /**
   * 获取当前会话
   */
  get currentSession(): Session | null {
    return this.sessionCap.getCurrentSession();
  }

  /**
   * 创建新会话
   */
  async createSession(config?: { title?: string; providerId?: string; model?: string }): Promise<Session> {
    await this.initialize();
    return this.sessionCap.createSession(config);
  }

  /**
   * 加载会话
   */
  async loadSession(sessionId: string): Promise<Session | null> {
    await this.initialize();
    return this.sessionCap.loadSession(sessionId);
  }

  /**
   * 恢复最近的会话
   */
  async resumeLastSession(): Promise<Session | null> {
    await this.initialize();
    return this.sessionCap.resumeLastSession();
  }

  /**
   * 获取会话消息历史
   */
  getSessionMessages(): Message[] {
    return this.sessionCap.getMessages();
  }

  /**
   * 获取格式化的会话历史
   */
  getFormattedHistory(): string {
    return this.sessionCap.getFormattedHistory();
  }

  /**
   * 列出所有会话
   */
  async listSessions() {
    await this.initialize();
    return this.sessionCap.listSessions();
  }

  /**
   * 删除当前会话
   */
  async deleteCurrentSession(): Promise<boolean> {
    return this.sessionCap.deleteCurrentSession();
  }

  // ============================================
  // 工作空间管理
  // ============================================

  /**
   * 获取工作空间管理器
   */
  getWorkspaceManager() {
    return this.sessionCap.getWorkspaceManager();
  }

  /**
   * 设置当前会话组
   */
  async setSessionGroup(group: string): Promise<void> {
    await this.initialize();
    await this.sessionCap.setSessionGroup(group);
  }

  /**
   * 获取当前会话组
   */
  getCurrentSessionGroup(): string {
    return this.sessionCap.getCurrentSessionGroup();
  }

  /**
   * 列出所有会话组
   */
  listSessionGroups() {
    return this.sessionCap.listSessionGroups();
  }
}

// ============================================
// 全局实例和便捷函数
// ============================================

/** 全局 Agent 实例 */
let globalAgent: Agent | null = null;

/** 获取全局 Agent 实例 */
export function getAgent(): Agent {
  if (!globalAgent) {
    globalAgent = new Agent();
  }
  return globalAgent;
}

/** 创建新的 Agent 实例 */
export function createAgent(
  skillConfig?: SkillSystemConfig,
  sessionConfig?: SessionCapabilityConfig,
  workspaceConfig?: WorkspaceInitConfig | string
): Agent {
  return new Agent(skillConfig, sessionConfig, workspaceConfig);
}

/** 快速对话 */
export async function ask(prompt: string, options?: AgentOptions): Promise<string> {
  return getAgent().chat(prompt, options);
}

/** 快速探索 */
export async function explore(prompt: string, thoroughness: ThoroughnessLevel = 'medium'): Promise<string> {
  return getAgent().explore(prompt, thoroughness);
}

/** 快速计划 */
export async function plan(prompt: string): Promise<string> {
  return getAgent().plan(prompt);
}

/** 快速执行通用任务 */
export async function general(prompt: string): Promise<string> {
  return getAgent().general(prompt);
}

/** 快速执行工作流 */
export async function runWorkflow(task: string, options?: WorkflowOptions): Promise<WorkflowResult> {
  return getAgent().runWorkflow(task, options);
}

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
import { AgentContextImpl } from './AgentContext.js';
import { ProviderCapability } from '../capabilities/ProviderCapability.js';
import { SkillCapability } from '../capabilities/SkillCapability.js';
import { ChatCapability } from '../capabilities/ChatCapability.js';
import { SubAgentCapability } from '../capabilities/SubAgentCapability.js';
import { WorkflowCapability } from '../capabilities/WorkflowCapability.js';
import type { Skill, SkillMatchResult, SkillSystemConfig } from '../../skills/index.js';
import type { ProviderConfig } from '../../providers/index.js';

/**
 * Agent 核心类
 *
 * 所有功能通过能力模块实现
 */
export class Agent {
  private context: AgentContextImpl;
  private providerCap: ProviderCapability;
  private skillCap: SkillCapability;
  private chatCap: ChatCapability;
  private subAgentCap: SubAgentCapability;
  private workflowCap: WorkflowCapability;
  private initialized: boolean = false;

  constructor(skillConfig?: SkillSystemConfig) {
    this.context = new AgentContextImpl(skillConfig);

    // 创建能力模块
    this.providerCap = new ProviderCapability();
    this.skillCap = new SkillCapability();
    this.chatCap = new ChatCapability();
    this.subAgentCap = new SubAgentCapability();
    this.workflowCap = new WorkflowCapability();

    // 注册并立即初始化能力模块（同步初始化）
    this.providerCap.initialize(this.context);
    this.skillCap.initialize(this.context);
    this.chatCap.initialize(this.context);
    this.subAgentCap.initialize(this.context);
    this.workflowCap.initialize(this.context);
  }

  /**
   * 初始化
   */
  async initialize(): Promise<void> {
    if (!this.initialized) {
      await this.context.initializeAll();
      this.initialized = true;
    }
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
    return this.providerCap.use(name, apiKey);
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
    return this.skillCap.match(input);
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
    return this.chatCap.send(prompt, options);
  }

  async chatStream(prompt: string, options?: AgentOptions): Promise<void> {
    return this.chatCap.sendStream(prompt, options);
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
export function createAgent(skillConfig?: SkillSystemConfig): Agent {
  return new Agent(skillConfig);
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

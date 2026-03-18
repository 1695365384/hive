/**
 * 主 Agent - 统一入口
 *
 * 这是整个 SDK 的核心入口点，负责：
 * 1. 管理子 Agent（Explore, Plan, General 等）
 * 2. 运行智能工作流
 * 3. 管理提供商
 *
 * 使用方式：
 * ```typescript
 * import { Agent } from 'claude-agent-service';
 *
 * const agent = new Agent();
 *
 * // 直接对话
 * await agent.chat('你好');
 *
 * // 使用子 Agent
 * await agent.explore('查找 API 路由');
 * await agent.plan('研究认证模块');
 * await agent.general('重构代码');
 *
 * // 运行智能工作流（自动决定使用哪些子 Agent）
 * await agent.runWorkflow('添加功能');
 * ```
 */

import { query, type Options, type AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import { AgentRunner } from './runner.js';
import { BUILTIN_AGENTS, EXTENDED_AGENTS, buildExplorePrompt, THOROUGHNESS_PROMPTS } from './builtin.js';
import type { AgentResult, ThoroughnessLevel, AgentType } from './types.js';
import { UnifiedProviderManager, type CCProvider } from '../providers/cc-switch-provider.js';
import {
  SkillRegistry,
  createSkillRegistry,
  type Skill,
  type SkillMatchResult,
  type SkillSystemConfig,
} from '../skills/index.js';

// ============================================
// 类型定义
// ============================================

export interface AgentOptions {
  /** 工作目录 */
  cwd?: string;
  /** 允许的工具 */
  tools?: string[];
  /** 最大轮次 */
  maxTurns?: number;
  /** 系统提示 */
  systemPrompt?: string;
  /** 使用的子 Agent */
  agents?: AgentType[];
  /** 自定义子 Agent */
  customAgents?: Record<string, AgentDefinition>;
  /** 回调：收到文本 */
  onText?: (text: string) => void;
  /** 回调：工具使用 */
  onTool?: (toolName: string, input?: unknown) => void;
  /** 回调：错误 */
  onError?: (error: Error) => void;
}

export interface WorkflowOptions {
  /** 工作目录 */
  cwd?: string;
  /** 最大轮次 */
  maxTurns?: number;
  /** 提供商 */
  provider?: string;
  /** API Key */
  apiKey?: string;
  /** 回调：阶段变化 */
  onPhase?: (phase: string, message: string) => void;
  /** 回调：工具使用 */
  onTool?: (tool: string, input?: unknown) => void;
  /** 回调：文本输出 */
  onText?: (text: string) => void;
}

export interface WorkflowResult {
  /** 任务分析结果 */
  analysis: TaskAnalysis;
  /** 探索结果（如果执行了探索） */
  exploreResult?: AgentResult;
  /** 生成的执行计划 */
  executionPlan?: string;
  /** 执行结果 */
  executeResult?: AgentResult;
  /** 是否成功 */
  success: boolean;
  /** 错误信息 */
  error?: string;
}

/**
 * 任务分析结果
 */
export interface TaskAnalysis {
  /** 任务类型 */
  type: 'simple' | 'moderate' | 'complex';
  /** 需要探索 */
  needsExploration: boolean;
  /** 需要计划 */
  needsPlanning: boolean;
  /** 推荐的 Agent */
  recommendedAgents: string[];
  /** 理由 */
  reason: string;
}

// ============================================
// 主 Agent 类
// ============================================

/**
 * 主 Agent - 统一入口
 *
 * 所有功能都通过这个类访问：
 * - 对话功能
 * - 子 Agent 管理
 * - 智能工作流执行
 * - 提供商管理
 */
export class Agent {
  private providerManager: UnifiedProviderManager;
  private runner: AgentRunner;
  private skillRegistry: SkillRegistry;
  private skillsInitialized: boolean = false;

  constructor(skillConfig?: SkillSystemConfig) {
    this.providerManager = new UnifiedProviderManager();
    this.runner = new AgentRunner(this.providerManager);
    this.skillRegistry = createSkillRegistry(skillConfig);
  }

  /**
   * 初始化技能系统
   *
   * 加载内置技能和用户技能
   */
  async initializeSkills(): Promise<void> {
    if (!this.skillsInitialized) {
      await this.skillRegistry.initialize();
      this.skillsInitialized = true;
    }
  }

  // ============================================
  // 提供商管理
  // ============================================

  /** 获取当前提供商 */
  get currentProvider(): CCProvider | null {
    return this.providerManager.getActiveProvider();
  }

  /** 列出所有提供商 */
  listProviders(): CCProvider[] {
    return this.providerManager.getAllProviders();
  }

  /** 列出预设 */
  listPresets() {
    return this.providerManager.listPresets();
  }

  /** 切换提供商 */
  useProvider(name: string, apiKey?: string): boolean {
    return this.providerManager.switchProvider(name, apiKey);
  }

  /** 检查是否安装了 CC-Switch */
  isCCSwitchInstalled(): boolean {
    return this.providerManager.isCCSwitchInstalled();
  }

  // ============================================
  // 技能管理
  // ============================================

  /** 列出所有可用技能 */
  listSkills(): Skill[] {
    return this.skillRegistry.getAll();
  }

  /** 列出所有技能元数据 */
  listSkillMetadata() {
    return this.skillRegistry.getAllMetadata();
  }

  /** 获取指定技能 */
  getSkill(name: string): Skill | undefined {
    return this.skillRegistry.get(name);
  }

  /** 匹配技能 */
  matchSkill(input: string): SkillMatchResult | null {
    return this.skillRegistry.match(input);
  }

  /** 手动注册技能 */
  registerSkill(skill: Skill): void {
    this.skillRegistry.register(skill);
  }

  /** 生成技能指令 */
  generateSkillInstruction(skill: Skill): string {
    return this.skillRegistry.generateSkillInstruction(skill);
  }

  // ============================================
  // 核心对话方法
  // ============================================

  /**
   * 发送消息并返回完整响应
   */
  async chat(prompt: string, options?: AgentOptions): Promise<string> {
    let result = '';
    await this.chatStream(prompt, {
      ...options,
      onText: (text) => { result += text; options?.onText?.(text); },
    });
    return result;
  }

  /**
   * 流式对话
   */
  async chatStream(prompt: string, options?: AgentOptions): Promise<void> {
    const provider = this.providerManager.getActiveProvider();
    const mcpServers = this.providerManager.getMcpServersForAgent();

    // 构建环境变量 - 显式传递给 SDK
    const envVars: Record<string, string | undefined> = { ...process.env };
    if (provider) {
      envVars.ANTHROPIC_BASE_URL = provider.base_url;
      envVars.ANTHROPIC_API_KEY = provider.api_key;
    }

    // 构建子 Agent 配置
    const agents: Record<string, AgentDefinition> = {};

    if (options?.agents) {
      for (const name of options.agents) {
        if (name in BUILTIN_AGENTS) {
          agents[name] = BUILTIN_AGENTS[name] as AgentDefinition;
        } else if (name in EXTENDED_AGENTS) {
          agents[name] = EXTENDED_AGENTS[name] as AgentDefinition;
        }
      }
    }

    if (options?.customAgents) {
      Object.assign(agents, options.customAgents);
    }

    const queryOptions: Options = {
      cwd: options?.cwd,
      tools: options?.tools,
      maxTurns: options?.maxTurns,
      systemPrompt: options?.systemPrompt,
      mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined,
      agents: Object.keys(agents).length > 0 ? agents : undefined,
      env: envVars,
      permissionMode: 'bypassPermissions',
    };

    try {
      for await (const message of query({ prompt, options: queryOptions })) {
        if ('result' in message && message.result) {
          options?.onText?.(message.result as string);
        }

        // 处理工具调用 - SDK 通过 tool_progress 消息发送
        if ('type' in message && message.type === 'tool_progress') {
          const toolMsg = message as { tool_name: string };
          options?.onTool?.(toolMsg.tool_name, undefined);
        }

        // 处理 assistant 消息中的 content blocks
        if ('message' in message && message.message && typeof message.message === 'object') {
          const msg = message.message as { content?: unknown[] };
          if (Array.isArray(msg.content)) {
            for (const block of msg.content) {
              if (typeof block === 'object' && block !== null) {
                const b = block as { type?: string; name?: string; input?: unknown };
                if (b.type === 'tool_use' && b.name) {
                  options?.onTool?.(b.name, b.input);
                }
              }
            }
          }
        }
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      options?.onError?.(err);
      throw err;
    }
  }

  // ============================================
  // 子 Agent 便捷方法（使用统一的 prompt）
  // ============================================

  /**
   * 使用 Explore Agent 探索代码库
   */
  async explore(prompt: string, thoroughness: ThoroughnessLevel = 'medium'): Promise<string> {
    const result = await this.runner.execute('explore', buildExplorePrompt(prompt, thoroughness));
    return result.text;
  }

  /**
   * 使用 Plan Agent 研究代码库
   */
  async plan(prompt: string): Promise<string> {
    const result = await this.runner.execute('plan', `Research the codebase for planning:\n\n${prompt}`);
    return result.text;
  }

  /**
   * 使用 General Agent 执行任务
   */
  async general(prompt: string): Promise<string> {
    const result = await this.runner.execute('general', prompt);
    return result.text;
  }

  /**
   * 运行指定子 Agent
   */
  async runSubAgent(name: AgentType, prompt: string): Promise<AgentResult> {
    return this.runner.execute(name, prompt);
  }

  // ============================================
  // 扩展 Agent 便捷方法
  // ============================================

  /** 代码审查 */
  async reviewCode(target: string): Promise<string> {
    const result = await this.runner.execute('code-reviewer', `Review the code: ${target}`);
    return result.text;
  }

  /** 生成测试 */
  async generateTests(target: string): Promise<string> {
    const result = await this.runner.execute('test-engineer', `Generate tests for: ${target}`);
    return result.text;
  }

  /** 编写文档 */
  async writeDocs(target: string): Promise<string> {
    const result = await this.runner.execute('doc-writer', `Write documentation for: ${target}`);
    return result.text;
  }

  /** 调试 */
  async debug(target: string): Promise<string> {
    const result = await this.runner.execute('debugger', `Debug this issue: ${target}`);
    return result.text;
  }

  /** 重构 */
  async refactor(target: string): Promise<string> {
    const result = await this.runner.execute('refactorer', `Refactor this code: ${target}`);
    return result.text;
  }

  /** 安全审计 */
  async securityAudit(target: string): Promise<string> {
    const result = await this.runner.execute('security-auditor', `Audit security of: ${target}`);
    return result.text;
  }

  // ============================================
  // 智能工作流（核心功能）
  // ============================================

  /**
   * 分析任务复杂度
   *
   * 简化版：不再使用关键字匹配，而是信任 LLM 的判断能力
   * 只做最基本的判断，复杂决策交给 LLM
   */
  async analyzeTask(task: string): Promise<TaskAnalysis> {
    // 极简判断：只区分纯问答任务
    // 纯问答通常很短，且以问号结尾
    const isPureQuestion = task.length < 100 && task.trim().endsWith('?') && !task.includes('\n');

    if (isPureQuestion) {
      return {
        type: 'simple',
        needsExploration: false,
        needsPlanning: false,
        recommendedAgents: ['general'],
        reason: 'Simple question, direct response',
      };
    }

    // 所有其他任务：让 LLM 自己决定是否需要探索
    return {
      type: 'moderate',
      needsExploration: false,  // 不预先判断，让 LLM 决定
      needsPlanning: false,
      recommendedAgents: ['general'],
      reason: 'Let LLM decide the approach',
    };
  }

  /**
   * 执行智能工作流
   *
   * 简化版：信任 LLM 的判断能力
   * - LLM 自己决定是否需要探索
   * - LLM 自己决定是否需要规划
   * - LLM 自己决定执行步骤
   *
   * 我们只提供工具和能力，不做预判
   */
  async runWorkflow(task: string, options?: WorkflowOptions): Promise<WorkflowResult> {
    if (options?.provider) {
      this.providerManager.switchProvider(options.provider, options.apiKey);
    }

    const result: WorkflowResult = {
      analysis: { type: 'simple', needsExploration: false, needsPlanning: false, recommendedAgents: [], reason: '' },
      success: true,
    };

    try {
      // Phase 1: 简单分析（只记录，不做预判）
      options?.onPhase?.('analyze', '准备执行任务...');
      result.analysis = await this.analyzeTask(task);

      // Phase 2: 直接执行 - 让 LLM 自己决定流程
      options?.onPhase?.('execute', '执行任务...');

      // 构建智能 prompt，让 LLM 自己决定是否需要探索
      const intelligentPrompt = this.buildIntelligentPrompt(task);

      result.executeResult = await this.runner.execute('general', intelligentPrompt, {
        cwd: options?.cwd,
        onText: options?.onText,
        onTool: options?.onTool ? (name, input) => options.onTool!(name, input) : undefined,
        maxTurns: 20,  // 给足够的空间让 LLM 自主决策
      });

      result.success = result.executeResult.success;

    } catch (error) {
      result.success = false;
      result.error = error instanceof Error ? error.message : String(error);
    }

    return result;
  }

  /**
   * 构建智能 Prompt
   *
   * 告诉 LLM 它有哪些能力，让它自己决定如何完成任务
   * 如果匹配到技能，注入技能指令
   */
  private buildIntelligentPrompt(task: string): string {
    // 检测任务语言
    const isChineseTask = /[\u4e00-\u9fa5]/.test(task);
    const languageInstruction = isChineseTask
      ? '【重要】你必须用中文回复，与用户的语言保持一致。'
      : 'CRITICAL: You must respond in English, matching the user\'s language.';

    // 尝试匹配技能
    const skillMatch = this.skillRegistry.match(task);
    let skillSection = '';

    if (skillMatch) {
      // 注入匹配到的技能指令
      skillSection = `\n\n${this.skillRegistry.generateSkillInstruction(skillMatch.skill)}`;
    } else if (this.skillRegistry.size > 0) {
      // 显示所有可用技能
      skillSection = `\n\n${this.skillRegistry.generateSkillListDescription()}`;
    }

    return `${languageInstruction}${skillSection}

## Task
${task}

## Your Capabilities

You are an intelligent agent with these tools:
- **Explore**: Glob, Grep, Read - Use these to understand the codebase/environment
- **Modify**: Write, Edit - Use these to make changes
- **Execute**: Bash - Use this to run commands

## How to Work

**CRITICAL: You decide the approach based on the task.**

1. **New creation tasks** (e.g., "write a bubble sort", "create a script"):
   - Start working immediately, no need to explore
   - Write the code directly

2. **Analysis/exploration tasks** (e.g., "analyze this project", "explain how X works"):
   - First explore the codebase using Glob, Grep, Read
   - Then provide a comprehensive answer

3. **Modification tasks** (e.g., "fix bug in X", "add feature to Y"):
   - First explore to understand the existing code
   - Then make the necessary changes

4. **Simple questions**:
   - Answer directly if you know the answer
   - Explore only if you need more context

## Critical Rules

1. **Be autonomous** - Don't ask for permission, just do what's needed
2. **Be intelligent** - Choose the right approach for the task
3. **Be thorough** - Complete the task fully
4. **Use tools proactively** - You have Glob, Grep, Read available for exploration

Start working on the task NOW:`;
  }


  /**
   * 预览工作流（生成智能 prompt，不执行）
   */
  async preview(task: string, options?: WorkflowOptions): Promise<{
    analysis: TaskAnalysis;
    intelligentPrompt: string;
  }> {
    if (options?.provider) {
      this.providerManager.switchProvider(options.provider, options.apiKey);
    }

    const analysis = await this.analyzeTask(task);
    const intelligentPrompt = this.buildIntelligentPrompt(task);

    return { analysis, intelligentPrompt };
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
export function createAgent(): Agent {
  return new Agent();
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
export async function runWorkflow(task: string, options?: WorkflowOptions): Promise<string> {
  const result = await getAgent().runWorkflow(task, options);
  return result.executeResult?.text || result.exploreResult?.text || '';
}

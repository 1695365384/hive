/**
 * Agent 核心类型定义
 *
 * 定义能力组合模式的核心接口
 */

import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import type { ProviderManager, ProviderConfig } from '../../providers/index.js';
import type { SkillRegistry, Skill, SkillMatchResult, SkillSystemConfig } from '../../skills/index.js';
import type { AgentRunner } from './runner.js';
import type { AgentConfig, AgentResult, ThoroughnessLevel, AgentType } from '../types.js';
import type { HookRegistry } from '../../hooks/index.js';

// 重导出 SkillSystemConfig
export type { SkillSystemConfig } from '../../skills/index.js';

// ============================================
// 核心接口
// ============================================

/**
 * Agent 能力接口
 *
 * 所有能力模块必须实现此接口
 */
export interface AgentCapability {
  /** 能力名称（唯一标识） */
  readonly name: string;

  /**
   * 初始化能力
   *
   * @param context - Agent 上下文
   */
  initialize(context: AgentContext): void | Promise<void>;

  /**
   * 销毁能力（可选）
   *
   * 用于清理资源、取消订阅等
   */
  dispose?(): void | Promise<void>;
}

/**
 * Agent 上下文
 *
 * 依赖注入容器，管理所有共享资源
 */
export interface AgentContext {
  /** 提供商管理器 */
  providerManager: ProviderManager;
  /** Agent 运行器 */
  runner: AgentRunner;
  /** 技能注册表 */
  skillRegistry: SkillRegistry;
  /** Agent 注册表 */
  agentRegistry: AgentRegistry;
  /** Hook 注册表 */
  hookRegistry: HookRegistry;

  // 便捷访问器
  /** 获取当前提供商 */
  getActiveProvider(): ProviderConfig | null;
  /** 获取技能 */
  getSkill(name: string): Skill | undefined;
  /** 匹配技能 */
  matchSkill(input: string): SkillMatchResult | null;
  /** 获取 Agent 配置 */
  getAgentConfig(name: string): AgentConfig | undefined;
}

/**
 * Agent 注册表接口
 */
export interface AgentRegistry {
  /** 获取 Agent 配置 */
  get(name: string): AgentConfig | undefined;
  /** 获取所有 Agent 名称 */
  getAllNames(): string[];
  /** 注册 Agent */
  register(name: string, config: AgentConfig): void;
  /** 检查 Agent 是否存在 */
  has(name: string): boolean;
}

// ============================================
// 选项类型
// ============================================

/**
 * Agent 选项
 */
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

/**
 * 工作流选项
 */
export interface WorkflowOptions {
  /** 工作目录 */
  cwd?: string;
  /** 最大轮次 */
  maxTurns?: number;
  /** 回调：阶段变化 */
  onPhase?: (phase: string, message: string) => void;
  /** 回调：工具使用 */
  onTool?: (tool: string, input?: unknown) => void;
  /** 回调：文本输出 */
  onText?: (text: string) => void;
}

/**
 * 工作流结果
 */
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
// 重导出
// ============================================

export type {
  AgentConfig,
  AgentResult,
  AgentExecuteOptions,
  ThoroughnessLevel,
  AgentType,
  ContentBlock,
  TextContentBlock,
  ToolUseContentBlock,
  SdkMessage,
  ResultMessage,
  AssistantMessage,
  ToolProgressMessage,
  UsageMessage,
} from '../types.js';

export {
  isResultMessage,
  isAssistantMessage,
  isToolProgressMessage,
  isUsageMessage,
  isTextBlock,
  isToolUseBlock,
} from '../types.js';

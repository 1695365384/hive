/**
 * Agent 模块 - 唯一入口
 *
 * 所有 Agent 功能都通过主 Agent 访问：
 * - 统一任务执行（dispatch）
 * - 对话（chat — dispatch 的别名）
 * - 提供商管理
 * - 技能管理
 * - 会话管理
 */

// ============================================
// 核心 Agent（从 core/ 导出）
// ============================================

export {
  // Agent 类
  Agent,
  getAgent,
  createAgent,
  ask,

  // 内置 Agent
  CORE_AGENTS,
  BUILTIN_AGENTS,
  getAgentConfig,
  getAllAgentNames,

  // 运行器（含 Task 系统）
  AgentRunner,
  createAgentRunner,

  // 类型
  type AgentInitOptions,
  type AgentConfig,
  type AgentResult,
  type ThoroughnessLevel,
  type AgentType,
  type TaskConfig,
  type TaskResult,
  type ParallelTaskConfig,
} from './core/index.js';

// ============================================
// 能力模块
// ============================================

export {
  ProviderCapability,
  SkillCapability,
  CoordinatorCapability,
  ScheduleCapability,
  createScheduleCapability,
} from './capabilities/index.js';

export type {
  DispatchOptions,
  DispatchResult,
  DispatchTraceEvent,
} from './capabilities/index.js';

// ============================================
// Prompt 系统
// ============================================

export {
  // 模板引擎
  PromptTemplate,
  getPromptTemplate,
  createPromptTemplate,

  // Prompt
  THOROUGHNESS_PROMPTS,
  buildExplorePrompt,
  buildPlanPrompt,

  // 类型
  type TemplateVariables,
} from './prompts/index.js';

// ============================================
// Agent 注册表
// ============================================

export {
  AgentRegistryImpl,
  getAgentRegistry,
  createAgentRegistry,
} from './registry/AgentRegistry.js';

// ============================================
// Hooks 系统（从顶级模块重导出）
// ============================================

export {
  // 注册表
  HookRegistry,

  // 类型
  type HookPriority,
  type HookResult,
  type SessionStartHookContext,
  type SessionEndHookContext,
  type SessionErrorHookContext,
  type ToolBeforeHookContext,
  type ToolBeforeHookModifiedContext,
  type ToolAfterHookContext,
  type CapabilityInitHookContext,
  type CapabilityDisposeHookContext,
  type WorkflowPhaseHookContext,
  type HookTypeMap,
  type HookType,
  type HookHandler,
  type HookOptions,
  type RegisteredHook,
} from '../hooks/index.js';

// ============================================
// 类型定义
// ============================================

export type { AgentCapability, AgentContext } from './capabilities/index.js';

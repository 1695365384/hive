/**
 * Agent 核心模块
 */

// ============================================
// Agent 类和便捷函数
// ============================================

export {
  Agent,
  getAgent,
  createAgent,
  ask,
  explore,
  plan,
  general,
  runWorkflow,
} from './Agent.js';

// ============================================
// Agent 上下文
// ============================================

export { AgentContextImpl } from './AgentContext.js';

// ============================================
// 内置 Agent 定义
// ============================================

export {
  CORE_AGENTS,
  EXTENDED_AGENTS,
  BUILTIN_AGENTS,
  getAgentConfig,
  getCoreAgentNames,
  getExtendedAgentNames,
  getAllAgentNames,
} from './agents.js';

// ============================================
// Agent 运行器
// ============================================

export {
  AgentRunner,
  createAgentRunner,
  runAgent,
  runExplore,
  runPlan,
  runGeneral,
} from './runner.js';

// ============================================
// Task 系统
// ============================================

export {
  Task,
  createTask,
  runTask,
  runParallel,
  mapParallel,
  runExploreTask,
  runPlanTask,
  runGeneralTask,
  type TaskConfig,
  type TaskResult,
  type ParallelTaskConfig,
} from './task.js';

// ============================================
// 类型定义
// ============================================

export type {
  AgentCapability,
  AgentContext as AgentContextInterface,
  AgentRegistry as AgentRegistryInterface,
  AgentOptions,
  AgentExecuteOptions,
  WorkflowOptions,
  WorkflowResult,
  TaskAnalysis,
  AgentConfig,
  AgentResult,
  ThoroughnessLevel,
  AgentType,
} from './types.js';

// 重导出 SkillSystemConfig
export type { SkillSystemConfig } from '../../skills/index.js';

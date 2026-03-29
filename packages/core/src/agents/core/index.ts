/**
 * Agent 核心模块
 */

// ============================================
// Agent 类和便捷函数
// ============================================

export {
  Agent,
} from './Agent.js';

// ============================================
// 全局实例和便捷函数
// ============================================

export {
  getAgent,
  createAgent,
  ask,
  explore,
  plan,
  general,
  runWorkflow,
} from './singleton.js';

// ============================================
// Agent 上下文
// ============================================

export { AgentContextImpl } from './AgentContext.js';

// ============================================
// 内置 Agent 定义
// ============================================

export {
  CORE_AGENTS,
  BUILTIN_AGENTS,
  getAgentConfig,
  getAllAgentNames,
} from './agents.js';

// ============================================
// Agent 运行器（含 Task 系统）
// ============================================

export {
  AgentRunner,
  createAgentRunner,
  type TaskConfig,
  type TaskResult,
  type ParallelTaskConfig,
} from './runner.js';

// ============================================
// CapabilityRegistry
// ============================================

export { CapabilityRegistry } from './CapabilityRegistry.js';

// ============================================
// 类型定义
// ============================================

export type {
  AgentCapability,
  AgentContext as AgentContextInterface,
  AgentRegistry as AgentRegistryInterface,
  AgentOptions,
  AgentInitOptions,
  AgentExecuteOptions,
  WorkflowOptions,
  WorkflowResult,
  AgentConfig,
  AgentResult,
  ThoroughnessLevel,
  AgentType,
} from './types.js';

// 重导出 SkillSystemConfig
export type { SkillSystemConfig } from '../../skills/index.js';

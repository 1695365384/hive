/**
 * Agent 模块 - 唯一入口
 *
 * 所有 Agent 功能都通过主 Agent 访问：
 * - 对话功能
 * - 子 Agent（Explore, Plan, General 等）
 * - 工作流
 *
 * 使用方式：
 * ```typescript
 * import { Agent, createAgent, ask } from 'claude-agent-service';
 *
 * // 方式 1: 创建实例
 * const agent = new Agent();
 * await agent.chat('你好');
 * await agent.explore('查找 API');
 *
 * // 方式 2: 使用全局实例
 * const agent = createAgent();
 * await agent.runWorkflow('添加功能');
 *
 * // 方式 3: 便捷函数
 * await ask('你好');
 * ```
 */

// ============================================
// 主 Agent（核心入口）
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
  type AgentOptions,
  type WorkflowOptions,
  type WorkflowResult,
} from './main.js';

// ============================================
// 子 Agent 类型（供高级用户使用）
// ============================================

export type {
  AgentType,
  AgentConfig,
  AgentExecuteOptions,
  AgentResult,
  ThoroughnessLevel,
} from './types.js';

// 内置 Agent 定义（供高级用户直接访问）
export {
  CORE_AGENTS,
  EXTENDED_AGENTS,
  BUILTIN_AGENTS,
  getAgentConfig,
  getCoreAgentNames,
  getExtendedAgentNames,
  getAllAgentNames,
} from './builtin.js';

// Agent 运行器（供高级用户直接使用）
export {
  AgentRunner,
  createAgentRunner,
  runAgent,
  runExplore,
  runPlan,
  runGeneral,
} from './runner.js';

// ============================================
// Task 系统（类似 Claude Code 的 Task Tool）
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

// Prompt 模板（供高级用户自定义）
export {
  THOROUGHNESS_PROMPTS,
  EXPLORE_AGENT_PROMPT,
  PLAN_AGENT_PROMPT,
  GENERAL_AGENT_PROMPT,
  buildExplorePrompt,
  buildPlanPrompt,
} from './builtin.js';

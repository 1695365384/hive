/**
 * Agent 模块 - 唯一入口
 *
 * 所有 Agent 功能都通过主 Agent 访问：
 * - 对话功能
 * - 子 Agent（Explore, Plan, General 等）
 * - 工作流
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
  explore,
  plan,
  general,
  runWorkflow,

  // 内置 Agent
  CORE_AGENTS,
  EXTENDED_AGENTS,
  BUILTIN_AGENTS,
  getAgentConfig,
  getCoreAgentNames,
  getExtendedAgentNames,
  getAllAgentNames,

  // 运行器
  AgentRunner,
  createAgentRunner,
  runAgent,
  runExplore,
  runPlan,
  runGeneral,

  // Task 系统
  Task,
  createTask,
  runTask,
  runParallel,
  mapParallel,
  runExploreTask,
  runPlanTask,
  runGeneralTask,

  // 类型
  type AgentOptions,
  type AgentExecuteOptions,
  type WorkflowOptions,
  type WorkflowResult,
  type TaskAnalysis,
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
  ChatCapability,
  SubAgentCapability,
  WorkflowCapability,
} from './capabilities/index.js';

// ============================================
// Prompt 系统
// ============================================

export {
  // 模板引擎
  PromptTemplate,
  getPromptTemplate,
  createPromptTemplate,

  // Prompt 常量
  THOROUGHNESS_PROMPTS,
  EXPLORE_AGENT_PROMPT,
  PLAN_AGENT_PROMPT,
  GENERAL_AGENT_PROMPT,

  // 构建函数
  buildExplorePrompt,
  buildPlanPrompt,
  buildIntelligentPrompt,

  // 模板渲染
  renderTemplate,
  loadTemplate,

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
// 类型定义
// ============================================

export type { AgentCapability, AgentContext } from './capabilities/index.js';

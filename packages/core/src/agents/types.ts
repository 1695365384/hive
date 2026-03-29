/**
 * Agent 类型定义
 *
 * 定义所有 Agent 相关的类型（合并自 agents/types.ts + agents/core/types.ts）
 *
 * 此文件为 barrel re-export，所有类型按关注点拆分到 types/ 目录下：
 * - types/core.ts — 核心类型（AgentContext, AgentOptions, TimeoutConfig, 等）
 * - types/capabilities.ts — 能力模块类型（AgentCapability, AgentConfig, AgentType）
 * - types/runner.ts — Runner/执行类型（SDK 消息、工作流、任务分析）
 * - types/pipeline.ts — 管道类型（AgentPhaseResult, CompactorConfig, PromptBuildContext）
 */

export type {
  AgentType,
  AgentConfig,
  AgentCapability,
} from './types/capabilities.js';

export type {
  SkillSystemConfig,
  AgentExecuteOptions,
  AgentResult,
  ThoroughnessLevel,
  AgentInitOptions,
  AgentOptions,
  AgentRegistry,
  AgentContext,
  TimeoutConfig,
  HeartbeatConfig,
  HeartbeatTaskConfig,
  HeartbeatResult,
} from './types/core.js';

export {
  TimeoutError,
} from './types/core.js';

export type {
  WorkflowOptions,
  WorkflowResult,
  TaskAnalysis,
} from './types/runner.js';

export type {
  AgentPhaseResult,
  CompactorConfig,
  PromptBuildContext,
} from './types/pipeline.js';

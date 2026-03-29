/**
 * Agent 核心类型定义（重导出）
 *
 * 所有类型已合并到 agents/types.ts，此文件仅做重导出以保持向后兼容。
 */

/**
 * Interface for objects that hold resources requiring explicit cleanup.
 */
export interface IDisposable {
  dispose(): void;
}

// 重导出 SkillSystemConfig
export type { SkillSystemConfig } from '../../skills/index.js';

// 重导出所有类型和值
export type {
  AgentCapability,
  AgentContext,
  AgentRegistry,
  AgentOptions,
  AgentInitOptions,
  AgentExecuteOptions,
  WorkflowOptions,
  WorkflowResult,
  TimeoutConfig,
  HeartbeatConfig,
  HeartbeatTaskConfig,
  HeartbeatResult,
  AgentConfig,
  AgentResult,
  ThoroughnessLevel,
  AgentType,
} from '../types.js';

export {
  TimeoutError,
} from '../types.js';

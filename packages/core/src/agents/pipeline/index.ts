/**
 * Pipeline 模块
 *
 * 多阶段 Swarm 编排。
 */

export { PipelineExecutor } from './executor.js';
export { evaluateTrigger } from './trigger.js';
export { generatePipelineReport } from './tracer.js';

export type {
  TriggerCondition,
  FieldOperator,
  FieldMatchRule,
  PipelineStage,
  StageResult,
  PipelineResult,
  PipelineTraceEventType,
  PipelineTraceEvent,
  PipelineOptions,
} from './types.js';

export type { TriggerContext } from './trigger.js';

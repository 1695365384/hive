/**
 * 蜂群协作模块
 */

export { Blackboard } from './blackboard.js';
export { SwarmTracer } from './tracer.js';
export { SwarmExecutor } from './executor.js';
export {
  matchTemplate,
  matchTemplateDetailed,
  topologicalSort,
  detectCycle,
  renderNodePrompt,
  buildGraph,
} from './decomposer.js';
export { aggregate, formatMerge, sumUsage } from './aggregator.js';
export { BUILTIN_TEMPLATES } from './templates.js';
export {
  classifyTask,
  createClassifierEvent,
  createLowConfidenceEvent,
} from './classifier.js';

export type {
  CyclicDependencyError,
  AggregateFormat,
  SwarmAggregateConfig,
  SwarmNode,
  SwarmTemplate,
  ExecutableNode,
  ExecutableGraph,
  BlackboardConfig,
  BlackboardEntry,
  TraceEventType,
  TraceEvent,
  SwarmOptions,
  NodeResult,
  SwarmResult,
  SwarmPreview,
  TaskType,
  Complexity,
  TemplateVariant,
  TaskClassification,
} from './types.js';

export type {
  ClassificationResult,
  ClassifyContext,
} from './classifier.js';

export type { MatchTemplateOptions, MatchResult } from './decomposer.js';

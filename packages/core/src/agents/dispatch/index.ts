/**
 * Dispatch 模块
 *
 * 智能任务分发器 - LLM 分类 + 路由。
 */

export { Dispatcher } from './Dispatcher.js';
export { classifyForDispatch, regexClassify, parseDispatchClassification } from './classifier.js';
export { callClassifierLLM, extractJSON } from './llm-utils.js';
export type { ClassifierProvider } from './llm-utils.js';
export { VALID_EXECUTION_LAYERS } from './types.js';

export type {
  ExecutionLayer,
  DispatchClassification,
  DispatchResult,
  DispatchOptions,
  DispatchTraceEventType,
  DispatchTraceEvent,
} from './types.js';

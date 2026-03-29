/**
 * Dispatch 模块
 *
 * 统一任务分发器。
 */

export { Dispatcher } from './Dispatcher.js';
export { classifyForDispatch, regexClassify, parseDispatchClassification } from './classifier.js';
export type { DispatchClassification } from './classifier.js';
export { callClassifierLLM, extractJSON } from './llm-utils.js';
export type { ClassifierProvider } from './llm-utils.js';

export type {
  DispatchResult,
  DispatchOptions,
  DispatchTraceEventType,
  DispatchTraceEvent,
} from './types.js';

/**
 * Dispatch 类型定义
 *
 * 智能任务分发器的类型系统。
 */

// ============================================
// 执行层
// ============================================

/**
 * 执行层
 *
 * - chat: 单轮对话，1 次 LLM 调用
 * - workflow: 三子 Agent 顺序执行（explore → plan → execute），3-10 次 LLM 调用
 */
export type ExecutionLayer = 'chat' | 'workflow';

/** 有效的执行层 */
export const VALID_EXECUTION_LAYERS = ['chat', 'workflow'] as const;

// ============================================
// 分发分类结果
// ============================================

/**
 * 分发分类结果
 */
export interface DispatchClassification {
  /** 目标执行层 */
  layer: ExecutionLayer;
  /** 任务类型 */
  taskType: 'general' | 'code-task';
  /** 复杂度等级 */
  complexity: 'simple' | 'moderate' | 'complex';
  /** 置信度 0-1 */
  confidence: number;
  /** 分类原因 */
  reason: string;
}

// ============================================
// 分发结果
// ============================================

/**
 * 统一分发结果
 */
export interface DispatchResult {
  /** 使用的执行层 */
  layer: ExecutionLayer;
  /** 分类结果 */
  classification: DispatchClassification;
  /** 最终文本输出 */
  text: string;
  /** 是否成功 */
  success: boolean;
  /** 总耗时（毫秒） */
  duration: number;
  /** Token 使用量 */
  usage?: { input: number; output: number };
  /** 错误信息 */
  error?: string;
  /** 追踪事件 */
  trace?: Record<string, unknown>[];
}

// ============================================
// 分发选项
// ============================================

/**
 * 分发选项
 */
export interface DispatchOptions {
  /** 强制指定执行层（跳过分类） */
  forceLayer?: ExecutionLayer;
  /** 工作目录 */
  cwd?: string;
  /** 阶段回调 */
  onPhase?: (phase: string, message: string) => void;
  /** 置信度阈值（默认 0.5） */
  confidenceThreshold?: number;
  /** 分类器模型覆盖 */
  classifierModel?: string;
}

// ============================================
// 分发追踪事件
// ============================================

/**
 * 分发追踪事件类型
 */
export type DispatchTraceEventType =
  | 'dispatch.start'
  | 'dispatch.classify'
  | 'dispatch.route'
  | 'dispatch.complete'
  | 'dispatch.fallback';

/**
 * 分发追踪事件
 */
export interface DispatchTraceEvent {
  timestamp: number;
  type: DispatchTraceEventType;
  layer?: ExecutionLayer;
  confidence?: number;
  latency?: number;
  reason?: string;
  fallbackFrom?: ExecutionLayer;
  error?: string;
}

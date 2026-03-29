/**
 * Dispatch 类型定义
 *
 * 统一执行入口的类型系统。
 */

// ============================================
// Legacy 类型（供 classifier 模块使用）
// ============================================

/**
 * 执行层
 *
 * @deprecated Dispatcher 不再使用路由分类，保留供 classifier 模块独立使用。
 */
export type ExecutionLayer = 'chat' | 'workflow';

/** @deprecated */
export const VALID_EXECUTION_LAYERS = ['chat', 'workflow'] as const;

/**
 * 分发分类结果
 *
 * @deprecated Dispatcher 不再使用分类，保留供 classifier 模块独立使用。
 */
export interface DispatchClassification {
  layer: ExecutionLayer;
  taskType: 'general' | 'code-task';
  complexity: 'simple' | 'moderate' | 'complex';
  confidence: number;
  reason: string;
}

// ============================================
// 分发结果
// ============================================

/**
 * 统一分发结果
 */
export interface DispatchResult {
  /** 最终文本输出 */
  text: string;
  /** 是否成功 */
  success: boolean;
  /** 总耗时（毫秒） */
  duration: number;
  /** 被调用的工具 */
  tools: string[];
  /** Token 使用量 */
  usage?: { input: number; output: number };
  /** Cost estimation (USD) */
  cost?: { input: number; output: number; total: number };
  /** 错误信息 */
  error?: string;
  /** 分发追踪事件 */
  trace?: DispatchTraceEvent[];
}

// ============================================
// 分发选项
// ============================================

/**
 * 分发选项
 */
export interface DispatchOptions {
  /** 会话 ID（用于 session 切换和持久化） */
  chatId?: string;
  /** 工作目录 */
  cwd?: string;
  /** 阶段回调 */
  onPhase?: (phase: string, message: string) => void;
  /** 文本输出回调 */
  onText?: (text: string) => void;
  /** 工具调用回调 */
  onTool?: (tool: string, input?: unknown) => void;
}

// ============================================
// 分发追踪事件
// ============================================

/**
 * 分发追踪事件类型
 */
export type DispatchTraceEventType =
  | 'dispatch.start'
  | 'dispatch.complete';

/**
 * 分发追踪事件
 */
export interface DispatchTraceEvent {
  timestamp: number;
  type: DispatchTraceEventType;
  /** 总耗时 ms（仅 dispatch.complete 事件） */
  duration?: number;
  error?: string;
}

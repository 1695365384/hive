/**
 * Dispatch 类型定义
 *
 * 统一执行入口的类型系统。
 */

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
  /** 工具结果回调 */
  onToolResult?: (tool: string, result: unknown) => void;
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

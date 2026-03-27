/**
 * Hook 核心类型定义
 *
 * 定义 hooks 系统的基础类型：优先级、结果、基础上下文、处理器
 */

// ============================================
// 优先级定义
// ============================================

/**
 * Hook 优先级
 *
 * 数值越高优先级越高，越先执行
 */
export type HookPriority = 'highest' | 'high' | 'normal' | 'low' | 'lowest';

/**
 * 优先级数值映射
 */
export const HOOK_PRIORITY_VALUES: Record<HookPriority, number> = {
  highest: 100,
  high: 75,
  normal: 50,
  low: 25,
  lowest: 0,
} as const;

// ============================================
// Hook 结果
// ============================================

/**
 * Hook 处理结果
 *
 * @template T - 修改后的数据类型
 */
export interface HookResult<T = unknown> {
  /** 是否继续执行后续 hooks 和原始操作 */
  proceed: boolean;
  /** 修改后的数据（用于 tool:before 等可修改上下文的 hooks） */
  modifiedData?: T;
  /** 错误信息（当 proceed 为 false 时可选提供） */
  error?: Error;
}

// ============================================
// 会话相关 Hook 上下文
// ============================================

/**
 * 会话开始 Hook 上下文
 */
export interface SessionStartHookContext {
  /** 会话 ID */
  sessionId: string;
  /** 初始提示 */
  prompt?: string;
  /** 时间戳 */
  timestamp: Date;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 会话结束 Hook 上下文
 */
export interface SessionEndHookContext {
  /** 会话 ID */
  sessionId: string;
  /** 是否成功完成 */
  success: boolean;
  /** 结束原因 */
  reason?: string;
  /** 时间戳 */
  timestamp: Date;
  /** 持续时间（毫秒） */
  duration: number;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 会话错误 Hook 上下文
 */
export interface SessionErrorHookContext {
  /** 会话 ID */
  sessionId: string;
  /** 错误对象 */
  error: Error;
  /** 时间戳 */
  timestamp: Date;
  /** 是否可恢复 */
  recoverable: boolean;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

// ============================================
// 工具相关 Hook 上下文
// ============================================

/**
 * 工具执行前 Hook 上下文
 */
export interface ToolBeforeHookContext {
  /** 会话 ID */
  sessionId: string;
  /** 工具名称 */
  toolName: string;
  /** 工具输入参数 */
  input: Record<string, unknown>;
  /** 时间戳 */
  timestamp: Date;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 工具执行前 Hook 上下文（可修改）
 *
 * 用于 modifiedData 返回
 */
export interface ToolBeforeHookModifiedContext extends ToolBeforeHookContext {
  // 继承所有字段，允许修改 input
}

/**
 * 工具执行后 Hook 上下文
 */
export interface ToolAfterHookContext {
  /** 会话 ID */
  sessionId: string;
  /** 工具名称 */
  toolName: string;
  /** 工具输入参数 */
  input: Record<string, unknown>;
  /** 工具输出结果 */
  output: unknown;
  /** 是否成功 */
  success: boolean;
  /** 错误信息（如果失败） */
  error?: Error;
  /** 执行时间（毫秒） */
  duration: number;
  /** 时间戳 */
  timestamp: Date;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

// ============================================
// 能力相关 Hook 上下文
// ============================================

/**
 * 能力初始化 Hook 上下文
 */
export interface CapabilityInitHookContext {
  /** 能力名称 */
  capabilityName: string;
  /** Agent 上下文引用 */
  context: unknown; // AgentContext，避免循环引用
  /** 时间戳 */
  timestamp: Date;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 能力销毁 Hook 上下文
 */
export interface CapabilityDisposeHookContext {
  /** 能力名称 */
  capabilityName: string;
  /** 时间戳 */
  timestamp: Date;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

// ============================================
// 工作流相关 Hook 上下文
// ============================================

/**
 * 工作流阶段变化 Hook 上下文
 */
export interface WorkflowPhaseHookContext {
  /** 会话 ID */
  sessionId: string;
  /** 当前阶段 */
  phase: string;
  /** 阶段描述 */
  message: string;
  /** 上一阶段 */
  previousPhase?: string;
  /** 时间戳 */
  timestamp: Date;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

// ============================================
// Hook 处理器
// ============================================

/**
 * Hook 处理器函数
 *
 * @template TContext - Hook 上下文类型
 * @template TResult - Hook 结果类型
 */
export type HookHandler<TContext, TResult = HookResult> = (
  context: TContext
) => TResult | Promise<TResult>;

/**
 * Hook 注册选项
 */
export interface HookOptions {
  /** 优先级 */
  priority?: HookPriority;
  /** 是否只执行一次 */
  once?: boolean;
  /** 描述信息 */
  description?: string;
  /** 单个 hook 执行超时时间（毫秒），0 表示无超时 */
  timeout?: number;
}

/**
 * 审计相关 Hook 类型定义
 *
 * 包含错误恢复、缓存、执行追踪等审计追踪相关的 Hook 上下文
 */

// ============================================
// 错误恢复 Hook 上下文
// ============================================

/**
 * 错误恢复 Hook 上下文
 */
export interface ErrorRecoverHookContext {
  /** 会话 ID */
  sessionId: string;
  /** 原始错误 */
  originalError: Error;
  /** 当前尝试次数 */
  attemptNumber: number;
  /** 最大尝试次数 */
  maxAttempts: number;
  /** 恢复策略 */
  recoveryStrategy: 'retry' | 'fallback' | 'abort';
  /** 时间戳 */
  timestamp: Date;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

// ============================================
// 缓存 Hook 上下文
// ============================================

/**
 * 缓存命中 Hook 上下文
 */
export interface CacheHitHookContext {
  /** 缓存键 */
  cacheKey: string;
  /** 缓存值类型 */
  valueType: string;
  /** 缓存年龄（毫秒） */
  age: number;
  /** 时间戳 */
  timestamp: Date;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 缓存未命中 Hook 上下文
 */
export interface CacheMissHookContext {
  /** 缓存键 */
  cacheKey: string;
  /** 时间戳 */
  timestamp: Date;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

// ============================================
// 执行追踪
// ============================================

/**
 * Hook 执行日志条目
 *
 * @remarks `type` 字段使用 string 以避免跨域文件循环依赖，
 * 在 barrel 文件中通过 HookTypeMap 确保类型安全。
 */
export interface HookExecutionLog {
  /** Hook ID */
  hookId: string;
  /** Hook 类型 */
  type: string;
  /** 开始时间戳 */
  startTime: number;
  /** 结束时间戳 */
  endTime: number;
  /** 执行持续时间（毫秒） */
  duration: number;
  /** 是否成功 */
  success: boolean;
  /** 是否超时 */
  timedOut: boolean;
  /** 错误信息（如果失败） */
  error?: Error;
  /** 是否中止了传播 */
  stoppedPropagation?: boolean;
}

/**
 * 执行追踪配置
 */
export interface ExecutionTrackingOptions {
  /** 是否启用追踪 */
  enabled: boolean;
  /** 最大日志条目数（防止内存泄漏） */
  maxLogEntries: number;
}

/**
 * Harness 层类型定义
 *
 * ToolResult — 工具结构化返回类型
 * ErrorCode — 错误码联合类型
 */

// ============================================
// 错误码分类
// ============================================

/** 瞬态错误 — 可静默重试 */
export const TRANSIENT_CODES = ['TIMEOUT', 'NETWORK', 'RATE_LIMITED'] as const;
export type TransientCode = (typeof TRANSIENT_CODES)[number];

/** 可恢复错误 — 注入 hint，LLM 自愈 */
export const RECOVERABLE_CODES = [
  'MATCH_FAILED',
  'MATCH_AMBIGUOUS',
  'NOT_FOUND',
  'PERMISSION',
  'PATH_BLOCKED',
  'INVALID_PARAM',
  'EXEC_ERROR',
  'IO_ERROR',
] as const;
export type RecoverableCode = (typeof RECOVERABLE_CODES)[number];

/** 安全策略阻止 — 不重试，建议告知用户 */
export const BLOCKED_CODES = [
  'DANGEROUS_CMD',
  'COMMAND_BLOCKED',
  'SENSITIVE_FILE',
  'UNKNOWN_COMMAND',
] as const;
export type BlockedCode = (typeof BLOCKED_CODES)[number];

/** 所有错误码 */
export type ErrorCode =
  | 'OK'
  | TransientCode
  | RecoverableCode
  | BlockedCode;

// ============================================
// ToolResult
// ============================================

/**
 * 工具结构化返回类型
 *
 * 所有内置工具的 execute 函数内部返回此类型，
 * 由 withHarness 序列化为 string 后返回给 AI SDK。
 */
export interface ToolResult {
  /** 是否成功 */
  ok: boolean;

  /** 错误码 */
  code: ErrorCode | string;

  /** 成功时的数据（文件内容、命令输出等） */
  data?: string;

  /** 错误描述 */
  error?: string;

  /** 上下文变量，供 hint 模板填充 */
  context?: Record<string, unknown>;

  /** 自定义 hint（覆盖模板生成的 hint） */
  hint?: string;
}

// ============================================
// Harness 配置
// ============================================

export interface RetryConfig {
  /** 最大重试次数（不含首次执行） */
  maxRetries?: number;
  /** 基础延迟（毫秒） */
  baseDelay?: number;
}

export interface HarnessConfig extends RetryConfig {
  /** 工具名称（用于从 hint-registry 按工具查找 hint 模板） */
  toolName?: string;
  /** 自定义 hint 模板（优先级最高，覆盖 toolName 和全局模板） */
  hintTemplates?: HintTemplateMap;
}

export type HintTemplate = (context: Record<string, unknown>) => string;
export type HintTemplateMap = Record<string, HintTemplate>;

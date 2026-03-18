/**
 * Hook 类型定义
 *
 * 定义 hooks 系统的核心类型
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
// Hook 上下文
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
// 扩展 Hook 上下文
// ============================================

/**
 * Provider 切换前 Hook 上下文
 */
export interface ProviderBeforeChangeHookContext {
  /** 会话 ID */
  sessionId: string;
  /** 当前 Provider */
  previousProvider: string;
  /** 目标 Provider ID */
  newProviderId: string;
  /** 时间戳 */
  timestamp: Date;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * Provider 切换后 Hook 上下文
 */
export interface ProviderAfterChangeHookContext {
  /** 会话 ID */
  sessionId: string;
  /** 之前的 Provider */
  previousProvider: string;
  /** 新的 Provider */
  newProvider: string;
  /** 切换是否成功 */
  success: boolean;
  /** 时间戳 */
  timestamp: Date;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * Skill 匹配 Hook 上下文
 */
export interface SkillMatchHookContext {
  /** 会话 ID */
  sessionId: string;
  /** 用户输入 */
  input: string;
  /** 匹配到的技能 */
  matchedSkill: string;
  /** 匹配分数 */
  matchScore: number;
  /** 时间戳 */
  timestamp: Date;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * Agent 启动 Hook 上下文
 */
export interface AgentSpawnHookContext {
  /** 父会话 ID */
  parentSessionId: string;
  /** Agent 名称 */
  agentName: string;
  /** 执行提示 */
  prompt: string;
  /** 时间戳 */
  timestamp: Date;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * Agent 完成 Hook 上下文
 */
export interface AgentCompleteHookContext {
  /** 父会话 ID */
  parentSessionId: string;
  /** Agent 名称 */
  agentName: string;
  /** 执行结果摘要 */
  resultSummary?: string;
  /** 执行时间（毫秒） */
  duration: number;
  /** 是否成功 */
  success: boolean;
  /** 错误信息 */
  error?: Error;
  /** 时间戳 */
  timestamp: Date;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 配置更新前 Hook 上下文
 */
export interface ConfigBeforeUpdateHookContext {
  /** 会话 ID */
  sessionId?: string;
  /** 当前配置 */
  currentConfig: Record<string, unknown>;
  /** 更新内容 */
  updates: Record<string, unknown>;
  /** 时间戳 */
  timestamp: Date;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 配置更新后 Hook 上下文
 */
export interface ConfigAfterUpdateHookContext {
  /** 会话 ID */
  sessionId?: string;
  /** 之前的配置 */
  previousConfig: Record<string, unknown>;
  /** 新配置 */
  newConfig: Record<string, unknown>;
  /** 是否需要重启 */
  requiresRestart: boolean;
  /** 更新是否成功 */
  success: boolean;
  /** 时间戳 */
  timestamp: Date;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

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
// Hook 类型映射
// ============================================

/**
 * Hook 类型到上下文的映射
 */
export interface HookTypeMap {
  // 会话相关
  'session:start': SessionStartHookContext;
  'session:end': SessionEndHookContext;
  'session:error': SessionErrorHookContext;
  // 工具相关
  'tool:before': ToolBeforeHookContext;
  'tool:after': ToolAfterHookContext;
  // 能力相关
  'capability:init': CapabilityInitHookContext;
  'capability:dispose': CapabilityDisposeHookContext;
  // 工作流相关
  'workflow:phase': WorkflowPhaseHookContext;
  // Provider 相关
  'provider:beforeChange': ProviderBeforeChangeHookContext;
  'provider:afterChange': ProviderAfterChangeHookContext;
  // Skill 相关
  'skill:match': SkillMatchHookContext;
  // Agent 相关
  'agent:spawn': AgentSpawnHookContext;
  'agent:complete': AgentCompleteHookContext;
  // 配置相关
  'config:beforeUpdate': ConfigBeforeUpdateHookContext;
  'config:afterUpdate': ConfigAfterUpdateHookContext;
  // 错误恢复
  'error:recover': ErrorRecoverHookContext;
  // 缓存相关
  'cache:hit': CacheHitHookContext;
  'cache:miss': CacheMissHookContext;
}

/**
 * 所有 Hook 类型
 */
export type HookType = keyof HookTypeMap;

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

// ============================================
// 执行追踪
// ============================================

/**
 * Hook 执行日志条目
 */
export interface HookExecutionLog {
  /** Hook ID */
  hookId: string;
  /** Hook 类型 */
  type: HookType;
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

/**
 * 已注册的 Hook 信息
 */
export interface RegisteredHook<TContext = unknown> {
  /** Hook ID */
  id: string;
  /** Hook 类型 */
  type: HookType;
  /** 处理器函数 */
  handler: HookHandler<TContext>;
  /** 优先级数值 */
  priority: number;
  /** 是否只执行一次 */
  once: boolean;
  /** 描述信息 */
  description?: string;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 注册时间 */
  registeredAt: Date;
}

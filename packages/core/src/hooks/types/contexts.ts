/**
 * 扩展 Hook 上下文类型定义
 *
 * 包含 Provider、Skill、Agent、配置等扩展上下文，
 * 以及 HookTypeMap、HookType、RegisteredHook 等聚合类型。
 */

import type {
  SessionStartHookContext,
  SessionEndHookContext,
  SessionErrorHookContext,
  ToolBeforeHookContext,
  ToolAfterHookContext,
  CapabilityInitHookContext,
  CapabilityDisposeHookContext,
  WorkflowPhaseHookContext,
  HookHandler,
} from './core.js';
import type {
  ErrorRecoverHookContext,
  CacheHitHookContext,
  CacheMissHookContext,
} from './audit.js';
import type {
  TimeoutApiHookContext,
  TimeoutExecutionHookContext,
  TimeoutStalledHookContext,
  HealthHeartbeatHookContext,
  AgentThinkingHookContext,
  TaskProgressHookContext,
  NotificationPushHookContext,
} from './monitoring.js';

// ============================================
// Provider 相关 Hook 上下文
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

// ============================================
// Skill 相关 Hook 上下文
// ============================================

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

// ============================================
// Agent 相关 Hook 上下文
// ============================================

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

// ============================================
// 配置相关 Hook 上下文
// ============================================

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

// ============================================
// Worker Hook 上下文（Coordinator + Worker 模式）
// ============================================

/**
 * Worker Hook 上下文
 *
 * 所有 worker:* 事件共享此上下文类型。
 * 不同事件通过不同的字段组合传递信息。
 */
export interface WorkerHookContext {
  /** 会话 ID */
  sessionId: string;
  /** Worker 唯一标识 */
  workerId: string;
  /** Worker 类型 */
  workerType?: string;
  /** 任务描述 */
  description?: string;
  /** 工具名称（tool-call/tool-result） */
  toolName?: string;
  /** 工具输入（tool-call） */
  input?: unknown;
  /** 工具输出（tool-result） */
  output?: unknown;
  /** 文本内容（reasoning） */
  text?: string;
  /** 是否成功（complete） */
  success?: boolean;
  /** 错误信息 */
  error?: string;
  /** 执行时长（毫秒） */
  duration?: number;
  /** 时间戳 */
  timestamp: Date;
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
  // 超时和健康检查
  'timeout:api': TimeoutApiHookContext;
  'timeout:execution': TimeoutExecutionHookContext;
  'timeout:stalled': TimeoutStalledHookContext;
  'health:heartbeat': HealthHeartbeatHookContext;
  // 推送相关
  'agent:thinking': AgentThinkingHookContext;
  'task:progress': TaskProgressHookContext;
  'notification:push': NotificationPushHookContext;
  // Worker 相关（Coordinator + Worker 模式）
  'worker:start': WorkerHookContext;
  'worker:tool-call': WorkerHookContext;
  'worker:tool-result': WorkerHookContext;
  'worker:reasoning': WorkerHookContext;
  'worker:complete': WorkerHookContext;
}

/**
 * 所有 Hook 类型
 */
export type HookType = keyof HookTypeMap;

// ============================================
// 已注册的 Hook 信息
// ============================================

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

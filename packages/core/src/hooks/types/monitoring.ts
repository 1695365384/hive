/**
 * 监控相关 Hook 类型定义
 *
 * 包含推送通知、Agent 思考过程、任务进度、超时、健康检查等监控相关的 Hook 上下文
 */

// ============================================
// 超时和健康检查 Hook 上下文
// ============================================

/**
 * API 超时 Hook 上下文
 */
export interface TimeoutApiHookContext {
  /** 会话 ID */
  sessionId: string;
  /** 错误对象 */
  error: Error;
  /** 当前尝试次数 */
  attempt: number;
  /** 最大尝试次数 */
  maxAttempts: number;
  /** 超时时间（毫秒） */
  timeout: number;
  /** 时间戳 */
  timestamp: Date;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 执行超时 Hook 上下文
 */
export interface TimeoutExecutionHookContext {
  /** 会话 ID */
  sessionId: string;
  /** 超时时间（毫秒） */
  timeout: number;
  /** 时间戳 */
  timestamp: Date;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 卡住检测 Hook 上下文
 */
export interface TimeoutStalledHookContext {
  /** 会话 ID */
  sessionId: string;
  /** 最后活动时间戳 */
  lastActivity: number;
  /** 卡住持续时间（毫秒） */
  stallDuration: number;
  /** 卡住超时阈值（毫秒） */
  stallTimeout: number;
  /** 时间戳 */
  timestamp: Date;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 心跳 Hook 上下文
 */
export interface HealthHeartbeatHookContext {
  /** 会话 ID */
  sessionId: string;
  /** 最后活动时间戳 */
  lastActivity: number;
  /** 距离上次活动的时间（毫秒） */
  timeSinceLastActivity: number;
  /** 时间戳 */
  timestamp: Date;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

// ============================================
// 推送相关 Hook 上下文
// ============================================

/**
 * Agent 思考过程 Hook 上下文
 */
export interface AgentThinkingHookContext {
  /** 会话 ID */
  sessionId: string;
  /** 思考内容 */
  thought: string;
  /** 思考类型 */
  type: 'analyzing' | 'planning' | 'executing' | 'reflecting';
  /** 时间戳 */
  timestamp: Date;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 任务进度 Hook 上下文
 */
export interface TaskProgressHookContext {
  /** 会话 ID */
  sessionId: string;
  /** 任务 ID */
  taskId: string;
  /** 任务描述 */
  description: string;
  /** 进度百分比 (0-100) */
  progress: number;
  /** 当前步骤 */
  currentStep?: string;
  /** 总步骤数 */
  totalSteps?: number;
  /** 时间戳 */
  timestamp: Date;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 通知类型
 */
export type NotificationType = 'info' | 'warning' | 'success' | 'error';

/**
 * 通用推送通知 Hook 上下文
 */
export interface NotificationPushHookContext {
  /** 会话 ID */
  sessionId: string;
  /** 通知类型 */
  type: NotificationType;
  /** 通知标题 */
  title: string;
  /** 通知内容 */
  message: string;
  /** 时间戳 */
  timestamp: Date;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 共享类型定义
 *
 * 这些类型尚未从 @aiclaw/core 导出，在此处统一定义避免重复
 */

/**
 * Agent 思考事件上下文
 */
export interface AgentThinkingHookContext {
  sessionId: string;
  thought: string;
  type: 'analyzing' | 'planning' | 'executing' | 'reflecting';
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

/**
 * 任务进度事件上下文
 */
export interface TaskProgressHookContext {
  sessionId: string;
  taskId: string;
  description: string;
  progress: number;
  currentStep?: string;
  totalSteps?: number;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

/**
 * 通知推送事件上下文
 */
export interface NotificationPushHookContext {
  sessionId: string;
  type: 'info' | 'warning' | 'success' | 'error';
  title: string;
  message: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

/**
 * 工具调用前事件上下文
 */
export interface ToolBeforeHookContext {
  sessionId: string;
  toolName: string;
  input: Record<string, unknown>;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

/**
 * 通信协议类型定义
 *
 * 与 Rust 后端和前端保持一致的协议定义
 */

/**
 * 请求类型
 */
export type RequestType = 'chat' | 'explore' | 'plan' | 'workflow' | 'stop' | 'get_config';

/**
 * 请求结构
 */
export interface Request {
  /** 请求 ID */
  id: string;
  /** 请求类型 */
  type: RequestType;
  /** 请求参数 */
  payload: unknown;
  /** 是否流式请求 */
  stream?: boolean;
}

/**
 * 流式事件类型
 */
export type StreamEventType =
  | 'thinking'
  | 'chunk'
  | 'tool_use'
  | 'progress'
  | 'error'
  | 'done';

/**
 * 流式事件
 */
export interface StreamEvent {
  /** 对应请求 ID */
  id: string;
  /** 事件类型 */
  event: StreamEventType;
  /** 事件数据 */
  data: unknown;
}

/**
 * Chat 请求参数
 */
export interface ChatPayload {
  /** 用户输入 */
  prompt: string;
  /** 提供商 ID（可选） */
  provider_id?: string;
  /** 模型 ID（可选） */
  model_id?: string;
  /** 会话 ID（可选） */
  session_id?: string;
}

/**
 * Explore 请求参数
 */
export interface ExplorePayload {
  /** 探索提示 */
  prompt: string;
  /** 探索深度：quick | medium | very-thorough */
  thoroughness?: 'quick' | 'medium' | 'very-thorough';
}

/**
 * Plan 请求参数
 */
export interface PlanPayload {
  /** 计划提示 */
  prompt: string;
}

/**
 * Workflow 请求参数
 */
export interface WorkflowPayload {
  /** 任务描述 */
  task: string;
  /** 工作目录 */
  cwd?: string;
  /** 最大轮次 */
  maxTurns?: number;
}

/**
 * Stop 请求参数
 */
export interface StopPayload {
  /** 要停止的请求 ID */
  request_id: string;
}

/**
 * 创建流式事件
 */
export function createEvent(
  id: string,
  event: StreamEventType,
  data: unknown
): StreamEvent {
  return { id, event, data };
}

/**
 * 创建思考事件
 */
export function thinkingEvent(id: string, content: string): StreamEvent {
  return createEvent(id, 'thinking', { content });
}

/**
 * 创建内容块事件
 */
export function chunkEvent(id: string, content: string): StreamEvent {
  return createEvent(id, 'chunk', { content });
}

/**
 * 创建工具调用事件
 */
export function toolUseEvent(
  id: string,
  toolName: string,
  toolInput: unknown
): StreamEvent {
  return createEvent(id, 'tool_use', {
    tool_name: toolName,
    tool_input: toolInput,
  });
}

/**
 * 创建进度事件
 */
export function progressEvent(
  id: string,
  current: number,
  total: number,
  message: string
): StreamEvent {
  return createEvent(id, 'progress', { current, total, message });
}

/**
 * 创建错误事件
 */
export function errorEvent(id: string, error: string): StreamEvent {
  return createEvent(id, 'error', { error });
}

/**
 * 创建完成事件
 */
export function doneEvent(id: string): StreamEvent {
  return createEvent(id, 'done', {});
}

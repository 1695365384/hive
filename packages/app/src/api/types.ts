/**
 * Agent API 类型定义
 */

/**
 * 请求类型
 */
export type RequestType = 'chat' | 'explore' | 'plan' | 'workflow' | 'stop';

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
  data: Record<string, unknown>;
}

/**
 * 思考事件数据
 */
export interface ThinkingData {
  content: string;
}

/**
 * 内容块事件数据
 */
export interface ChunkData {
  content: string;
}

/**
 * 工具调用事件数据
 */
export interface ToolUseData {
  tool_name: string;
  tool_input: Record<string, unknown>;
}

/**
 * 进度事件数据
 */
export interface ProgressData {
  current: number;
  total: number;
  message: string;
}

/**
 * 错误事件数据
 */
export interface ErrorData {
  error: string;
}

/**
 * Service 状态
 */
export type ServiceStatus =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'error';

/**
 * Chat 请求参数
 */
export interface ChatOptions {
  /** 用户输入 */
  prompt: string;
  /** 提供商 ID（可选） */
  providerId?: string;
  /** 模型 ID（可选） */
  modelId?: string;
  /** 会话 ID（可选） */
  sessionId?: string;
}

/**
 * 流式 Chat 选项
 */
export interface StreamChatOptions extends ChatOptions {
  /** 事件回调 */
  onEvent: (event: StreamEvent) => void;
  /** 错误回调 */
  onError?: (error: Error) => void;
  /** 完成回调 */
  onDone?: () => void;
}

/**
 * 模型信息
 */
export interface Model {
  /** 模型 ID */
  id: string;
  /** 模型名称 */
  name: string;
}

/**
 * 提供商信息
 */
export interface Provider {
  /** 提供商 ID */
  id: string;
  /** 提供商名称 */
  name: string;
  /** 可用模型列表 */
  models: Model[];
}

/**
 * Agent 类型
 */
export interface AgentType {
  /** Agent ID */
  id: string;
  /** Agent 名称 */
  name: string;
  /** Agent 描述 */
  description: string;
}

/**
 * 配置信息
 */
export interface Config {
  /** 可用提供商列表 */
  providers: Provider[];
  /** 可用 Agent 列表 */
  agents: AgentType[];
}

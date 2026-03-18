// 消息类型
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
}

// SSE 事件类型
export type SSEEventType = 'text' | 'tool' | 'error' | 'done';

export interface SSEEvent {
  type: SSEEventType;
  content?: string;
  name?: string;
  message?: string;
}

// 配置类型
export interface Provider {
  id: string;
  name: string;
  models: Model[];
}

export interface Model {
  id: string;
  name: string;
}

export interface AgentType {
  id: string;
  name: string;
  description: string;
}

// 偏好设置
export interface Preferences {
  provider?: string;
  model?: string;
  agentType?: string;
}

// API 响应
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

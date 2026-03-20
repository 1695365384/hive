// 消息类型
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
}

// 配置类型（从 api/types.ts 重新导出）
export type { Provider, Model, AgentType } from '../api/types';

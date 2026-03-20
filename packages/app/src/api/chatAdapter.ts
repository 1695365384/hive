/**
 * Chat API 适配器
 *
 * 根据环境自动选择通信方式：
 * - 开发模式 + 非 Tauri 环境 → WebSocket
 * - 生产模式 / Tauri 环境 → Tauri IPC
 */

import type { StreamEvent, ChunkData, ThinkingData, ToolUseData, ProgressData, ErrorData } from './types';
import { WsChatApi } from './wsChatAdapter';

/**
 * 统一的聊天事件类型
 */
export type UnifiedChatEventType =
  | 'text'      // 文本内容
  | 'thinking'  // 思考过程
  | 'tool'      // 工具调用
  | 'progress'  // 进度
  | 'error'     // 错误
  | 'done';     // 完成

/**
 * 统一的聊天事件
 */
export interface UnifiedChatEvent {
  /** 事件类型 */
  type: UnifiedChatEventType;
  /** 文本内容（text/thinking 类型） */
  content?: string;
  /** 错误消息（error 类型） */
  message?: string;
  /** 元数据（tool/progress 类型） */
  metadata?: Record<string, unknown>;
}

/**
 * 统一的聊天选项
 */
export interface UnifiedChatOptions {
  /** 用户输入 */
  prompt: string;
  /** 提供商 ID（可选） */
  providerId?: string;
  /** 模型 ID（可选） */
  modelId?: string;
  /** 会话 ID（可选） */
  sessionId?: string;
  /** 事件回调 */
  onEvent: (event: UnifiedChatEvent) => void;
}

/**
 * Chat API 接口
 */
export interface ChatApi {
  /** 流式聊天 */
  chatStream(options: UnifiedChatOptions): Promise<string>;
  /** 停止请求 */
  stop(requestId: string): Promise<void>;
}

/**
 * 映射 Tauri StreamEvent 到统一事件格式
 */
function mapTauriEvent(event: StreamEvent): UnifiedChatEvent {
  switch (event.event) {
    case 'chunk': {
      const data = event.data as unknown as ChunkData;
      return { type: 'text', content: data.content };
    }
    case 'thinking': {
      const data = event.data as unknown as ThinkingData;
      return { type: 'thinking', content: data.content };
    }
    case 'tool_use': {
      const data = event.data as unknown as ToolUseData;
      return {
        type: 'tool',
        metadata: {
          toolName: data.tool_name,
          toolInput: data.tool_input,
        },
      };
    }
    case 'progress': {
      const data = event.data as unknown as ProgressData;
      return {
        type: 'progress',
        metadata: {
          current: data.current,
          total: data.total,
          message: data.message,
        },
      };
    }
    case 'error': {
      const data = event.data as unknown as ErrorData;
      return { type: 'error', message: data.error };
    }
    case 'done': {
      return { type: 'done' };
    }
    default: {
      return { type: 'error', message: `Unknown event type: ${(event as { event: string }).event}` };
    }
  }
}

/**
 * Tauri 环境 Chat API 实现
 */
class TauriChatApi implements ChatApi {
  async chatStream(options: UnifiedChatOptions): Promise<string> {
    // 动态导入 Tauri API，避免在非 Tauri 环境报错
    const { chatStream: tauriChatStream } = await import('./agent');

    const requestId = await tauriChatStream({
      prompt: options.prompt,
      providerId: options.providerId,
      modelId: options.modelId,
      sessionId: options.sessionId,
      onEvent: (event: StreamEvent) => {
        const unifiedEvent = mapTauriEvent(event);
        options.onEvent(unifiedEvent);
      },
      onError: (error: Error) => {
        options.onEvent({ type: 'error', message: error.message });
      },
      onDone: () => {
        options.onEvent({ type: 'done' });
      },
    });

    return requestId;
  }

  async stop(requestId: string): Promise<void> {
    // 动态导入 Tauri API
    const { stop: tauriStop } = await import('./agent');
    await tauriStop(requestId);
  }
}

// 缓存的 API 实例
let cachedApi: ChatApi | null = null;

/**
 * 检测是否应该使用 WebSocket 模式
 *
 * 条件：开发模式 且 不在 Tauri 环境中
 */
function shouldUseWebSocket(): boolean {
  // 检查是否在开发模式
  const isDev = import.meta.env.DEV;

  // 检查是否在 Tauri 环境（通过检查全局 __TAURI__ 对象）
  const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;

  // 开发模式且非 Tauri 环境使用 WebSocket
  return isDev && !isTauri;
}

/**
 * 获取 WebSocket URL
 *
 * 优先使用环境变量，否则使用默认值
 */
function getWebSocketUrl(): string {
  return import.meta.env.VITE_WS_URL || 'ws://localhost:3001';
}

/**
 * 获取 Chat API 实例
 */
export function getChatApi(): ChatApi {
  if (!cachedApi) {
    if (shouldUseWebSocket()) {
      console.log('[ChatAdapter] Using WebSocket mode');
      cachedApi = new WsChatApi(getWebSocketUrl());
    } else {
      console.log('[ChatAdapter] Using Tauri IPC mode');
      cachedApi = new TauriChatApi();
    }
  }
  return cachedApi;
}

/**
 * 重置缓存的 API 实例（用于测试）
 */
export function resetChatApi(): void {
  cachedApi = null;
}

// 默认导出单例
export default getChatApi;

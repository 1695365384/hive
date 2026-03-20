/**
 * WebSocket Chat API 适配器
 *
 * 实现 ChatApi 接口，通过 WebSocket 与 Service 通信
 */

import { WsClient, generateId } from './ws-client';
import type { ChatApi, UnifiedChatOptions, UnifiedChatEvent } from './chatAdapter';
import type { StreamEvent } from './types';

/**
 * 映射 StreamEvent 到统一事件格式
 */
function mapWsEvent(event: StreamEvent): UnifiedChatEvent {
  switch (event.event) {
    case 'chunk': {
      const data = event.data as { content?: string };
      return { type: 'text', content: data.content || '' };
    }
    case 'thinking': {
      const data = event.data as { content?: string };
      return { type: 'thinking', content: data.content || '' };
    }
    case 'tool_use': {
      const data = event.data as { tool_name?: string; tool_input?: unknown };
      return {
        type: 'tool',
        metadata: {
          toolName: data.tool_name,
          toolInput: data.tool_input,
        },
      };
    }
    case 'progress': {
      const data = event.data as { current?: number; total?: number; message?: string };
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
      const data = event.data as { error?: string };
      return { type: 'error', message: data.error || 'Unknown error' };
    }
    case 'done': {
      return { type: 'done' };
    }
    default: {
      return { type: 'error', message: `Unknown event type: ${JSON.stringify(event)}` };
    }
  }
}

/**
 * WebSocket Chat API 实现
 */
export class WsChatApi implements ChatApi {
  private client: WsClient;
  private pendingRequests: Map<string, {
    onEvent: (event: UnifiedChatEvent) => void;
  }> = new Map();
  private connectionPromise: Promise<void> | null = null;

  constructor(url: string) {
    this.client = new WsClient({ url });

    // 设置事件处理
    this.client.on({
      onEvent: (event: StreamEvent) => {
        this.handleEvent(event);
      },
      onDisconnect: () => {
        // 通知所有待处理请求连接已断开
        for (const [requestId, handler] of this.pendingRequests) {
          handler.onEvent({
            type: 'error',
            message: 'WebSocket connection lost',
          });
        }
        this.pendingRequests.clear();
      },
      onError: (error: Error) => {
        console.error('[WsChatApi] WebSocket error:', error);
      },
    });
  }

  /**
   * 确保已连接
   */
  private async ensureConnected(): Promise<void> {
    if (this.client.isConnected) {
      return;
    }

    if (!this.connectionPromise) {
      this.connectionPromise = this.client.connect();
    }

    await this.connectionPromise;
  }

  /**
   * 处理收到的事件
   */
  private handleEvent(event: StreamEvent): void {
    // 忽略系统事件
    if (event.id === 'system') {
      console.log('[WsChatApi] System event:', event);
      return;
    }

    const handler = this.pendingRequests.get(event.id);
    if (handler) {
      const unifiedEvent = mapWsEvent(event);
      handler.onEvent(unifiedEvent);

      // 完成或错误时移除处理器
      if (event.event === 'done' || event.event === 'error') {
        this.pendingRequests.delete(event.id);
      }
    }
  }

  /**
   * 发送流式聊天请求
   */
  async chatStream(options: UnifiedChatOptions): Promise<string> {
    await this.ensureConnected();

    const requestId = generateId();

    // 注册处理器
    this.pendingRequests.set(requestId, {
      onEvent: options.onEvent,
    });

    // 发送请求
    try {
      this.client.send({
        id: requestId,
        type: 'chat',
        payload: {
          prompt: options.prompt,
          provider_id: options.providerId,
          model_id: options.modelId,
          session_id: options.sessionId,
        },
        stream: true,
      });
    } catch (error) {
      this.pendingRequests.delete(requestId);
      throw error;
    }

    return requestId;
  }

  /**
   * 停止请求
   */
  async stop(requestId: string): Promise<void> {
    if (!this.client.isConnected) {
      return;
    }

    // 发送停止请求
    this.client.send({
      id: generateId(),
      type: 'stop',
      payload: {
        request_id: requestId,
      },
    });

    // 移除处理器
    this.pendingRequests.delete(requestId);
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    this.client.disconnect();
    this.pendingRequests.clear();
    this.connectionPromise = null;
  }

  /**
   * 获取连接状态
   */
  get isConnected(): boolean {
    return this.client.isConnected;
  }
}

/**
 * WebSocket 客户端
 *
 * 提供与 Service 端 WebSocket 服务器的通信能力
 */

import type { StreamEvent } from './types';

/**
 * WebSocket 帧类型
 */
interface WsFrame {
  kind: 'event';
  data: StreamEvent;
}

/**
 * WebSocket 请求帧
 */
interface WsRequestFrame {
  kind: 'request';
  data: {
    id: string;
    type: string;
    payload: unknown;
    stream?: boolean;
  };
}

/**
 * WebSocket 客户端选项
 */
export interface WsClientOptions {
  /** WebSocket URL */
  url: string;
  /** 连接超时（毫秒） */
  connectTimeout?: number;
  /** 重连延迟（毫秒） */
  reconnectDelay?: number;
  /** 最大重连次数 */
  maxReconnectAttempts?: number;
  /** 心跳间隔（毫秒） */
  heartbeatInterval?: number;
}

/**
 * WebSocket 客户端事件
 */
export interface WsClientEvents {
  /** 连接成功 */
  onConnect?: () => void;
  /** 连接断开 */
  onDisconnect?: () => void;
  /** 连接错误 */
  onError?: (error: Error) => void;
  /** 收到事件 */
  onEvent?: (event: StreamEvent) => void;
  /** 重连中 */
  onReconnecting?: (attempt: number) => void;
}

/**
 * WebSocket 客户端
 */
export class WsClient {
  private ws: WebSocket | null = null;
  private options: WsClientOptions;
  private events: WsClientEvents = {};
  private reconnectAttempts = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private isManualClose = false;

  constructor(options: WsClientOptions) {
    this.options = {
      connectTimeout: 10000,
      reconnectDelay: 3000,
      maxReconnectAttempts: 5,
      heartbeatInterval: 30000,
      ...options,
    };
  }

  /**
   * 设置事件监听器
   */
  on(events: WsClientEvents): void {
    this.events = { ...this.events, ...events };
  }

  /**
   * 连接到服务器
   */
  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    this.isManualClose = false;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, this.options.connectTimeout);

      try {
        this.ws = new WebSocket(this.options.url);

        this.ws.onopen = () => {
          clearTimeout(timeout);
          this.reconnectAttempts = 0;
          this.startHeartbeat();
          this.events.onConnect?.();
          resolve();
        };

        this.ws.onclose = (event) => {
          clearTimeout(timeout);
          this.stopHeartbeat();

          if (!this.isManualClose) {
            this.events.onDisconnect?.();
            this.attemptReconnect();
          }
        };

        this.ws.onerror = (error) => {
          clearTimeout(timeout);
          const err = new Error('WebSocket error');
          this.events.onError?.(err);
          reject(err);
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  /**
   * 处理接收到的消息
   */
  private handleMessage(data: string): void {
    try {
      const frame: WsFrame = JSON.parse(data);

      if (frame.kind === 'event') {
        this.events.onEvent?.(frame.data);
      }
    } catch (error) {
      console.error('[WsClient] Failed to parse message:', error);
    }
  }

  /**
   * 发送请求
   */
  send(request: WsRequestFrame['data']): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }

    const frame: WsRequestFrame = {
      kind: 'request',
      data: request,
    };

    this.ws.send(JSON.stringify(frame));
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    this.isManualClose = true;
    this.stopHeartbeat();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * 获取连接状态
   */
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * 开始心跳
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();

    if (this.options.heartbeatInterval && this.options.heartbeatInterval > 0) {
      this.heartbeatTimer = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          // 发送 ping（通过空请求保持连接活跃）
          this.ws.send(JSON.stringify({ kind: 'ping' }));
        }
      }, this.options.heartbeatInterval);
    }
  }

  /**
   * 停止心跳
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * 尝试重连
   */
  private attemptReconnect(): void {
    if (this.isManualClose) {
      return;
    }

    if (this.reconnectAttempts >= (this.options.maxReconnectAttempts || 5)) {
      this.events.onError?.(new Error('Max reconnect attempts reached'));
      return;
    }

    this.reconnectAttempts++;
    this.events.onReconnecting?.(this.reconnectAttempts);

    setTimeout(() => {
      this.connect().catch((error) => {
        console.error('[WsClient] Reconnect failed:', error);
      });
    }, this.options.reconnectDelay);
  }
}

/**
 * 生成唯一 ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

import WebSocket from 'ws';
import type { FeishuConfig, FeishuEvent, FeishuAck, FeishuMessage, FeishuResponse, FeishuError } from './types.js';

/**
 * Feishu WebSocket Client
 *
 * Connects to Feishu (Lark) servers via WebSocket.
 * Not a WebSocket server - this is a client that connects TO Feishu.
 */
export class FeishuClient {
  private ws: WebSocket | null = null;
  private config: Required<FeishuConfig>;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts: number;
  private readonly reconnectDelay: number;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private messageQueue: FeishuResponse[] = [];
  private eventHandlers: Map<string, Set<(event: FeishuEvent) => void>> = new Map();

  constructor(config: FeishuConfig) {
    this.config = {
    endpoint: config.endpoint ?? 'wss://open.feishu.cn/open-apis/ws/v2',
    verifyToken: config.verifyToken ?? '',
    appId: config.appId,
    appSecret: config.appSecret
    };
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
  }

  /**
   * Connect to Feishu WebSocket server
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `${this.config.endpoint}?appId=${this.config.appId}`;

      this.ws = new WebSocket(url);

      this.ws.on('open', () => {
        this.startHeartbeat();
        this.flushMessageQueue();
        resolve();
      });

      this.ws.on('message', (data: Buffer) => {
        this.handleMessage(data);
      });

      this.ws.on('error', (error: Error) => {
        this.handleError(error);
        reject(error);
      });

      this.ws.on('close', () => {
        this.handleDisconnect();
      });
    });
  }

  /**
   * Disconnect from Feishu
   */
  disconnect(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Send message to Feishu
   */
  async sendMessage(response: FeishuResponse): Promise<void> {
    const payload = JSON.stringify({
      type: 'message',
      data: response
    });

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(payload);
    } else {
      // Queue message if not connected
      this.messageQueue.push(response);
    }
  }

  /**
   * Subscribe to Feishu events
   */
  on(eventType: string, handler: (event: FeishuEvent) => void): void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }
    this.eventHandlers.get(eventType)!.add(handler);
  }

  /**
   * Unsubscribe from Feishu events
   */
  off(eventType: string, handler: (event: FeishuEvent) => void): void {
    this.eventHandlers.get(eventType)?.delete(handler);
  }

  /**
   * Get tenant access token
   */
  private async getAccessToken(): Promise<string> {
    const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        app_id: this.config.appId,
        app_secret: this.config.appSecret
      })
    });

    const data = await response.json();
    return data.tenant_access_token;
  }

  /**
   * Start heartbeat to keep connection alive
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);
  }

  /**
   * Handle incoming message
   */
  private handleMessage(data: Buffer): void {
    try {
      const message = JSON.parse(data.toString());

      if (message.type === 'ack') {
        this.handleAck(message as FeishuAck);
      } else if (message.type === 'event') {
        this.handleEvent(message as FeishuEvent);
      } else if (message.type === 'error') {
        this.handleFeishuError(message as FeishuError);
      }
    } catch (error) {
      this.handleError(error as Error);
    }
  }

  /**
   * Handle acknowledgment
   */
  private handleAck(ack: FeishuAck): void {
    // Ack received, message delivered successfully
  }

  /**
   * Handle Feishu event
   */
  private handleEvent(event: FeishuEvent): void {
    const handlers = this.eventHandlers.get(event.type);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(event);
        } catch (error) {
          this.handleError(error as Error);
        }
      });
    }
  }

  /**
   * Handle Feishu error
   */
  private handleFeishuError(error: FeishuError): void {
    this.handleError(new Error(`Feishu error ${error.code}: ${error.message}`));
  }

  /**
   * Handle disconnect and attempt reconnect
   */
  private handleDisconnect(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      setTimeout(() => {
        this.connect().catch(this.handleError.bind(this));
      }, delay);
    }
  }

  /**
   * Handle error
   */
  private handleError(error: Error): void {
    console.error('[FeishuClient]', error);
  }

  /**
   * Flush queued messages
   */
  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      const message = this.messageQueue.shift();
      if (message) {
        this.sendMessage(message);
      }
    }
  }
}

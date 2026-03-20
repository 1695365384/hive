/**
 * WebSocket 服务器
 *
 * 提供 WebSocket 通信能力，用于：
 * - 开发模式：前端直接连接
 * - 生产模式：Rust 端通过 WS 连接
 */

import { WebSocketServer, WebSocket, RawData } from 'ws';
import type { Request, StreamEvent } from './protocol.js';
import { createEvent } from './protocol.js';
import { defaultHandler, type EventSender } from './bridge.js';
import { getAgentManager, resetAgentManager } from './agent-manager.js';
import { initializeConfig, getConfig, validateConfig } from './config.js';

/**
 * WebSocket 帧类型
 */
interface WsFrame {
  kind: 'request';
  data: Request;
}

/**
 * WebSocket 服务器选项
 */
export interface WsServerOptions {
  /** 端口号（默认 3001） */
  port?: number;
  /** 服务配置 */
  config?: Parameters<typeof initializeConfig>[0];
  /** 是否验证配置（默认 true） */
  validateConfig?: boolean;
}

/**
 * 活跃连接
 */
interface ActiveConnection {
  /** WebSocket 连接 */
  ws: WebSocket;
  /** 活跃请求 ID 集合 */
  activeRequests: Set<string>;
}

/**
 * WebSocket 服务器实例
 */
export class WsServer {
  private wss: WebSocketServer | null = null;
  private connections: Map<WebSocket, ActiveConnection> = new Map();
  private port: number;

  constructor(port: number = 3001) {
    this.port = port;
  }

  /**
   * 启动 WebSocket 服务器
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.wss = new WebSocketServer({ port: this.port });

      this.wss.on('error', (error) => {
        console.error('[WsServer] Server error:', error);
        reject(error);
      });

      this.wss.on('listening', () => {
        console.error(`[WsServer] WebSocket server listening on port ${this.port}`);
        // 输出端口信息供 Rust 解析
        console.log(`AICLAW_WS_PORT=${this.port}`);
        resolve();
      });

      this.wss.on('connection', (ws, req) => {
        const clientIp = req.socket.remoteAddress || 'unknown';
        console.error(`[WsServer] New connection from ${clientIp}`);

        const connection: ActiveConnection = {
          ws,
          activeRequests: new Set(),
        };
        this.connections.set(ws, connection);

        ws.on('message', (data: RawData) => {
          this.handleMessage(ws, data).catch((error) => {
            console.error('[WsServer] Error handling message:', error);
          });
        });

        ws.on('close', () => {
          console.error('[WsServer] Connection closed');
          this.connections.delete(ws);
        });

        ws.on('error', (error) => {
          console.error('[WsServer] WebSocket error:', error);
          this.connections.delete(ws);
        });

        // 发送就绪事件
        this.sendEvent(ws, createEvent('system', 'done', { status: 'ready' }));
      });
    });
  }

  /**
   * 处理接收到的消息
   */
  private async handleMessage(ws: WebSocket, data: RawData): Promise<void> {
    const connection = this.connections.get(ws);
    if (!connection) return;

    let frame: WsFrame;
    try {
      const str = data.toString();
      frame = JSON.parse(str);
    } catch (error) {
      console.error('[WsServer] Failed to parse message:', error);
      this.sendEvent(ws, createEvent('unknown', 'error', {
        error: 'Invalid JSON message',
      }));
      return;
    }

    if (frame.kind !== 'request') {
      this.sendEvent(ws, createEvent('unknown', 'error', {
        error: `Unknown frame kind: ${frame.kind}`,
      }));
      return;
    }

    const request = frame.data;
    connection.activeRequests.add(request.id);

    // 创建事件发送器
    const sender: EventSender = this.createSender(ws, request.id);

    try {
      await defaultHandler(request, sender);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      sender.error(errorMessage);
    } finally {
      connection.activeRequests.delete(request.id);
    }
  }

  /**
   * 创建事件发送器
   */
  private createSender(ws: WebSocket, requestId: string): EventSender {
    const send = (event: StreamEvent) => {
      this.sendEvent(ws, event);
    };

    return {
      send,
      thinking: (content: string) => {
        send({ id: requestId, event: 'thinking', data: { content } });
      },
      chunk: (content: string) => {
        send({ id: requestId, event: 'chunk', data: { content } });
      },
      toolUse: (toolName: string, toolInput: unknown) => {
        send({ id: requestId, event: 'tool_use', data: { tool_name: toolName, tool_input: toolInput } });
      },
      progress: (current: number, total: number, message: string) => {
        send({ id: requestId, event: 'progress', data: { current, total, message } });
      },
      error: (error: string) => {
        send({ id: requestId, event: 'error', data: { error } });
      },
      done: () => {
        send({ id: requestId, event: 'done', data: {} });
      },
    };
  }

  /**
   * 发送事件到 WebSocket
   */
  private sendEvent(ws: WebSocket, event: StreamEvent): void {
    if (ws.readyState === WebSocket.OPEN) {
      const frame = { kind: 'event', data: event };
      ws.send(JSON.stringify(frame));
    }
  }

  /**
   * 停止 WebSocket 服务器
   */
  async stop(): Promise<void> {
    if (!this.wss) return;

    // 关闭所有连接
    for (const [ws, connection] of this.connections) {
      // 取消所有活跃请求
      for (const requestId of connection.activeRequests) {
        console.error(`[WsServer] Cancelling request: ${requestId}`);
      }
      ws.close();
    }
    this.connections.clear();

    return new Promise((resolve) => {
      this.wss!.close(() => {
        console.error('[WsServer] Server stopped');
        this.wss = null;
        resolve();
      });
    });
  }

  /**
   * 获取活跃连接数
   */
  get connectionCount(): number {
    return this.connections.size;
  }
}

/**
 * 启动 WebSocket 服务
 */
export async function startWsServer(options?: WsServerOptions): Promise<WsServer> {
  const port = options?.port ?? 3001;

  console.error('[WsServer] Starting AIClaw WebSocket service...');
  console.error(`[WsServer] Version: 0.1.0`);

  // 初始化配置
  await initializeConfig(options?.config);

  // 验证配置
  if (options?.validateConfig !== false) {
    const validation = validateConfig();
    if (!validation.valid) {
      console.error('[WsServer] Configuration errors:');
      for (const error of validation.errors) {
        console.error(`  - ${error}`);
      }
      throw new Error('Invalid configuration');
    }
    if (validation.warnings.length > 0) {
      console.error('[WsServer] Configuration warnings:');
      for (const warning of validation.warnings) {
        console.error(`  - ${warning}`);
      }
    }
  }

  const config = getConfig();

  // 初始化 Agent Manager
  const agentManager = getAgentManager();
  await agentManager.initialize({
    serviceConfig: config,
  });

  // 创建并启动 WebSocket 服务器
  const server = new WsServer(port);
  await server.start();

  // 设置优雅关闭
  setupGracefulShutdown(server, agentManager);

  return server;
}

/**
 * 设置优雅关闭
 */
function setupGracefulShutdown(
  server: WsServer,
  agentManager: ReturnType<typeof getAgentManager>
): void {
  let isShuttingDown = false;

  const shutdown = async () => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;

    console.error('[WsServer] Shutting down...');

    // 停止 WebSocket 服务器
    await server.stop();

    // 销毁 Agent
    try {
      await agentManager.dispose();
    } catch (error) {
      console.error('[WsServer] Error during shutdown:', error);
    }

    console.error('[WsServer] Shutdown complete');
    process.exit(0);
  };

  // 监听终止信号
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // 监听未捕获的异常
  process.on('uncaughtException', (error) => {
    console.error('[WsServer] Uncaught exception:', error);
    shutdown().catch(() => process.exit(1));
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[WsServer] Unhandled rejection:', reason);
  });
}

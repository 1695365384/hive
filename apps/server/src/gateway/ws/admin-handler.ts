/**
 * Admin WebSocket Handler (Router)
 *
 * 处理 /ws/admin 端点的管理协议消息。
 * 业务逻辑委托给 Domain Handler，本类仅负责：
 * - WS 连接管理
 * - 消息路由（dispatch）
 * - HandlerContext 构建
 * - 生命周期管理
 */

import { EventEmitter } from 'node:events'
import type { WebSocket } from 'ws'
import type { WsRequest, WsResponse } from './types.js'
import { createErrorResponse, createEvent } from './types.js'
import type { Server as HttpServer } from 'node:http'
import type { ServerConfig, LogEntry } from './data-types.js'
import { LogBuffer } from './log-buffer.js'
import type { HiveLogger } from '../../logging/hive-logger.js'
import type { Server, IPlugin } from '@bundy-lmw/hive-core'
import type { HandlerContext, AdminClient, MethodHandler } from './handler-context.js'
import { ConfigStore } from './config-store.js'
import {
  ConfigHandler,
  StatusHandler,
  PluginHandler,
  LogHandler,
  SessionHandler,
} from './handlers/index.js'

// ============================================
// AdminWsHandler (Router)
// ============================================

export class AdminWsHandler extends EventEmitter {
  private clients: Set<AdminClient> = new Set()
  private logBuffer: LogBuffer
  private hiveLogger: HiveLogger | null = null
  private configStore: ConfigStore
  private server: Server | null = null
  private startTime: number
  private handlers: Map<string, MethodHandler>

  private statusHandler!: StatusHandler
  private pluginHandler!: PluginHandler

  constructor(hiveLogger: HiveLogger | null, logBuffer: LogBuffer) {
    super()
    this.logBuffer = logBuffer
    this.hiveLogger = hiveLogger
    this.configStore = new ConfigStore()
    this.startTime = Date.now()

    const ctx = this.createContext()
    this.statusHandler = new StatusHandler(ctx, this.startTime)
    this.pluginHandler = new PluginHandler(ctx)

    const domains = [
      new ConfigHandler(ctx),
      this.statusHandler,
      this.pluginHandler,
      new LogHandler(ctx),
      new SessionHandler(ctx),
    ]

    this.handlers = new Map<string, MethodHandler>()
    for (const domain of domains) {
      for (const [method, handler] of domain.register()) {
        this.handlers.set(method, handler)
      }
    }
  }

  // ============================================
  // 生命周期
  // ============================================

  setServer(server: Server): void {
    this.server = server
  }

  setHttpServer(httpServer: HttpServer): void {
    this.statusHandler.setHttpServer(httpServer)
  }

  setPlugins(plugins: IPlugin[]): void {
    this.pluginHandler.setPlugins(plugins)
  }

  getHiveLogger(): HiveLogger | null {
    return this.hiveLogger
  }

  /** Push a log entry to subscribed admin clients — called by main.ts subscriber */
  pushLog(entry: LogEntry): void {
    this.broadcastLog(entry)
  }

  // ============================================
  // 连接管理
  // ============================================

  handleConnection(ws: WebSocket): void {
    const client: AdminClient = { ws, logSubscribed: false, threadIds: new Set() }
    this.clients.add(client)

    ws.on('message', (raw) => {
      const data = raw.toString()
      const msg = this.parseMessage(data)
      if (!msg) return

      if (msg.type === 'req') {
        this.handleRequest(msg, client).then(response => {
          ws.send(JSON.stringify(response))
        })
      }
    })

    ws.on('close', () => {
      this.clients.delete(client)
    })

    ws.on('error', () => {
      this.clients.delete(client)
    })
  }

  async closeAll(): Promise<void> {
    this.broadcastEvent('server.shutting_down', { reason: 'shutdown' })
    for (const client of this.clients) {
      client.ws.close()
    }
    this.clients.clear()
  }

  // ============================================
  // 消息路由
  // ============================================

  private parseMessage(data: string): WsRequest | null {
    try {
      const msg = JSON.parse(data)
      if (!msg || typeof msg !== 'object') return null
      if (msg.type !== 'req' || !msg.id || !msg.method) return null
      return msg as WsRequest
    } catch {
      return null
    }
  }

  private async handleRequest(req: WsRequest, client: AdminClient): Promise<WsResponse> {
    const handler = this.handlers.get(req.method)
    if (!handler) {
      return createErrorResponse(req.id, 'NOT_FOUND', `Unknown method: ${req.method}`)
    }

    try {
      return await handler(req.params, req.id, client.ws)
    } catch (error) {
      return createErrorResponse(
        req.id,
        'INTERNAL',
        error instanceof Error ? error.message : 'Unknown error',
      )
    }
  }

  // ============================================
  // HandlerContext
  // ============================================

  private createContext(): HandlerContext {
    return {
      broadcastEvent: (event, data) => this.broadcastEvent(event, data),
      broadcastLog: (entry) => this.broadcastLog(entry),
      loadConfig: () => this.configStore.load(),
      saveConfig: (config) => this.configStore.save(config),
      sensitizeConfig: (config) => this.configStore.sensitize(config),
      getServer: () => this.server,
      getLogBuffer: () => this.logBuffer,
      getHiveLogger: () => this.hiveLogger,
      getClients: () => this.clients,
      findClientByWs: (ws) => this.findClientByWs(ws),
    }
  }

  // ============================================
  // 事件广播
  // ============================================

  private broadcastEvent(event: string, data: unknown): void {
    const msg = createEvent(event, data)
    const payload = JSON.stringify(msg)
    for (const client of this.clients) {
      if (client.ws.readyState === client.ws.OPEN) {
        client.ws.send(payload)
      }
    }
  }

  private broadcastLog(entry: LogEntry): void {
    const msg = createEvent('log', entry)
    const payload = JSON.stringify(msg)
    for (const client of this.clients) {
      if (client.logSubscribed && client.ws.readyState === client.ws.OPEN) {
        client.ws.send(payload)
      }
    }
  }

  // ============================================
  // 辅助
  // ============================================

  private findClientByWs(ws: WebSocket): AdminClient | undefined {
    for (const client of this.clients) {
      if (client.ws === ws) return client
    }
    return undefined
  }
}

// ============================================
// 工厂函数
// ============================================

export function createAdminWsHandler(hiveLogger: HiveLogger | null, logBuffer: LogBuffer): AdminWsHandler {
  return new AdminWsHandler(hiveLogger, logBuffer)
}

/**
 * ChatWsHandler — /ws/chat 端点
 *
 * 职责：WebSocket ↔ MessageBus 桥接
 * - chat.send → bus.publish('message:received') → ServerImpl 统一分发
 * - bus.subscribe('agent:streaming') → WS event 转发
 * - chat.cancel → bus.publish('agent:abort')
 *
 * 所有 Agent 调度逻辑集中在 ServerImpl，本类只做协议转换。
 */

import { EventEmitter } from 'node:events'
import type { WebSocket } from 'ws'
import type { Server } from '@bundy-lmw/hive-core'
import type {
  WsRequest, WsResponse,
} from './types.js'
import { createSuccessResponse, createErrorResponse, createEvent } from './types.js'
import type { HiveLogger } from '../../logging/hive-logger.js'

// ============================================
// 类型
// ============================================

interface ChatClient {
  ws: WebSocket
  threadIds: Set<string>
}

// ============================================
// ChatWsHandler
// ============================================

export class ChatWsHandler extends EventEmitter {
  private clients: Set<ChatClient> = new Set()
  private threadClientMap: Map<string, WebSocket> = new Map()
  private server: Server | null = null
  private hiveLogger: HiveLogger | null = null
  private hookIds: string[] = []
  private busSubIds: string[] = []
  /** Track toolCallId per threadId for tool-call/tool-result matching */
  private toolCallIdMaps: Map<string, Map<string, string>> = new Map()

  constructor(hiveLogger: HiveLogger | null) {
    super()
    this.hiveLogger = hiveLogger
  }

  // ============================================
  // 生命周期
  // ============================================

  setServer(server: Server): void {
    this.server = server
    this.subscribeAgentHooks()
    this.subscribeStreamingEvents()
  }

  // ============================================
  // Agent Hook 订阅（日志推送到 admin WS）
  // ============================================

  private subscribeAgentHooks(): void {
    const registry = this.server?.agent?.context?.hookRegistry
    if (!registry) {
      console.warn('[chat-handler] subscribeAgentHooks: no hookRegistry available')
      return
    }

    const logger = this.hiveLogger?.logger
    if (!logger) {
      console.warn('[chat-handler] subscribeAgentHooks: no logger available')
      return
    }
    console.log('[chat-handler] subscribeAgentHooks: subscribing to agent hooks')
    const observe = (fn: (ctx: any) => void) => fn as any

    this.hookIds.push(registry.on('agent:thinking', observe((ctx: any) => {
      logger?.info({ source: 'agent' }, `[${ctx.type}] ${ctx.thought}`)
    })))

    this.hookIds.push(registry.on('task:progress', observe((ctx: any) => {
      logger?.debug({ source: 'agent' }, `${ctx.description} (${ctx.progress}%)`)
    })))

    this.hookIds.push(registry.on('tool:before', observe((ctx: any) => {
      const input = typeof ctx.input === 'object'
        ? Object.keys(ctx.input as object).join(', ')
        : String(ctx.input ?? '')
      logger?.info({ source: 'agent' }, `[tool] calling ${ctx.toolName}(${input})`)
    })))

    this.hookIds.push(registry.on('tool:after', observe((ctx: any) => {
      const status = ctx.success ? 'ok' : 'failed'
      logger?.info({ source: 'agent' }, `[tool] ${ctx.toolName} ${status}`)
    })))

    this.hookIds.push(registry.on('timeout:api', observe((ctx: any) => {
      logger?.error({ source: 'agent' }, `API timeout after ${ctx.timeout}ms (attempt ${ctx.attempt}/${ctx.maxAttempts})`)
    })))
  }

  private unsubscribeAgentHooks(): void {
    const registry = this.server?.agent?.context?.hookRegistry
    if (!registry) return
    for (const id of this.hookIds) {
      registry.off(id)
    }
    this.hookIds = []
  }

  // ============================================
  // Bus 流式事件订阅
  // ============================================

  private subscribeStreamingEvents(): void {
    if (!this.server) return
    const bus = this.server.bus

    this.busSubIds.push(bus.subscribe('agent:streaming', (message: { payload: any }) => {
      const { sessionId, type, ...data } = message.payload
      this.forwardStreamingEvent(sessionId, type, data)
    }))
  }

  private unsubscribeStreamingEvents(): void {
    if (!this.server) return
    for (const id of this.busSubIds) {
      this.server.bus.unsubscribe(id)
    }
    this.busSubIds = []
  }

  /** 将 bus 流式事件映射为 WS 事件并定向发送 */
  private forwardStreamingEvent(sessionId: string, type: string, data: any): void {
    // sessionId 格式: "channelId:recipientId" → 提取 recipientId 作为 threadId
    const threadId = sessionId.includes(':') ? sessionId.slice(sessionId.indexOf(':') + 1) : sessionId
    const ws = this.threadClientMap.get(threadId)
    if (!ws || ws.readyState !== ws.OPEN) return

    switch (type) {
      case 'start':
        ws.send(JSON.stringify(createEvent('agent.start', { threadId, agentType: 'general' })))
        break

      case 'reasoning':
        ws.send(JSON.stringify(createEvent('agent.reasoning', { threadId, text: data.text })))
        break

      case 'text-delta':
        ws.send(JSON.stringify(createEvent('agent.text-delta', { threadId, text: data.text })))
        break

      case 'tool-call': {
        const toolCallId = crypto.randomUUID()
        let callMap = this.toolCallIdMaps.get(threadId)
        if (!callMap) {
          callMap = new Map()
          this.toolCallIdMaps.set(threadId, callMap)
        }
        callMap.set(data.tool, toolCallId)
        ws.send(JSON.stringify(createEvent('agent.tool-call', {
          threadId, toolCallId, toolName: data.tool, args: data.input,
        })))
        break
      }

      case 'tool-result': {
        const resultMap = this.toolCallIdMaps.get(threadId)
        const toolCallId = resultMap?.get(data.tool) ?? crypto.randomUUID()
        ws.send(JSON.stringify(createEvent('agent.tool-result', {
          threadId, toolCallId, toolName: data.tool, result: data.output,
        })))
        break
      }

      case 'complete':
        ws.send(JSON.stringify(createEvent('agent.complete', {
          threadId,
          success: data.success,
          cancelled: data.cancelled,
          error: data.error,
        })))
        // Only clean up toolCallIdMaps; threadClientMap is cleaned on WS disconnect
        // to allow the same threadId to be reused for follow-up messages
        this.toolCallIdMaps.delete(threadId)
        break
    }
  }

  // ============================================
  // 连接管理
  // ============================================

  handleConnection(ws: WebSocket): void {
    const client: ChatClient = { ws, threadIds: new Set() }
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
      for (const tid of client.threadIds) {
        this.threadClientMap.delete(tid)
        this.toolCallIdMaps.delete(tid)
      }
      this.clients.delete(client)
    })

    ws.on('error', () => {
      for (const tid of client.threadIds) {
        this.threadClientMap.delete(tid)
        this.toolCallIdMaps.delete(tid)
      }
      this.clients.delete(client)
    })
  }

  async closeAll(): Promise<void> {
    this.unsubscribeAgentHooks()
    this.unsubscribeStreamingEvents()
    for (const client of this.clients) {
      client.ws.close()
    }
    this.clients.clear()
    this.threadClientMap.clear()
    this.toolCallIdMaps.clear()
  }

  // ============================================
  // 消息处理
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

  private async handleRequest(req: WsRequest, client: ChatClient): Promise<WsResponse> {
    switch (req.method) {
      case 'chat.send':
        return this.handleChatSend(req.params, req.id, client.ws)
      case 'chat.cancel':
        return this.handleChatCancel(req.params, req.id)
      default:
        return createErrorResponse(req.id, 'NOT_FOUND', `Unknown method: ${req.method}`)
    }
  }

  // ============================================
  // Chat Handler
  // ============================================

  private async handleChatSend(params: unknown, id: string, ws?: WebSocket): Promise<WsResponse> {
    const { prompt, threadId } = params as { prompt?: string; threadId?: string }

    if (!prompt || typeof prompt !== 'string') {
      return createErrorResponse(id, 'VALIDATION', 'prompt is required and must be a string')
    }

    if (!this.server) {
      return createErrorResponse(id, 'AGENT_NOT_READY', 'Server not initialized')
    }

    const tid = threadId || crypto.randomUUID()

    // 记录 threadId → client 映射（用于后续流式事件路由）
    if (ws) {
      this.threadClientMap.set(tid, ws)
      const client = this.findClientByWs(ws)
      if (client) client.threadIds.add(tid)
    }

    // 发布到 bus — ServerImpl.subscribeMessageHandler 统一处理
    this.server.bus.publish('message:received', {
      id: crypto.randomUUID(),
      content: prompt,
      type: 'text',
      from: { id: 'desktop-user', type: 'user' },
      to: { id: tid, type: 'user' },
      timestamp: Date.now(),
      metadata: {
        channelId: 'ws-chat',
      },
    })

    return createSuccessResponse(id, { threadId: tid })
  }

  private async handleChatCancel(params: unknown, id: string): Promise<WsResponse> {
    const { threadId } = params as { threadId?: string }

    if (!threadId) {
      return createErrorResponse(id, 'VALIDATION', 'threadId is required')
    }

    // 通过 bus 通知 ServerImpl 中止执行（sessionKey 格式: channelId:threadId）
    this.server?.bus.publish('agent:abort', { sessionId: `ws-chat:${threadId}` })

    return createSuccessResponse(id, { threadId, cancelled: true })
  }

  // ============================================
  // 日志推送
  // ============================================

  /** Push a log entry to connected chat clients — called by main.ts subscriber */
  pushLog(entry: import('./data-types.js').LogEntry): void {
    this.broadcastLog(entry)
  }

  /** 推送日志到所有客户端 */
  private broadcastLog(entry: import('./data-types.js').LogEntry): void {
    const msg = createEvent('log', entry)
    const payload = JSON.stringify(msg)
    for (const client of this.clients) {
      if (client.ws.readyState === client.ws.OPEN) {
        client.ws.send(payload)
      }
    }
  }

  // ============================================
  // 辅助方法
  // ============================================

  private findClientByWs(ws: WebSocket): ChatClient | undefined {
    for (const client of this.clients) {
      if (client.ws === ws) return client
    }
    return undefined
  }

  private findClientByThreadId(threadId: string): ChatClient | undefined {
    const ws = this.threadClientMap.get(threadId)
    if (!ws) return undefined
    return this.findClientByWs(ws)
  }
}

// ============================================
// 工厂函数
// ============================================

export function createChatWsHandler(hiveLogger: HiveLogger | null): ChatWsHandler {
  return new ChatWsHandler(hiveLogger)
}

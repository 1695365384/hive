/**
 * ChatWsHandler — 独立 /ws/chat 端点
 *
 * 管理 Agent 对话的完整生命周期：
 * - chat.send 请求处理（fire-and-forget）
 * - threadId → WebSocket 定向推送
 * - Agent Hook 订阅（日志分发）
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
  }

  // ============================================
  // Agent Hook 订阅
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
      }
      this.clients.delete(client)
    })

    ws.on('error', () => {
      for (const tid of client.threadIds) {
        this.threadClientMap.delete(tid)
      }
      this.clients.delete(client)
    })
  }

  async closeAll(): Promise<void> {
    this.unsubscribeAgentHooks()
    for (const client of this.clients) {
      client.ws.close()
    }
    this.clients.clear()
    this.threadClientMap.clear()
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
    if (req.method !== 'chat.send') {
      return createErrorResponse(req.id, 'NOT_FOUND', `Unknown method: ${req.method}`)
    }

    return this.handleChatSend(req.params, req.id, client.ws)
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

    const agent = this.server.agent
    if (!agent) {
      return createErrorResponse(id, 'AGENT_NOT_READY', 'Agent not initialized')
    }

    const tid = threadId || crypto.randomUUID()

    // 记录 threadId → client 映射
    if (ws) {
      this.threadClientMap.set(tid, ws)
      const client = this.findClientByWs(ws)
      if (client) client.threadIds.add(tid)
    }

    // 异步执行 Agent chat（fire-and-forget）
    this.runAgentChat(prompt, tid).catch((err) => {
      console.error(`[chat.send] Agent execution failed: ${err.message}`)
      this.sendEventToThread(tid, 'agent.complete', { threadId: tid, success: false, error: err.message })
    })

    return createSuccessResponse(id, { threadId: tid })
  }

  /** 异步执行 Agent chat 并流式推送事件 */
  private async runAgentChat(prompt: string, threadId: string): Promise<void> {
    const toolCallIdMap = new Map<string, string>()

    const emit = (event: string, data: unknown) => {
      this.sendEventToThread(threadId, event, data)
    }

    emit('agent.start', { threadId, agentType: 'general' })

    await this.server!.agent.chat(prompt, {
      onReasoning: (text: string) => {
        emit('agent.reasoning', { threadId, text })
      },
      onText: (text: string) => {
        emit('agent.text-delta', { threadId, text })
      },
      onToolCall: (toolName: string, input: unknown) => {
        const toolCallId = crypto.randomUUID()
        toolCallIdMap.set(toolName, toolCallId)
        emit('agent.tool-call', { threadId, toolCallId, toolName, args: input })
      },
      onToolResult: (toolName: string, output: unknown) => {
        const toolCallId = toolCallIdMap.get(toolName) ?? crypto.randomUUID()
        emit('agent.tool-result', { threadId, toolCallId, toolName, result: output })
      },
    })

    emit('agent.complete', { threadId, success: true })

    // Clean up thread mapping
    this.threadClientMap.delete(threadId)
    const client = this.findClientByThreadId(threadId)
    if (client) client.threadIds.delete(threadId)
  }

  // ============================================
  // 事件推送
  // ============================================

  /** 定向发送事件到指定 threadId 对应的客户端 */
  private sendEventToThread(threadId: string, event: string, data: unknown): void {
    const targetWs = this.threadClientMap.get(threadId)
    if (targetWs && targetWs.readyState === targetWs.OPEN) {
      targetWs.send(JSON.stringify(createEvent(event, data)))
    } else {
      // Fallback: broadcast
      this.broadcastEvent(event, data)
    }
  }

  /** Push a log entry to connected chat clients — called by main.ts subscriber */
  pushLog(entry: import('./data-types.js').LogEntry): void {
    this.broadcastLog(entry)
  }

  /** 广播事件到所有连接的客户端 */
  private broadcastEvent(event: string, data: unknown): void {
    const msg = createEvent(event, data)
    const payload = JSON.stringify(msg)
    for (const client of this.clients) {
      if (client.ws.readyState === client.ws.OPEN) {
        client.ws.send(payload)
      }
    }
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

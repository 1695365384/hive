/**
 * ChatWsHandler — /ws/chat 端点
 *
 * 职责：WebSocket ↔ Server 桥接
 * - chat.send → server.handleMessage() → ServerImpl 统一分发
 * - server.onStreamingEvent() → WS event 转发
 * - chat.cancel → server.abort()
 *
 * 所有 Agent 调度逻辑集中在 ServerImpl，本类只做协议转换。
 */

import { EventEmitter } from 'node:events'
import type { WebSocket } from 'ws'
import type { Server } from '@bundy-lmw/hive-core'
import { SessionId, setAskUserCallback } from '@bundy-lmw/hive-core'
import type { StreamingEventUnion } from '@bundy-lmw/hive-core'
import type {
  WsRequest, WsResponse,
} from './types.js'
import { createSuccessResponse, createErrorResponse, createEvent } from './types.js'
import type { HiveLogger } from '../../logging/hive-logger.js'
import crypto from 'node:crypto'
import { stageArtifactFile } from '../artifact-staging.js'

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
  /** Track toolCallId per threadId for tool-call/tool-result matching */
  private toolCallIdMaps: Map<string, Map<string, string>> = new Map()
  /** Per-threadId sequence counters for deduplication */
  private seqCounters: Map<string, number> = new Map()
  private _streamingUnregister: (() => void) | null = null
  private _fileUnregister: (() => void) | null = null

  /** Pending ask-user requests: threadId → { resolve, timer } */
  private pendingAskUser = new Map<string, { resolve: (answer: string) => void; timer: NodeJS.Timeout }>()

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
    this.registerStreamingHandler()
    this.registerAskUserCallback()
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

    this.hookIds.push(registry.on('worker:start', observe((ctx: any) => {
      logger?.info({ source: 'agent' }, `[worker:${ctx.workerId?.slice(0, 8)}] start type=${ctx.workerType} desc=${ctx.description ?? '-'}`)
    })))

    this.hookIds.push(registry.on('worker:complete', observe((ctx: any) => {
      const status = ctx.success ? 'SUCCESS' : `FAILED${ctx.error ? ': ' + ctx.error : ''}`
      logger?.info({ source: 'agent' }, `[worker:${ctx.workerId?.slice(0, 8)}] complete ${status} (${ctx.duration}ms)`)
    })))

    this.hookIds.push(registry.on('worker:tool-call', observe((ctx: any) => {
      logger?.debug({ source: 'agent' }, `[worker:${ctx.workerId?.slice(0, 8)}] tool-call ${ctx.toolName}`)
    })))

    this.hookIds.push(registry.on('worker:tool-result', observe((ctx: any) => {
      logger?.debug({ source: 'agent' }, `[worker:${ctx.workerId?.slice(0, 8)}] tool-result ${ctx.toolName}`)
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
  // 流式事件订阅（替代 bus.subscribe）
  // ============================================

  private registerStreamingHandler(): void {
    if (!this.server) return

    this._streamingUnregister = this.server.onStreamingEvent((event) => {
      this.forwardStreamingEvent(event)
    })

    this._fileUnregister = this.server.onFileEvent(async (event) => {
      const { sessionId, filePath } = event
      const tid = SessionId.recipient(sessionId)
      const ws = this.threadClientMap.get(tid)
      if (!ws || ws.readyState !== ws.OPEN) return

      try {
        const staged = await stageArtifactFile(sessionId, filePath)
        if (!staged) return

        const fs = await import('node:fs/promises')
        const stat = await fs.stat(staged.servedPath).catch(() => null)
        if (!stat) return

        const isImage = /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(staged.name)

        ws.send(JSON.stringify(createEvent('agent.file', {
          threadId: tid,
          name: staged.name,
          path: staged.originalPath,
          servedPath: staged.servedPath,
          size: stat.size,
          mimeType: isImage ? `image/${staged.name.split('.').pop()}` : 'application/octet-stream',
          type: isImage ? 'image' : 'file',
          src: staged.src,
        })))
      } catch (err) {
        console.warn('[chat-handler] agent:file error:', err)
      }
    })
  }

  private unregisterStreamingHandler(): void {
    if (this._streamingUnregister) { this._streamingUnregister(); this._streamingUnregister = null; }
    if (this._fileUnregister) { this._fileUnregister(); this._fileUnregister = null; }
  }

  /** 递增并返回 threadId 对应的序号 */
  private nextSeq(threadId: string): number {
    const seq = (this.seqCounters.get(threadId) ?? 0) + 1
    this.seqCounters.set(threadId, seq)
    return seq
  }

  /** 将流式事件映射为 WS 事件并定向发送 */
  private forwardStreamingEvent(event: StreamingEventUnion): void {
    const sessionId = event.sessionId;
    const threadId = SessionId.recipient(sessionId);
    const ws = this.threadClientMap.get(threadId)
    if (!ws || ws.readyState !== ws.OPEN) {
      console.warn(`[chat-handler] Dropping event "${event.type}" for thread "${threadId}": ` +
        `${!ws ? 'no socket mapped' : 'socket not open (readyState=' + ws.readyState + ')'}`)
      return
    }


    switch (event.type) {
      case 'start':
        // 重置序号计数器
        this.seqCounters.set(threadId, 0)
        ws.send(JSON.stringify(createEvent('agent.start', { threadId, agentType: 'general' })))
        break

      case 'route':
        ws.send(JSON.stringify(createEvent('agent.route', {
          threadId,
          mode: event.mode,
          scenarioId: event.scenarioId,
          workerType: event.workerType,
          title: event.title,
        })))
        break

      case 'reasoning':
        ws.send(JSON.stringify(createEvent('agent.reasoning', { threadId, text: event.text, seq: this.nextSeq(threadId), workerId: event.workerId, workerType: event.workerType })))
        break

      case 'text-delta':
        ws.send(JSON.stringify(createEvent('agent.text-delta', { threadId, text: event.text, seq: this.nextSeq(threadId) })))
        break

      case 'tool-call': {
        const toolCallId = crypto.randomUUID()
        let callMap = this.toolCallIdMaps.get(threadId)
        if (!callMap) {
          callMap = new Map()
          this.toolCallIdMaps.set(threadId, callMap)
        }
        callMap.set(event.tool, toolCallId)
        ws.send(JSON.stringify(createEvent('agent.tool-call', {
          threadId, toolCallId, toolName: event.tool, args: event.input, workerId: event.workerId, workerType: event.workerType,
        })))
        break
      }

      case 'tool-result': {
        const resultMap = this.toolCallIdMaps.get(threadId)
        const toolCallId = resultMap?.get(event.tool) ?? crypto.randomUUID()
        ws.send(JSON.stringify(createEvent('agent.tool-result', {
          threadId, toolCallId, toolName: event.tool, result: event.output, workerId: event.workerId, workerType: event.workerType,
        })))
        break
      }

      case 'worker-start':
        ws.send(JSON.stringify(createEvent('agent.worker-start', {
          threadId, workerId: event.workerId, workerType: event.workerType,
          description: event.description, scenarioId: event.scenarioId,
        })))
        break

      case 'worker-complete':
        ws.send(JSON.stringify(createEvent('agent.worker-complete', {
          threadId, workerId: event.workerId, workerType: event.workerType, success: event.success, error: event.error, duration: event.duration,
        })))
        break

      case 'complete':
        ws.send(JSON.stringify(createEvent('agent.complete', {
          threadId,
          success: event.success,
          cancelled: event.cancelled,
          error: event.error,
          text: event.text,
        })))
        // Only clean up toolCallIdMaps; threadClientMap is cleaned on WS disconnect
        this.toolCallIdMaps.delete(threadId)
        this.seqCounters.delete(threadId)
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
        if (this.threadClientMap.get(tid) === ws) {
          this.threadClientMap.delete(tid)
        }
        this.toolCallIdMaps.delete(tid)
      }
      this.clients.delete(client)
    })

    ws.on('error', () => {
      for (const tid of client.threadIds) {
        if (this.threadClientMap.get(tid) === ws) {
          this.threadClientMap.delete(tid)
        }
        this.toolCallIdMaps.delete(tid)
      }
      this.clients.delete(client)
    })
  }

  async closeAll(): Promise<void> {
    this.unsubscribeAgentHooks()
    this.unregisterStreamingHandler()
    for (const client of this.clients) {
      client.ws.close()
    }
    this.clients.clear()
    this.threadClientMap.clear()
    this.toolCallIdMaps.clear()
    this.seqCounters.clear()
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
      case 'chat.answerAskUser':
        return this.handleAnswerAskUser(req.params, req.id)
      default:
        return createErrorResponse(req.id, 'NOT_FOUND', `Unknown method: ${req.method}`)
    }
  }

  // ============================================
  // Chat Handler
  // ============================================

  private async handleChatSend(params: unknown, id: string, ws?: WebSocket): Promise<WsResponse> {
    const { prompt, threadId, attachments } = params as {
      prompt?: string;
      threadId?: string;
      attachments?: Array<{ type: string; path: string; name: string; size: number; mimeType: string }>;
    };

    // Build content: prompt + file references
    let content = prompt || '';
    if (attachments && attachments.length > 0) {
      const fileRefs = attachments
        .map(a => {
          const sizeStr = a.size >= 1024 * 1024
            ? `${(a.size / 1024 / 1024).toFixed(1)}MB`
            : `${(a.size / 1024).toFixed(1)}KB`;
          return `[File: ${a.name} (${sizeStr})] ${a.path}`;
        })
        .join('\n');
      content = content ? `${fileRefs}\n\n${content}` : fileRefs;
    }

    if (!content) {
      return createErrorResponse(id, 'VALIDATION', 'prompt or attachments is required')
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

    // 直接调用 server.handleMessage() 替代 bus.publish
    this.server.handleMessage({
      id: crypto.randomUUID(),
      content,
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

    // 直接调用 server.abort() 替代 bus.publish
    this.server?.abort(SessionId.forAbort(threadId))

    return createSuccessResponse(id, { threadId, cancelled: true })
  }

  // ============================================
  // Ask-User 交互
  // ============================================

  /**
   * 注册 ask-user 回调，实现 Agent ↔ 用户交互
   *
   * 流程：
   * 1. Agent 调用 ask-user 工具
   * 2. 此回调被触发，生成 askId 并存下 Promise resolver
   * 3. 通过 WS 推送 agent.ask-user 事件给桌面端
   * 4. 桌面端显示交互卡片，用户点选或输入
   * 5. 桌面端通过 WS 发回 chat.answerAskUser
   * 6. resolver 被调用，Agent 拿到结果继续
   */
  private registerAskUserCallback(): void {
    setAskUserCallback((question, options) => {
      return new Promise<string>((resolve) => {
        const askId = crypto.randomUUID()

        // Prefer the thread currently executing; fall back to first open mapping
        const preferredThread = this.server?.getActiveDispatchSessionId?.() ?? null
        const threadIds = Array.from(this.threadClientMap.entries())
        const ordered = preferredThread
          ? [
              ...threadIds.filter(([id]) => id === preferredThread),
              ...threadIds.filter(([id]) => id !== preferredThread),
            ]
          : threadIds

        let sent = false

        for (const [threadId, ws] of ordered) {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify(createEvent('agent.ask-user', {
              askId,
              threadId,
              question,
              options: options ?? [],
            })))
            sent = true

            // 超时保底：2 分钟后自动回答，并通知客户端关掉确认卡
            const timer = setTimeout(() => {
              this.pendingAskUser.delete(askId)
              resolve('(未选择)')
              try {
                if (ws.readyState === ws.OPEN) {
                  ws.send(JSON.stringify(createEvent('agent.ask-user-timeout', {
                    askId,
                    threadId,
                  })))
                }
              } catch {
                /* ignore */
              }
            }, 120_000)

            this.pendingAskUser.set(askId, { resolve, timer })

            // 只发给正确/首选线程
            break
          }
        }

        // 没有活跃连接 → 直接返回默认答案
        if (!sent) {
          resolve('(无活跃连接)')
        }
      })
    })
  }

  private handleAnswerAskUser(params: unknown, id: string): WsResponse {
    const { askId, answer } = params as { askId?: string; answer?: string }

    if (!askId) {
      return createErrorResponse(id, 'VALIDATION', 'askId is required')
    }

    const pending = this.pendingAskUser.get(askId)
    if (!pending) {
      return createErrorResponse(id, 'NOT_FOUND', 'Ask request not found or already answered')
    }

    clearTimeout(pending.timer)
    this.pendingAskUser.delete(askId)
    pending.resolve(answer ?? '(未选择)')

    return createSuccessResponse(id, { success: true })
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

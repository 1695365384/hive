/**
 * Hive Admin WebSocket 客户端
 *
 * 封装与 /ws/admin 端点的通信：
 * - req/res: Promise-based 请求方法
 * - event: 服务端主动推送
 * - 自动重连: 指数退避
 */

export type ConnectionState = 'connected' | 'reconnecting' | 'failed'

interface PendingRequest {
  resolve: (response: any) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

type EventCallback = (data: any) => void

const DEFAULT_WS_URL = 'ws://localhost:4450/ws/admin'
const REQUEST_TIMEOUT = 30_000
const MAX_RECONNECT_DELAY = 30_000
const INITIAL_RECONNECT_DELAY = 500

export class WsClient {
  private ws: WebSocket | null = null
  private pendingRequests = new Map<string, PendingRequest>()
  private eventListeners = new Map<string, Set<EventCallback>>()
  private state: ConnectionState = 'reconnecting'
  private stateListeners = new Set<(state: ConnectionState) => void>()
  private reconnectDelay = INITIAL_RECONNECT_DELAY
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private url: string
  private subscriptions: string[] = [] // 记录已订阅的事件
  private destroyed = false

  constructor(url = DEFAULT_WS_URL) {
    this.url = url
  }

  // ============================================
  // 生命周期
  // ============================================

  connect(): void {
    if (this.destroyed) return
    this.setState('reconnecting')

    try {
      this.ws = new WebSocket(this.url)

      this.ws.onopen = () => {
        this.setState('connected')
        this.reconnectDelay = INITIAL_RECONNECT_DELAY
        // 恢复订阅
        this.restoreSubscriptions()
      }

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data)
      }

      this.ws.onclose = () => {
        this.ws = null
        // 拒绝所有未完成的请求
        for (const [id, pending] of this.pendingRequests) {
          clearTimeout(pending.timer)
          pending.reject(new Error('Connection closed'))
          this.pendingRequests.delete(id)
        }
        this.scheduleReconnect()
      }

      this.ws.onerror = () => {
        // onclose will handle reconnection
      }
    } catch {
      this.scheduleReconnect()
    }
  }

  disconnect(): void {
    this.destroyed = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  // ============================================
  // 请求方法 (req/res)
  // ============================================

  request<T = any>(method: string, params?: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Not connected'))
        return
      }

      const id = crypto.randomUUID()
      const message = {
        id,
        type: 'req',
        method,
        params: params ?? undefined,
        timestamp: Date.now(),
      }

      const timer = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error('Request timed out'))
      }, REQUEST_TIMEOUT)

      this.pendingRequests.set(id, { resolve, reject, timer })
      this.ws.send(JSON.stringify(message))
    })
  }

  // ============================================
  // 事件监听
  // ============================================

  on(event: string, callback: EventCallback): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set())
    }
    this.eventListeners.get(event)!.add(callback)

    // 记录订阅以便重连后恢复
    if (!this.subscriptions.includes(event)) {
      this.subscriptions.push(event)
    }

    // 返回取消函数
    return () => {
      this.eventListeners.get(event)?.delete(callback)
    }
  }

  off(event: string, callback: EventCallback): void {
    this.eventListeners.get(event)?.delete(callback)
  }

  // ============================================
  // 连接状态
  // ============================================

  getState(): ConnectionState {
    return this.state
  }

  onStateChange(callback: (state: ConnectionState) => void): () => void {
    this.stateListeners.add(callback)
    return () => this.stateListeners.delete(callback)
  }

  // ============================================
  // 内部方法
  // ============================================

  private handleMessage(raw: string): void {
    try {
      const msg = JSON.parse(raw)

      if (msg.type === 'res') {
        const pending = this.pendingRequests.get(msg.id)
        if (pending) {
          clearTimeout(pending.timer)
          this.pendingRequests.delete(msg.id)

          if (msg.success) {
            pending.resolve(msg.result)
          } else {
            pending.reject(new Error(msg.error?.message ?? 'Unknown error'))
          }
        }
      } else if (msg.type === 'event') {
        this.emitEvent(msg.event, msg.data)
      }
    } catch {
      // Ignore malformed messages
    }
  }

  private emitEvent(event: string, data: unknown): void {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      for (const callback of listeners) {
        try {
          callback(data)
        } catch {
          // Ignore callback errors
        }
      }
    }
  }

  private setState(state: ConnectionState): void {
    if (this.state === state) return
    this.state = state
    for (const listener of this.stateListeners) {
      try {
        listener(state)
      } catch {
        // Ignore listener errors
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return
    if (this.reconnectTimer) return

    this.setState('reconnecting')

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, this.reconnectDelay)

    // 指数退避
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY)
  }

  private restoreSubscriptions(): void {
    // 恢复日志订阅
    if (this.subscriptions.includes('log')) {
      this.request('log.subscribe').catch(() => {})
    }
  }
}

// ============================================
// 单例
// ============================================

let client: WsClient | null = null

export function getWsClient(): WsClient {
  if (!client) {
    client = new WsClient()
    client.connect()
  }
  return client
}

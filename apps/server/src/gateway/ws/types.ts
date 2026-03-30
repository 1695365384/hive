/**
 * WebSocket 管理协议类型定义
 *
 * 前后端通过 WS 双向通信，三种消息类型：
 * - req:  前端 → 后端，请求操作
 * - res:  后端 → 前端，请求结果
 * - event: 后端 → 前端，主动推送
 */

// ============================================
// 基础消息
// ============================================

export interface WsMessage {
  /** 消息唯一 ID (UUID)，用于 req/res 匹配 */
  id: string
  /** 消息类型 */
  type: 'req' | 'res' | 'event'
  /** 毫秒时间戳 */
  timestamp: number
}

// ============================================
// 请求 (req)
// ============================================

export interface WsRequest extends WsMessage {
  type: 'req'
  /** 操作方法名 */
  method: string
  /** 请求参数 */
  params?: unknown
}

// ============================================
// 响应 (res)
// ============================================

export interface WsSuccessResponse extends WsMessage {
  type: 'res'
  /** 匹配请求的 id */
  id: string
  success: true
  /** 返回数据 */
  result: unknown
}

export interface WsErrorResponse extends WsMessage {
  type: 'res'
  /** 匹配请求的 id */
  id: string
  success: false
  error: WsError
}

export interface WsError {
  /** 错误码 */
  code: ErrorCode
  /** 人类可读的错误信息 */
  message: string
}

export type WsResponse = WsSuccessResponse | WsErrorResponse

export type ErrorCode =
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'INTERNAL'
  | 'TIMEOUT'
  | 'UNAUTHORIZED'

// ============================================
// 事件 (event)
// ============================================

export interface WsEvent extends WsMessage {
  type: 'event'
  /** 事件名 */
  event: string
  /** 事件数据 */
  data: unknown
}

/** 服务端可推送的事件名 */
export type ServerEventName =
  | 'server.shutting_down'
  | 'log'
  | 'plugin.installed'
  | 'plugin.uninstalled'
  | 'config.changed'

// ============================================
// 联合类型
// ============================================

export type AnyWsMessage = WsRequest | WsResponse | WsEvent

// ============================================
// 工具函数
// ============================================

/** 创建请求消息 */
export function createRequest(method: string, params?: unknown): WsRequest {
  return {
    id: crypto.randomUUID(),
    type: 'req',
    method,
    params,
    timestamp: Date.now(),
  }
}

/** 创建成功响应 */
export function createSuccessResponse(requestId: string, result: unknown): WsSuccessResponse {
  return {
    id: requestId,
    type: 'res',
    success: true,
    result,
    timestamp: Date.now(),
  }
}

/** 创建错误响应 */
export function createErrorResponse(requestId: string, code: ErrorCode, message: string): WsErrorResponse {
  return {
    id: requestId,
    type: 'res',
    success: false,
    error: { code, message },
    timestamp: Date.now(),
  }
}

/** 创建事件消息 */
export function createEvent(event: string, data: unknown): WsEvent {
  return {
    id: crypto.randomUUID(),
    type: 'event',
    event,
    data,
    timestamp: Date.now(),
  }
}

/** 解析 WS 消息 */
export function parseWsMessage(raw: string): AnyWsMessage | null {
  try {
    const msg = JSON.parse(raw)
    if (!msg || typeof msg !== 'object') return null
    if (!msg.type || !msg.id) return null
    if (!['req', 'res', 'event'].includes(msg.type)) return null
    return msg as AnyWsMessage
  } catch {
    return null
  }
  
}

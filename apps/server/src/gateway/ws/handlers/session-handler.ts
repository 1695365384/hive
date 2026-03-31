/**
 * SessionHandler — 会话管理域
 *
 * session.list / session.get / session.delete
 */

import type { HandlerContext, MethodHandler } from '../handler-context.js'
import { WsDomainHandler } from './base.js'
import type { SessionGetParams, SessionDeleteParams } from '../data-types.js'
import { createSuccessResponse, createErrorResponse } from '../types.js'

export class SessionHandler extends WsDomainHandler {
  register(): Map<string, MethodHandler> {
    return new Map<string, MethodHandler>([
      ['session.list', this.handleSessionList.bind(this)],
      ['session.get', this.handleSessionGet.bind(this)],
      ['session.delete', this.handleSessionDelete.bind(this)],
    ])
  }

  private handleSessionList(_params: unknown, id: string) {
    // Session 数据由 core 的 SessionCapability 管理
    // 暂时返回空列表，后续通过 server 实例获取
    return createSuccessResponse(id, [])
  }

  private handleSessionGet(params: unknown, id: string) {
    const { id: sessionId } = params as SessionGetParams
    if (!sessionId || typeof sessionId !== 'string') {
      return createErrorResponse(id, 'VALIDATION', 'id is required')
    }
    return createSuccessResponse(id, null)
  }

  private handleSessionDelete(params: unknown, id: string) {
    const { id: sessionId } = params as SessionDeleteParams
    if (!sessionId || typeof sessionId !== 'string') {
      return createErrorResponse(id, 'VALIDATION', 'id is required')
    }
    return createSuccessResponse(id, { success: true })
  }
}

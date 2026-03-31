/**
 * LogHandler — 日志管理域
 *
 * log.getHistory / log.tail / log.listDates / log.getByDate / log.subscribe / log.unsubscribe
 */

import type { WebSocket } from 'ws'
import type { LogHistoryParams } from '../data-types.js'
import type { HandlerContext, MethodHandler } from '../handler-context.js'
import { WsDomainHandler } from './base.js'
import { createSuccessResponse, createErrorResponse } from '../types.js'

export class LogHandler extends WsDomainHandler {
  register(): Map<string, MethodHandler> {
    return new Map<string, MethodHandler>([
      ['log.getHistory', this.handleLogGetHistory.bind(this)],
      ['log.tail', this.handleLogTail.bind(this)],
      ['log.listDates', this.handleLogListDates.bind(this)],
      ['log.getByDate', this.handleLogGetByDate.bind(this)],
      ['log.subscribe', this.handleLogSubscribe.bind(this)],
      ['log.unsubscribe', this.handleLogUnsubscribe.bind(this)],
    ])
  }

  private handleLogGetHistory(params: unknown, id: string) {
    const entries = this.ctx.getLogBuffer().query(params as LogHistoryParams)
    return createSuccessResponse(id, entries)
  }

  /** 增量拉取：返回 sinceId 之后的日志（前端轮询用） */
  private handleLogTail(params: unknown, id: string) {
    const { sinceId, limit } = params as { sinceId?: string; limit?: number }
    const entries = this.ctx.getLogBuffer().query({ sinceId, limit: limit ?? 200 })
    return createSuccessResponse(id, entries)
  }

  /** 列出有日志文件的日期 */
  private handleLogListDates(_params: unknown, id: string) {
    const hiveLogger = this.ctx.getHiveLogger()
    const dates = hiveLogger?.listLogDates() ?? []
    return createSuccessResponse(id, dates)
  }

  /** 按日期读取历史日志 */
  private handleLogGetByDate(params: unknown, id: string) {
    const { date, limit, offset } = params as { date?: string; limit?: number; offset?: number }
    if (!date) {
      return createErrorResponse(id, 'VALIDATION', 'date is required')
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return createErrorResponse(id, 'VALIDATION', 'date must be YYYY-MM-DD format')
    }
    const hiveLogger = this.ctx.getHiveLogger()
    const entries = hiveLogger?.getLogsByDate(date, limit ?? 200, offset ?? 0) ?? []
    return createSuccessResponse(id, entries)
  }

  private handleLogSubscribe(_params: unknown, id: string, ws?: WebSocket) {
    if (ws) {
      const client = this.ctx.findClientByWs(ws)
      if (client) client.logSubscribed = true
    }
    return createSuccessResponse(id, { success: true })
  }

  private handleLogUnsubscribe(_params: unknown, id: string, ws?: WebSocket) {
    if (ws) {
      const client = this.ctx.findClientByWs(ws)
      if (client) client.logSubscribed = false
    }
    return createSuccessResponse(id, { success: true })
  }
}

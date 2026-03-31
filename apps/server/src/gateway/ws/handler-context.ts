/**
 * HandlerContext — Domain Handler 共享依赖注入
 *
 * 封装所有 Domain Handler 需要的共享能力，
 * 通过构造函数注入，使依赖关系显式化。
 */

import type { WebSocket } from 'ws'
import type { Server } from '@bundy-lmw/hive-core'
import type { HiveLogger } from '../../logging/hive-logger.js'
import { LogBuffer } from './log-buffer.js'
import type { ServerConfig, LogEntry } from './data-types.js'

export interface AdminClient {
  ws: WebSocket
  logSubscribed: boolean
  threadIds: Set<string>
}

export interface HandlerContext {
  /** 广播事件到所有连接的 admin 客户端 */
  broadcastEvent(event: string, data: unknown): void
  /** 推送日志到已订阅的 admin 客户端 */
  broadcastLog(entry: LogEntry): void
  /** 读取配置（带缓存） */
  loadConfig(): ServerConfig
  /** 保存配置 */
  saveConfig(config: ServerConfig): void
  /** 获取脱敏后的配置 */
  sensitizeConfig(config: ServerConfig): ServerConfig
  /** 获取 Server 实例 */
  getServer(): Server | null
  /** 获取 LogBuffer */
  getLogBuffer(): LogBuffer
  /** 获取 HiveLogger */
  getHiveLogger(): HiveLogger | null
  /** 获取所有已连接的 admin 客户端 */
  getClients(): Set<AdminClient>
  /** 通过 WS 实例查找 AdminClient */
  findClientByWs(ws: WebSocket): AdminClient | undefined
}

export type MethodHandler = (params: unknown, requestId: string, ws?: WebSocket) => WsHandlerResponse | Promise<WsHandlerResponse>

export type WsHandlerResponse = import('./types.js').WsResponse

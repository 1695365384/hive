/**
 * 环形日志缓冲区
 *
 * 固定大小的日志存储，超出容量自动淘汰旧日志
 */

import type { LogEntry, LogLevel } from './data-types.js'

export class LogBuffer {
  private buffer: LogEntry[] = []
  private readonly maxSize: number
  private counter = 0

  constructor(maxSize = 10_000) {
    this.maxSize = maxSize
  }

  /** 添加日志 */
  add(level: LogLevel, source: string, message: string): LogEntry {
    const entry: LogEntry = {
      id: String(++this.counter),
      level,
      source,
      message,
      timestamp: Date.now(),
    }

    if (this.buffer.length >= this.maxSize) {
      this.buffer.shift()
    }

    this.buffer.push(entry)
    return entry
  }

  /** 查询历史日志 */
  query(options?: {
    level?: LogLevel
    source?: string
    query?: string
    limit?: number
    offset?: number
  }): LogEntry[] {
    let result = this.buffer

    if (options?.level) {
      result = result.filter(e => e.level === options.level)
    }
    if (options?.source) {
      result = result.filter(e => e.source === options.source)
    }
    if (options?.query) {
      const q = options.query.toLowerCase()
      result = result.filter(e => e.message.toLowerCase().includes(q))
    }

    const offset = options?.offset ?? 0
    const limit = Math.min(options?.limit ?? 100, 1000)

    return result.slice(offset).slice(-limit)
  }

  /** 获取所有日志（用于调试） */
  getAll(): LogEntry[] {
    return [...this.buffer]
  }

  /** 清空缓冲区 */
  clear(): void {
    this.buffer = []
  }

  /** 当前日志数量 */
  get size(): number {
    return this.buffer.length
  }
}

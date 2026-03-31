/**
 * Hive Logger — pino 封装
 *
 * 统一日志入口：
 * - console 输出（带颜色 + 时间戳）
 * - logBuffer 内存缓冲（供 log.tail API 使用）
 * - 文件持久化（日切割 + 大小切割 + 过期清理）
 */

import { Writable } from 'node:stream'
import { createWriteStream, existsSync, mkdirSync, statSync, readdirSync, unlinkSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import pino from 'pino'
import type { LogEntry, LogLevel } from '../gateway/ws/data-types.js'
import type { LogBuffer } from '../gateway/ws/log-buffer.js'

// ============================================
// 类型
// ============================================

export interface HiveLoggerOptions {
  dir: string
  retentionDays?: number
  maxFileSize?: number
  logLevel?: string
}

export interface HiveLogger {
  logger: pino.Logger
  overrideConsole(): () => void
  dispose(): Promise<void>
  listLogDates(): string[]
  getLogsByDate(date: string, limit?: number, offset?: number): LogEntry[]
}

// ============================================
// pino level → LogLevel 映射
// ============================================

const PINO_LEVEL_MAP: Record<number, LogLevel> = {
  10: 'debug', // pino trace
  20: 'debug',
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'error', // pino fatal
}

// ANSI 颜色
const LEVEL_COLORS: Record<string, string> = {
  debug: '\x1b[2m',
  info: '\x1b[36m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
}
const RESET = '\x1b[0m'
const DIM = '\x1b[2m'

// ============================================
// 创建
// ============================================

export function createHiveLogger(
  logBuffer: LogBuffer,
  broadcastLog: (entry: LogEntry) => void,
  options: HiveLoggerOptions,
): HiveLogger {
  const {
    dir,
    retentionDays = 7,
    maxFileSize = 50 * 1024 * 1024,
    logLevel = 'debug',
  } = options

  // ---- 文件轮转状态 ----
  let currentDate = ''
  let fileIndex = 0
  let currentFilePath = ''
  let fileStream: ReturnType<typeof createWriteStream> | null = null

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  function getToday(): string {
    return new Date().toISOString().slice(0, 10)
  }

  function getFilePath(): string {
    if (fileIndex === 0) return join(dir, `hive-${currentDate}.log`)
    return join(dir, `hive-${currentDate}.${fileIndex}.log`)
  }

  function ensureFile(): void {
    const today = getToday()
    if (today !== currentDate) {
      if (fileStream) fileStream.end()
      currentDate = today
      fileIndex = 0
      fileStream = null
    }
    if (!fileStream) {
      currentFilePath = getFilePath()
      fileStream = createWriteStream(currentFilePath, { flags: 'a' })
      fileStream.on('error', () => {})
    }
    try {
      const stat = statSync(currentFilePath)
      if (stat.size >= maxFileSize) {
        fileStream!.end()
        fileIndex++
        currentFilePath = getFilePath()
        fileStream = createWriteStream(currentFilePath, { flags: 'a' })
        fileStream.on('error', () => {})
      }
    } catch {
      // 文件尚未写入，忽略
    }
  }

  function cleanupExpired(): void {
    if (!existsSync(dir)) return
    try {
      const files = readdirSync(dir)
      const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
      for (const file of files) {
        if (!file.endsWith('.log')) continue
        try {
          const filePath = join(dir, file)
          const stat = statSync(filePath)
          if (stat.mtimeMs < cutoff) unlinkSync(filePath)
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  }

  cleanupExpired()

  // ---- 自定义 pino stream ----
  const stream = new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      const line = typeof chunk === 'string' ? chunk.trim() : chunk.toString('utf-8').trim()

      let entry: any
      try {
        entry = JSON.parse(line)
      } catch {
        callback()
        return
      }

      const level = PINO_LEVEL_MAP[entry.level] ?? 'info'
      const source = entry.source ?? entry.hostname ?? 'server'
      const message = entry.msg ?? ''
      const time = entry.time ?? Date.now()
      const ts = typeof time === 'string'
        ? time.slice(11, 23)
        : new Date(time).toISOString().slice(11, 23)

      // 1. pretty-print 到 console
      const color = LEVEL_COLORS[level] ?? ''
      const label = level.toUpperCase().padEnd(5)
      process.stdout.write(`${DIM}${ts}${RESET} ${color}${label}${RESET} ${DIM}[${source}]${RESET} ${message}\n`)

      // 2. 写入 logBuffer
      const logEntry = logBuffer.add(level, source, message)
      broadcastLog(logEntry)

      // 3. 写入文件
      ensureFile()
      fileStream?.write(line + '\n')

      callback()
    },
  })

  // ---- pino logger ----
  const logger = pino(
    {
      level: logLevel,
      formatters: {
        level(label: string) {
          return { level: label }
        },
      },
      timestamp: pino.stdTimeFunctions.isoTime,
      serializers: {
        err: pino.stdSerializers.err,
      },
    },
    stream as any,
  )

  // ---- console override ----
  function extractSource(args: unknown[]): string {
    const first = String(args[0] ?? '')
    const match = first.match(/^\[([^\]]+)\]/)
    return match ? match[1] : 'server'
  }

  function formatArgs(args: unknown[]): string {
    return args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')
  }

  function overrideConsole(): () => void {
    const origLog = console.log
    const origWarn = console.warn
    const origError = console.error
    const origDebug = console.debug

    const restore = () => {
      console.log = origLog
      console.warn = origWarn
      console.error = origError
      console.debug = origDebug
    }

    // 不调用原始 console 方法，pino stream 已负责 stdout 输出，避免双份
    console.log = (...args: unknown[]) => {
      logger.info({ source: extractSource(args) }, formatArgs(args))
    }
    console.warn = (...args: unknown[]) => {
      logger.warn({ source: extractSource(args) }, formatArgs(args))
    }
    console.error = (...args: unknown[]) => {
      logger.error({ source: extractSource(args) }, formatArgs(args))
    }
    console.debug = (...args: unknown[]) => {
      logger.debug({ source: extractSource(args) }, formatArgs(args))
    }

    return restore
  }

  // ---- dispose ----
  async function dispose(): Promise<void> {
    if (fileStream) {
      await new Promise<void>((resolve) => {
        fileStream!.end(() => resolve())
      })
      fileStream = null
    }
    logger.flush()
  }

  // ---- 文件读取（历史日志回溯） ----
  function listLogDates(): string[] {
    if (!existsSync(dir)) return []
    try {
      const files = readdirSync(dir)
      const dates = new Set<string>()
      for (const file of files) {
        const match = file.match(/^hive-(\d{4}-\d{2}-\d{2})/)
        if (match) dates.add(match[1])
      }
      return Array.from(dates).sort().reverse()
    } catch {
      return []
    }
  }

  function getLogsByDate(date: string, limit = 200, offset = 0): LogEntry[] {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return []
    if (!existsSync(dir)) return []

    try {
      const files = readdirSync(dir)
        .filter((f) => f.match(new RegExp(`^hive-${date}(\\.\\d+)?\\.log$`)))
        .sort()

      if (files.length === 0) return []

      const allLines: string[] = []
      for (const file of files) {
        const content = readFileSync(join(dir, file), 'utf-8')
        allLines.push(...content.split('\n').filter(Boolean))
      }

      const entries: LogEntry[] = []
      for (const line of allLines) {
        try {
          const raw = JSON.parse(line)
          const level = PINO_LEVEL_MAP[raw.level] ?? 'info'
          const source = raw.source ?? raw.hostname ?? 'server'
          const message = raw.msg ?? ''
          const time = raw.time ?? Date.now()
          const timestamp = typeof time === 'string' ? new Date(time).getTime() : time
          entries.push({ id: `${timestamp}-${Math.random().toString(36).slice(2, 8)}`, level, source, message, timestamp })
        } catch { /* skip malformed lines */ }
      }

      return entries.slice(offset, offset + limit)
    } catch {
      return []
    }
  }

  return { logger, overrideConsole, dispose, listLogDates, getLogsByDate }
}

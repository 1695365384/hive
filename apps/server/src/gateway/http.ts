/**
 * HTTP Gateway Factory
 *
 * Creates Hono app for HTTP API.
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/deno'
import type { Context } from 'hono'
import type { HiveContext } from '../bootstrap.js'
import type { IChannel, IWebhookHandler } from '@bundy-lmw/hive-core'
import type { HiveLogger } from '../logging/hive-logger.js'
import { createAuthMiddleware } from './auth.js'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

/** Maximum message length (100KB) */
const MAX_MESSAGE_LENGTH = 100_000

/** Maximum in-memory sessions (LRU eviction) */
const MAX_SESSIONS = 10_000

// Simple in-memory session store with LRU eviction
const sessions = new Map<string, { id: string; messages: Array<{ role: string; content: string }> }>()

function setSession(key: string, value: { id: string; messages: Array<{ role: string; content: string }> }): void {
  if (sessions.size >= MAX_SESSIONS) {
    const firstKey = sessions.keys().next().value
    if (firstKey !== undefined) sessions.delete(firstKey)
  }
  sessions.set(key, value)
}

/** Custom Hono logger middleware that writes to HiveLogger (LogBuffer + broadcastLog) */
function hiveLoggerMiddleware(hiveLogger: HiveLogger | null) {
  return async (c: Context, next: () => Promise<void>) => {
    const start = Date.now()
    await next()
    const ms = Date.now() - start
    const method = c.req.method
    const path = c.req.path
    const status = c.res.status
    if (hiveLogger) {
      const color = status < 400 ? 'info' : status < 500 ? 'warn' : 'error'
      hiveLogger.logger[color === 'info' ? 'info' : color === 'warn' ? 'warn' : 'error'](
        { source: 'http' },
        `${method} ${path} ${status} ${ms}ms`,
      )
    }
  }
}

export function createHttpGateway(ctx: HiveContext, hiveLogger?: HiveLogger | null): Hono {
  const app = new Hono()

  // Middleware
  app.use('*', hiveLoggerMiddleware(hiveLogger ?? null))
  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
    : ['http://localhost:3000'];

  app.use(
    '*',
    cors({
      origin: allowedOrigins,
      allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
    })
  )

  // API authentication
  app.use('/api/*', createAuthMiddleware(ctx.config))

  // Health check (no auth required)
  app.get('/health', (c) => {
    return c.json({ status: 'ok', timestamp: new Date().toISOString() })
  })

  // ============================================
  // File Upload & Serve
  // ============================================

  const TEMP_DIR = path.join(process.env.HIVE_HOME || path.join(process.env.HOME!, '.hive'), 'cache', 'temp')
  const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

  // Ensure temp dir exists
  mkdir(TEMP_DIR, { recursive: true }).catch(() => {})

  /** POST /api/upload — multipart file upload */
  app.post('/api/upload', async (c) => {
    try {
      const body = await c.req.parseBody()
      const file = body['file']

      if (!file || !(file instanceof File)) {
        return c.json({ error: 'No file provided' }, 400)
      }

      if (file.size > MAX_FILE_SIZE) {
        return c.json({ error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)` }, 413)
      }

      // Sanitize filename: remove path separators and special chars
      const safeName = path.basename(file.name).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      const savedName = `${randomUUID()}_${safeName}`
      const savedPath = path.join(TEMP_DIR, savedName)

      const buffer = Buffer.from(await file.arrayBuffer())
      const { writeFile } = await import('node:fs/promises')
      await writeFile(savedPath, buffer)

      const isImage = file.type.startsWith('image/')

      return c.json({
        name: safeName,
        savedName,
        path: savedPath,
        size: file.size,
        mimeType: file.type,
        type: isImage ? 'image' : 'file',
        src: `/files/${savedName}`,
      })
    } catch (error) {
      return c.json({ error: 'Upload failed' }, 500)
    }
  })

  // GET /files/:name — serve uploaded files (for image preview etc.)
  app.get('/files/:name', async (c) => {
    const name = c.req.param('name')
    // Prevent path traversal
    if (name.includes('..') || name.includes('/') || name.includes('\\')) {
      return c.json({ error: 'Invalid filename' }, 400)
    }
    const filePath = path.join(TEMP_DIR, name)
    const { stat, readFile } = await import('node:fs/promises')
    try {
      const stats = await stat(filePath)
      const data = await readFile(filePath)
      const ext = path.extname(name).toLowerCase()
      const mimeMap: Record<string, string> = {
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
        '.pdf': 'application/pdf', '.json': 'application/json',
        '.txt': 'text/plain', '.html': 'text/html', '.css': 'text/css',
        '.js': 'text/javascript', '.ts': 'text/typescript',
        '.xml': 'application/xml', '.csv': 'text/csv',
      }
      const mimeType = mimeMap[ext] || 'application/octet-stream'
      return new Response(data, {
        headers: {
          'Content-Type': mimeType,
          'Content-Length': String(stats.size),
          'Cache-Control': 'public, max-age=3600',
        },
      })
    } catch {
      return c.json({ error: 'File not found' }, 404)
    }
  })

  // Chat endpoint
  app.post('/api/chat', async (c) => {
    try {
      const body = await c.req.json()
      const { message, sessionId } = body as { message?: string; sessionId?: string }

      if (!message) {
        return c.json({ error: 'Missing message' }, 400)
      }

      if (typeof message !== 'string' || message.length > MAX_MESSAGE_LENGTH) {
        return c.json({ error: `Message too long (max ${MAX_MESSAGE_LENGTH} chars)` }, 413)
      }

      const sid = sessionId || 'default'

      // Get or create session
      let session = sessions.get(sid)
      if (!session) {
        session = { id: sid, messages: [] }
        setSession(sid, session)
      }

      // Add user message
      session.messages.push({ role: 'user', content: message })

      // Log message received (was bus emit — no subscribers)

      // Send to agent (dispatch for smart routing)
      const result = await ctx.agent.dispatch(message)
      const response = result.text

      // Add assistant message
      session.messages.push({ role: 'assistant', content: response })

      // Log message sent (was bus emit — no subscribers)

      return c.json({
        response,
        sessionId: sid,
      })
    } catch (error) {
      const isDev = process.env.NODE_ENV !== 'production'
      return c.json(
        {
          error: 'Internal server error',
          ...(isDev ? { message: error instanceof Error ? error.message : 'Unknown error' } : {}),
        },
        500
      )
    }
  })

  // List plugins
  app.get('/api/plugins', (c) => {
    return c.json({
      plugins: ctx.plugins.map((p) => ({
        id: p.metadata.id,
        name: p.metadata.name,
        version: p.metadata.version,
      })),
    })
  })

  // List sessions
  app.get('/api/sessions', (c) => {
    const sessionList = Array.from(sessions.values()).map((s) => ({
      id: s.id,
      messageCount: s.messages.length,
    }))
    return c.json({ sessions: sessionList })
  })

  // Get session by ID
  app.get('/api/sessions/:id', (c) => {
    const sessionId = c.req.param('id')
    const session = sessions.get(sessionId)

    if (!session) {
      return c.json({ error: 'Session not found' }, 404)
    }

    return c.json({ session })
  })

  // Delete session
  app.delete('/api/sessions/:id', (c) => {
    const sessionId = c.req.param('id')
    const deleted = sessions.delete(sessionId)
    return c.json({ success: deleted })
  })

  // Webhook endpoint for plugins (e.g., Feishu)
  app.post('/webhook/:plugin/:appId', async (c) => {
    try {
      const pluginName = c.req.param('plugin')
      const appId = c.req.param('appId')

      // Get headers
      const signature = c.req.header('X-Lark-Signature') || c.req.header('X-Feishu-Signature') || ''
      const timestamp = c.req.header('X-Lark-Request-Timestamp') || c.req.header('X-Feishu-Timestamp') || ''
      const nonce = c.req.header('X-Lark-Request-Nonce') || c.req.header('X-Feishu-Nonce') || ''

      // Get body
      const body = await c.req.json()

      // Find the plugin and get its channel
      const plugin = ctx.plugins.find((p) => p.metadata.id === pluginName)
      if (!plugin) {
        return c.json({ error: 'Plugin not found' }, 404)
      }

      // Get channel from plugin
      const channels = plugin.getChannels()
      const channel = channels.find((ch) => {
        // Check channel id format: "feishu:appId"
        if (ch.id === `${pluginName}:${appId}`) return true
        // Check if channel has appId property (for Feishu channels)
        if ('appId' in ch && (ch as { appId: string }).appId === appId) return true
        return false
      })

      const webhookChannel = channel as IChannel & IWebhookHandler
      if (!channel || typeof webhookChannel.handleWebhook !== 'function') {
        return c.json({ error: 'Channel not found or does not support webhooks' }, 404)
      }

      // Handle webhook
      const result = await webhookChannel.handleWebhook(body, signature, timestamp, nonce)
      return c.json(result)
    } catch (error) {
      const isDev = process.env.NODE_ENV !== 'production'
      return c.json(
        {
          error: 'Webhook processing failed',
          ...(isDev ? { message: error instanceof Error ? error.message : 'Unknown error' } : {}),
        },
        500
      )
    }
  })

  // Error handling
  app.notFound((c) => {
    return c.json({ error: 'Not found' }, 404)
  })

  app.onError((err, c) => {
    const isDev = process.env.NODE_ENV !== 'production'
    return c.json(
      { error: 'Internal server error', ...(isDev ? { message: err.message } : {}) },
      500
    )
  })

  return app
}

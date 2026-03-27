/**
 * HTTP Gateway Factory
 *
 * Creates Hono app for HTTP API.
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import type { HiveContext } from '../bootstrap.js'
import type { IChannel, IWebhookHandler } from '@hive/core'

// Simple in-memory session store
const sessions = new Map<string, { id: string; messages: Array<{ role: string; content: string }> }>()

export function createHttpGateway(ctx: HiveContext): Hono {
  const app = new Hono()

  // Middleware
  app.use('*', logger())
  app.use(
    '*',
    cors({
      origin: '*',
      allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
    })
  )

  // Health check
  app.get('/health', (c) => {
    return c.json({ status: 'ok', timestamp: new Date().toISOString() })
  })

  // Chat endpoint
  app.post('/api/chat', async (c) => {
    try {
      const body = await c.req.json()
      const { message, sessionId } = body as { message?: string; sessionId?: string }

      if (!message) {
        return c.json({ error: 'Missing message' }, 400)
      }

      const sid = sessionId || 'default'

      // Get or create session
      let session = sessions.get(sid)
      if (!session) {
        session = { id: sid, messages: [] }
        sessions.set(sid, session)
      }

      // Add user message
      session.messages.push({ role: 'user', content: message })

      // Emit message received event
      ctx.bus?.emit('message:received', {
        content: message,
        sessionId: sid,
        timestamp: Date.now(),
      })

      // Send to agent
      const response = await ctx.agent.chat(message)

      // Add assistant message
      session.messages.push({ role: 'assistant', content: response })

      // Emit message sent event
      ctx.bus?.emit('message:sent', {
        content: response,
        sessionId: sid,
        timestamp: Date.now(),
      })

      return c.json({
        response,
        sessionId: sid,
      })
    } catch (error) {
      console.error('[http] Chat error:', error)
      return c.json(
        {
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        500
      )
    }
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

      console.log(`[http] Webhook received: plugin=${pluginName}, appId=${appId}`)

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
      console.error('[http] Webhook error:', error)
      return c.json(
        {
          error: 'Webhook processing failed',
          message: error instanceof Error ? error.message : 'Unknown error',
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
    console.error('[http] Error:', err)
    return c.json({ error: 'Internal server error', message: err.message }, 500)
  })

  return app
}

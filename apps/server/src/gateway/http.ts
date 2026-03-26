/**
 * HTTP Gateway Factory
 *
 * Creates Hono app for HTTP API.
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import type { HiveContext } from '../bootstrap.js'

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

  // List plugins
  app.get('/api/plugins', (c) => {
    const plugins = ctx.openClawPlugins.map((loader) => {
      const info = loader.getInfo()
      return {
        id: info.definition.id,
        name: info.definition.name,
        version: info.definition.version,
        state: info.state,
        channels: loader.getChannels().map((ch) => ch.id),
        tools: loader.getTools().length,
      }
    })

    return c.json({ plugins })
  })

  // Get plugin details
  app.get('/api/plugins/:id', (c) => {
    const pluginId = c.req.param('id')
    const loader = ctx.openClawPlugins.find((l) => l.getInfo().definition.id === pluginId)

    if (!loader) {
      return c.json({ error: 'Plugin not found' }, 404)
    }

    const info = loader.getInfo()
    return c.json({
      plugin: {
        id: info.definition.id,
        name: info.definition.name,
        version: info.definition.version,
        description: info.definition.description,
        state: info.state,
        channels: loader.getChannels(),
        tools: loader.getTools(),
        hooks: Array.from(loader.getHooks().entries()),
      },
    })
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

/**
 * WebSocket Gateway
 *
 * Real-time bidirectional communication for chat and events.
 */

import type { Server as HttpServer } from 'http'
import type { HiveContext } from '../bootstrap.js'
import { validateWsApiKey } from './auth.js'

/** Maximum message length (100KB) — shared with HTTP gateway */
const MAX_MESSAGE_LENGTH = 100_000

interface WebSocketClient {
  id: string
  ws: WebSocket
  sessionId?: string
}

interface IncomingWsMessage {
  type: string
  [key: string]: unknown
}

interface OutgoingMessage {
  type: string
  [key: string]: unknown
}

export interface WebSocketGateway {
  broadcast: (message: OutgoingMessage) => void
  close: () => void
}

export function createWebSocketGateway(
  server: HttpServer,
  ctx: HiveContext
): WebSocketGateway {
  const clients = new Map<string, WebSocketClient>()
  let clientIdCounter = 0
  // Handle WebSocket upgrade
  server.on('upgrade', (request, socket, head) => {
    const url = request.url
    if (!url) return

    try {
      const parsedUrl = new URL(url, `http://${request.headers.host || 'localhost'}`)
      const pathname = parsedUrl.pathname
      if (pathname !== '/ws') return

      // Validate API key from query param
      const apiKey = parsedUrl.searchParams.get('apiKey')
      if (!validateWsApiKey(ctx.config, apiKey)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
        socket.end()
        return
      }
    } catch {
      // Invalid URL, ignore
    }
  })

  /**
   * Handle incoming WebSocket message
   */
  async function handleMessage(
    client: WebSocketClient,
    data: string,
    ctx: HiveContext
  ): Promise<void> {
    try {
      const message: IncomingWsMessage = JSON.parse(data)

      switch (message.type) {
        case 'chat': {
          await handleChat(client, message, ctx)
          break
        }

        case 'session:create': {
          handleSessionCreate(client)
          break
        }

        case 'session:join': {
          handleSessionJoin(client, message)
          break
        }

        default:
          send(client, {
            type: 'error',
            message: `Unknown message type: ${message.type}`,
          })
      }
    } catch (error) {
      send(client, {
        type: 'error',
        message: 'Invalid message format',
      })
    }
  }

  /**
   * Handle chat message
   */
  async function handleChat(
    client: WebSocketClient,
    message: IncomingWsMessage & { message?: string; sessionId?: string },
    ctx: HiveContext
  ): Promise<void> {
    const text = message.message
    const sessionId = message.sessionId

    if (!text) {
      send(client, {
        type: 'error',
        message: 'Missing message content',
      })
      return
    }

    if (typeof text !== 'string' || text.length > MAX_MESSAGE_LENGTH) {
      send(client, {
        type: 'error',
        message: `Message too long (max ${MAX_MESSAGE_LENGTH} chars)`,
      })
      return
    }

    try {
      // Send to agent (dispatch for smart routing)
      const result = await ctx.agent.dispatch(text)
      const response = result.text

      send(client, {
        type: 'response',
        message: response,
        sessionId: sessionId || client.sessionId,
      })
    } catch (error) {
      const isDev = process.env.NODE_ENV !== 'production'
      send(client, {
        type: 'error',
        message: isDev && error instanceof Error ? error.message : 'Internal error',
      })
    }
  }

  /**
   * Handle session create
   */
  function handleSessionCreate(client: WebSocketClient): void {
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2)}`
    client.sessionId = sessionId

    send(client, {
      type: 'session:created',
      sessionId,
    })
  }

  /**
   * Handle session join
   */
  function handleSessionJoin(
    client: WebSocketClient,
    message: IncomingWsMessage & { sessionId?: string }
  ): void {
    const sessionId = message.sessionId

    if (!sessionId) {
      send(client, {
        type: 'error',
        message: 'Missing sessionId',
      })
      return
    }

    client.sessionId = sessionId

    send(client, {
      type: 'session:joined',
      sessionId,
    })
  }

  /**
   * Send message to client
   */
  function send(client: WebSocketClient, message: OutgoingMessage): void {
    if (client.ws.readyState === 1) { // WebSocket.OPEN
      client.ws.send(JSON.stringify(message))
    }
  }

  /**
   * Broadcast message to all clients
   */
  function broadcast(message: OutgoingMessage): void {
    const data = JSON.stringify(message)
    for (const client of clients.values()) {
      if (client.ws.readyState === 1) { // WebSocket.OPEN
        client.ws.send(data)
      }
    }
  }

  /**
   * Close all connections
   */
  function close(): void {
    // Close all client connections
    for (const client of clients.values()) {
      client.ws.close()
    }

    clients.clear()
  }

  return {
    broadcast,
    close,
  }
}

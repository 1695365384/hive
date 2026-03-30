/**
 * Hive Server Main Entry
 *
 * Unified entry point for both CLI and HTTP/WebSocket server.
 */

import { getConfig } from './config.js'
import { bootstrap, shutdown, type HiveContext } from './bootstrap.js'

export interface ServerOptions {
  port?: number
  plugins?: string[]
}

/**
 * Start Hive server with all gateways
 */
export async function startServer(options: ServerOptions = {}): Promise<{
  context: HiveContext
  close: () => Promise<void>
}> {
  const cfg = getConfig()
  const serverConfig = {
    ...cfg,
    port: options.port || cfg.port,
    plugins: options.plugins || cfg.plugins,
  }

  console.log('[hive] Bootstrapping...')
  const context = await bootstrap({ config: serverConfig })
  console.log('[hive] Bootstrap complete')

  // Create HTTP server
  const { createServer } = await import('http')
  const { createHttpGateway } = await import('./gateway/http.js')

  const app = createHttpGateway(context)

  const server = createServer(async (req, res) => {
    try {
      const url = `http://${req.headers.host || 'localhost'}${req.url}`
      const headers = new Headers()
      for (const [key, value] of Object.entries(req.headers)) {
        if (value) {
          headers.set(key, Array.isArray(value) ? value.join(', ') : String(value))
        }
      }

      let body: string | undefined
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        const chunks: Buffer[] = []
        for await (const chunk of req) {
          chunks.push(chunk)
        }
        body = Buffer.concat(chunks).toString()
      }

      const request = new Request(url, {
        method: req.method,
        headers,
        body,
      })

      const response = await app.fetch(request)

      res.statusCode = response.status
      response.headers.forEach((value, key) => {
        res.setHeader(key, value)
      })
      const buffer = await response.arrayBuffer()
      res.end(Buffer.from(buffer))
    } catch (err) {
      console.error('[hive] Request error:', err)
      res.statusCode = 500
      res.end('Internal Server Error')
    }
  })

  // Setup WebSocket (plugin channels)
  const { createWebSocketGateway } = await import('./gateway/websocket.js')
  const wsGateway = createWebSocketGateway(server, context)

  // Setup Admin WebSocket
  const { WebSocketServer } = await import('ws')
  const { createAdminWsHandler } = await import('./gateway/ws/admin-handler.js')
  const adminWs = new WebSocketServer({ noServer: true })
  const adminHandler = createAdminWsHandler()
  adminHandler.setServer(context.server)
  adminHandler.setHttpServer(server)
  adminHandler.setPlugins(context.plugins)

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '/', `http://${request.headers.host}`)
    if (url.pathname === '/ws/admin') {
      adminWs.handleUpgrade(request, socket, head, (ws) => {
        adminWs.emit('connection', ws, request)
      })
    }
    // 其他 WS 升级（如插件 channel）由 wsGateway 处理
  })

  adminWs.on('connection', (ws) => {
    adminHandler.handleConnection(ws)
  })

  return new Promise((resolve) => {
    server.listen(serverConfig.port, () => {
      console.log(`[hive] Server started on port ${serverConfig.port}`)
      console.log(`[hive] Admin WS available at ws://localhost:${serverConfig.port}/ws/admin`)
      resolve({
        context,
        close: async () => {
          adminHandler.closeAll()
          adminWs.close()
          wsGateway.close()
          server.close()
          await shutdown(context)
        },
      })
    })
  })
}

/**
 * Run CLI mode
 */
export async function runCli(args: string[]): Promise<void> {
  // Import and run CLI
  const cli = await import('./cli/index.js')
  process.argv = [process.argv[0], process.argv[1], ...args]
  await cli.main()
}

// Auto-start if run directly
const isDirectRun = process.argv[1] &&
  (import.meta.url === `file://${process.argv[1]}` ||
   import.meta.url === new URL(process.argv[1], `file://${process.cwd()}/`).href)
if (isDirectRun) {
  startServer().catch((error) => {
    console.error('[hive] Failed to start:', error)
    process.exit(1)
  })
}

export { bootstrap, shutdown, type HiveContext }

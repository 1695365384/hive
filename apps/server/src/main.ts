/**
 * Hive Server Main Entry
 *
 * Unified entry point for both CLI and HTTP/WebSocket server.
 */

import { getConfig, HIVE_HOME } from './config.js'
import { join } from 'node:path'
import { bootstrap, shutdown, type HiveContext } from './bootstrap.js'
import { registerGracefulShutdown } from './graceful-shutdown.js'
import { LogBuffer } from './gateway/ws/log-buffer.js'
import { createHiveLogger, type HiveLogger } from './logging/hive-logger.js'
import type { LogEntry } from './gateway/ws/data-types.js'

export interface ServerOptions {
  port?: number
  plugins?: string[]
  /** Register SIGTERM/SIGINT handlers (default: true for sidecar mode) */
  registerSignals?: boolean
}

/** Module-level close function for signal handler access */
let _closeFn: (() => Promise<void>) | null = null

/**
 * Start Hive server with all gateways
 */
export async function startServer(options: ServerOptions = {}): Promise<{
  context: HiveContext
  close: () => Promise<void>
}> {
  const { registerSignals = true } = options
  const cfg = getConfig()
  const serverConfig = {
    ...cfg,
    port: options.port || cfg.port,
    plugins: options.plugins || cfg.plugins,
  }

  // ---- 1. Create shared LogBuffer + HiveLogger (singleton) ----
  const logBuffer = new LogBuffer(10_000)
  const logSubscribers: Array<(entry: LogEntry) => void> = []

  const hiveLogger: HiveLogger = createHiveLogger(
    logBuffer,
    (entry) => logSubscribers.forEach(fn => fn(entry)),
    { dir: join(HIVE_HOME, 'logs'), retentionDays: 7 },
  )
  hiveLogger.overrideConsole() // 全局唯一一次

  console.log('[hive] Bootstrapping...')
  const context = await bootstrap({
    config: serverConfig,
    pinoLogger: hiveLogger.logger,
  })
  console.log('[hive] Bootstrap complete')

  // ---- 2. Create WS Handlers (inject HiveLogger, no overrideConsole) ----
  const { WebSocketServer } = await import('ws')
  const { createAdminWsHandler } = await import('./gateway/ws/admin-handler.js')
  const { createChatWsHandler } = await import('./gateway/ws/chat-handler.js')
  const adminWs = new WebSocketServer({ noServer: true })
  const chatWs = new WebSocketServer({ noServer: true })

  const adminHandler = createAdminWsHandler(hiveLogger, logBuffer)
  const chatHandler = createChatWsHandler(hiveLogger)

  // Register broadcast subscribers
  logSubscribers.push(
    (entry) => adminHandler.pushLog(entry),
    (entry) => chatHandler.pushLog(entry),
  )

  // ---- 3. Create HTTP server ----
  const { createServer } = await import('http')
  const { createHttpGateway } = await import('./gateway/http.js')

  const app = createHttpGateway(context, hiveLogger)

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

  // Configure handlers
  adminHandler.setServer(context.server)
  adminHandler.setHttpServer(server)
  chatHandler.setServer(context.server)

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '/', `http://${request.headers.host}`)
    if (url.pathname === '/ws/admin') {
      // 认证检查：auth.enabled 时要求 token 参数匹配 apiKey
      if (serverConfig.auth?.enabled && serverConfig.auth.apiKey) {
        const token = url.searchParams.get('token')
        if (token !== serverConfig.auth.apiKey) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
          socket.destroy()
          return
        }
      }

      adminWs.handleUpgrade(request, socket, head, (ws) => {
        adminWs.emit('connection', ws, request)
      })
    } else if (url.pathname === '/ws/chat') {
      chatWs.handleUpgrade(request, socket, head, (ws) => {
        chatWs.emit('connection', ws, request)
      })
    }
    // 其他 WS 升级（如插件 channel）由 wsGateway 处理
  })

  adminWs.on('connection', (ws) => {
    adminHandler.handleConnection(ws)
  })

  chatWs.on('connection', (ws) => {
    chatHandler.handleConnection(ws)
  })

  // Build close function before listening (so signal handlers can use it)
  const close = async () => {
    adminHandler.closeAll()
    chatHandler.closeAll()
    adminWs.close()
    chatWs.close()
    wsGateway.close()
    server.close()
    await hiveLogger.dispose()
    await shutdown(context)
  }

  // Store at module level so signal handlers can access it
  _closeFn = close

  // Register graceful shutdown BEFORE server.listen so SIGTERM is caught immediately
  if (registerSignals) {
    registerGracefulShutdown({ close })
  }

  return new Promise((resolve) => {
    server.listen(serverConfig.port, () => {
      console.log(`[hive] Server started on port ${serverConfig.port}`)
      console.log(`[hive] Admin WS available at ws://localhost:${serverConfig.port}/ws/admin`)
      console.log(`[hive] Chat WS available at ws://localhost:${serverConfig.port}/ws/chat`)
      resolve({ context, close })
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

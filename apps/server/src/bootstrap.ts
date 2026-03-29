/**
 * Hive Server Bootstrap
 *
 * Thin wrapper around createServer() that reads ServerConfig and
 * returns a HiveContext compatible with the existing API surface.
 */

import {
  createServer,
  type Agent,
  type IPlugin,
  type ILogger,
  type Server,
  type MessageBus,
  noopLogger,
} from '@hive/core'
import { resolve } from 'path'
import type { ServerConfig } from './config.js'
import { loadPlugins } from './plugins.js'

export interface HiveContext {
  /** Message bus for event-driven communication */
  bus: MessageBus
  /** Main agent instance */
  agent: Agent
  /** Server configuration */
  config: ServerConfig
  /** Loaded plugins */
  plugins: IPlugin[]
  /** Logger instance */
  logger: ILogger
  /** Heartbeat scheduler (null — managed by server internally) */
  heartbeatScheduler: null
  /** Schedule engine (null — managed by server internally) */
  scheduleEngine: null
  /** Server instance (for stop/shutdown) */
  server: Server
}

export interface BootstrapOptions {
  config: ServerConfig
}

function createLogger(level: string): ILogger {
  const levels = { debug: 0, info: 1, warn: 2, error: 3 }
  const currentLevel = levels[level as keyof typeof levels] ?? 1

  return {
    debug: (msg, ...args) => currentLevel <= 0 && console.log(`[DEBUG] ${msg}`, ...args),
    info: (msg, ...args) => currentLevel <= 1 && console.log(`[INFO] ${msg}`, ...args),
    warn: (msg, ...args) => currentLevel <= 2 && console.warn(`[WARN] ${msg}`, ...args),
    error: (msg, ...args) => currentLevel <= 3 && console.error(`[ERROR] ${msg}`, ...args),
  }
}

export async function bootstrap(options: BootstrapOptions): Promise<HiveContext> {
  const { config } = options
  const logger = createLogger(config.logLevel)
  const plugins = await loadPlugins()

  const server = createServer({
    config: {
      externalConfig: {
        providers: [
          {
            id: config.provider.id,
            name: config.provider.id.toUpperCase(),
            apiKey: config.provider.apiKey,
            model: config.provider.model,
            baseUrl: config.provider.baseUrl || `https://api.${config.provider.id}.com`,
          },
        ],
        activeProvider: config.provider.id,
      },
      heartbeat: config.heartbeat.enabled ? config.heartbeat : undefined,
    },
    plugins,
    dbPath: resolve(process.cwd(), '.hive/hive.db'),
    logger,
  })

  await server.start()

  return {
    bus: server.bus,
    agent: server.agent,
    config,
    plugins,
    logger,
    heartbeatScheduler: null,
    scheduleEngine: null,
    server,
  }
}

// ============================================
// Shutdown
// ============================================

export async function shutdown(ctx: HiveContext): Promise<void> {
  ctx.logger.info('[shutdown] Starting graceful shutdown...')
  await ctx.server.stop()
  ctx.logger.info('[shutdown] Shutdown complete')
}

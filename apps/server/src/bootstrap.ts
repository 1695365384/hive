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
} from '@bundy-lmw/hive-core'
import type { Logger as PinoLogger } from 'pino'
import { join } from 'path'
import type { ServerConfig } from './config.js'
import { loadPlugins } from './plugins.js'
import { HIVE_HOME } from './config.js'

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
  /** Optional pino Logger — when provided, ILogger wraps this instance instead of raw console */
  pinoLogger?: PinoLogger
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

/** Wrap a pino Logger to satisfy the ILogger interface */
function createPinoAdapter(logger: PinoLogger): ILogger {
  const fmt = (msg: string, args: unknown[]) =>
    args.length > 0 ? `${msg} ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}` : msg
  return {
    debug: (msg, ...args) => logger.debug({ source: 'server' }, fmt(msg, args)),
    info: (msg, ...args) => logger.info({ source: 'server' }, fmt(msg, args)),
    warn: (msg, ...args) => logger.warn({ source: 'server' }, fmt(msg, args)),
    error: (msg, ...args) => logger.error({ source: 'server' }, fmt(msg, args)),
  }
}

export async function bootstrap(options: BootstrapOptions): Promise<HiveContext> {
  const { config } = options
  const logger = options.pinoLogger
    ? createPinoAdapter(options.pinoLogger)
    : createLogger(config.logLevel)
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
          },
        ],
        activeProvider: config.provider.id,
      },
      heartbeat: config.heartbeat.enabled ? config.heartbeat : undefined,
    },
    plugins,
    dbPath: join(HIVE_HOME, 'hive.db'),
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

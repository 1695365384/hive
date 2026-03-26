/**
 * Hive Server Bootstrap
 *
 * Initializes all core modules and returns a ready-to-use application context.
 */

import { createAgent, type Agent, type IPlugin, type ILogger } from '@hive/core'
import { MessageBus } from '@hive/orchestrator'
import type { ServerConfig } from './config.js'

export interface HiveContext {
  /** Message bus for event-driven communication */
  bus: MessageBus
  /** Main agent instance */
  agent: Agent
  /** Server configuration */
  config: ServerConfig
  /** Loaded plugins */
  plugins: IPlugin[]
}

export interface BootstrapOptions {
  config: ServerConfig
}

/**
 * Create a simple logger
 */
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

/**
 * Load a plugin by name
 */
async function loadPlugin(
  pluginName: string,
  pluginConfig: Record<string, unknown>,
  bus: MessageBus,
  logger: ILogger
): Promise<IPlugin | null> {
  try {
    logger.info(`[bootstrap] Loading plugin: ${pluginName}`)

    // Dynamic import the plugin module
    const module = await import(pluginName)

    // Get the plugin factory function
    const factory = module.default || module.createPlugin || module[Object.keys(module)[0]]

    if (typeof factory !== 'function') {
      logger.warn(`[bootstrap] Plugin ${pluginName} does not export a factory function`)
      return null
    }

    // Create plugin instance
    const plugin = factory()

    // Initialize plugin
    await plugin.initialize({
      messageBus: bus,
      logger,
      config: pluginConfig,
      registerChannel: (channel: unknown) => {
        logger.info(`[bootstrap] Channel registered: ${(channel as { id: string }).id}`)
        bus.emit(`channel:registered`, channel)
      },
    })

    logger.info(`[bootstrap] Plugin loaded: ${pluginName}`)
    return plugin
  } catch (error) {
    logger.error(`[bootstrap] Failed to load plugin ${pluginName}:`, error)
    return null
  }
}

/**
 * Bootstrap the Hive server
 *
 * This function initializes all core modules in the correct order:
 * 1. MessageBus - event-driven communication
 * 2. Create main agent
 * 3. Load plugins
 * 4. Activate plugins
 */
export async function bootstrap(options: BootstrapOptions): Promise<HiveContext> {
  const { config } = options
  const logger = createLogger(config.logLevel)

  logger.info('[bootstrap] Initializing MessageBus...')
  const bus = new MessageBus()

  logger.info('[bootstrap] Creating main agent...')
  const agent = createAgent({
    externalConfig: {
      providers: [
        {
          id: config.provider.id,
          name: config.provider.id.toUpperCase(),
          apiKey: config.provider.apiKey,
          model: config.provider.model,
          baseUrl: `https://api.${config.provider.id}.com`,
        },
      ],
      activeProvider: config.provider.id,
    },
  })

  // Load plugins
  const plugins: IPlugin[] = []
  for (const pluginName of config.plugins) {
    const pluginConfig = config.pluginConfigs[pluginName] || {}
    const plugin = await loadPlugin(pluginName, pluginConfig, bus, logger)
    if (plugin) {
      plugins.push(plugin)
    }
  }

  // Activate plugins
  for (const plugin of plugins) {
    try {
      await plugin.activate()
      logger.info(`[bootstrap] Plugin activated: ${plugin.metadata.name}`)
    } catch (error) {
      logger.error(`[bootstrap] Failed to activate plugin:`, error)
    }
  }

  logger.info(`[bootstrap] Bootstrap complete. ${plugins.length} plugins loaded.`)

  return {
    bus,
    agent,
    config,
    plugins,
  }
}

/**
 * Graceful shutdown
 */
export async function shutdown(ctx: HiveContext): Promise<void> {
  console.log('[shutdown] Starting graceful shutdown...')

  // Deactivate plugins
  for (const plugin of ctx.plugins) {
    try {
      await plugin.deactivate()
      console.log(`[shutdown] Plugin deactivated: ${plugin.metadata.name}`)
    } catch (error) {
      console.error(`[shutdown] Failed to deactivate plugin:`, error)
    }
  }

  console.log('[shutdown] Shutdown complete')
}

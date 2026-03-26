/**
 * Hive Server Bootstrap
 *
 * Initializes all core modules and returns a ready-to-use application context.
 */

import { createAgent, type Agent } from '@hive/core'
import { MessageBus } from '@hive/orchestrator'
import { OpenClawPluginLoader, type OpenClawPluginDefinition } from '@hive/openclaw-adapter'
import type { ServerConfig } from './config.js'
import { getPluginConfig } from './config.js'

export interface HiveContext {
  /** Message bus for event-driven communication */
  bus: MessageBus
  /** Main agent instance */
  agent: Agent
  /** Loaded OpenClaw plugins */
  openClawPlugins: OpenClawPluginLoader[]
  /** Server configuration */
  config: ServerConfig
}

export interface BootstrapOptions {
  config: ServerConfig
}

/**
 * Bootstrap the Hive server
 *
 * This function initializes all core modules in the correct order:
 * 1. MessageBus - event-driven communication
 * 2. Create main agent
 * 3. Load plugins via OpenClaw adapter
 */
export async function bootstrap(options: BootstrapOptions): Promise<HiveContext> {
  const { config } = options

  console.log('[bootstrap] Initializing MessageBus...')
  const bus = new MessageBus()

  console.log('[bootstrap] Creating main agent...')
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

  console.log('[bootstrap] Loading OpenClaw plugins...')
  const openClawPlugins: OpenClawPluginLoader[] = []

  for (const pluginName of config.plugins) {
    try {
      const pluginConfig = getPluginConfig(config, pluginName)
      const loader = await loadOpenClawPlugin(pluginName, {
        messageBus: bus,
        logger: createLogger(config.logLevel),
        pluginConfig,
      })
      openClawPlugins.push(loader)
      console.log(`[bootstrap] ✓ Loaded plugin: ${pluginName}`)
    } catch (error) {
      console.error(`[bootstrap] ✗ Failed to load plugin ${pluginName}:`)
      console.error(error instanceof Error ? error.message : error)
      if (error instanceof Error && error.stack) {
        console.error(error.stack.split('\n').slice(0, 5).join('\n'))
      }
    }
  }

  console.log(`[bootstrap] Bootstrap complete. ${openClawPlugins.length} plugins loaded.`)

  // Setup message bridge: Plugin events → Agent workflow
  setupMessageBridge(bus, agent, openClawPlugins)

  return {
    bus,
    agent,
    openClawPlugins,
    config,
  }
}

/**
 * Setup message bridge between plugins and agent
 *
 * This is the key integration point:
 * 1. Subscribe to plugin message events on MessageBus
 * 2. Trigger plugin hooks when events arrive
 * 3. Call agent.runWorkflow() to process the message
 */
function setupMessageBridge(
  bus: MessageBus,
  agent: Agent,
  plugins: OpenClawPluginLoader[]
): void {
  console.log('[bootstrap] Setting up message bridge...')

  // Subscribe to all plugin events
  bus.subscribe('plugin.*', async (message) => {
    const { topic, payload } = message
    console.log(`[bridge] Received event: ${topic}`, payload)

    // Extract event type from topic (e.g., "plugin.openclaw-lark.message:received")
    const eventMatch = topic.match(/^plugin\.(.+?)\.(.+)$/)
    if (!eventMatch) return

    const [, pluginId, eventName] = eventMatch

    // Find the plugin and trigger its hook
    const plugin = plugins.find(p => p.getInfo().definition.id === pluginId)
    if (plugin) {
      try {
        await plugin.triggerHook(eventName, payload)
      } catch (error) {
        console.error(`[bridge] Hook ${eventName} failed:`, error)
      }
    }
  })

  // Subscribe to message:received events specifically
  bus.subscribe('plugin.*.message:received', async (message) => {
    const payload = message.payload as {
      from?: string
      content?: string
      channelId?: string
      chatId?: string
    }

    if (!payload?.content) {
      console.log('[bridge] No content in message, skipping')
      return
    }

    console.log(`[bridge] Processing message from ${payload.from}: ${payload.content}`)

    try {
      // Call agent workflow
      const result = await agent.runWorkflow(payload.content)

      console.log(`[bridge] Workflow result:`, result.success ? 'success' : 'failed')

      // TODO: Send response back to Feishu via plugin's sendMessage
      // This requires getting the channel from the plugin and calling sendMessage
      if (result.executeResult?.text) {
        console.log(`[bridge] Response:`, result.executeResult.text.slice(0, 100))
      }
    } catch (error) {
      console.error('[bridge] Workflow failed:', error)
    }
  })

  console.log('[bootstrap] Message bridge setup complete')
}

/**
 * Load an OpenClaw plugin by name
 *
 * Uses jiti for ESM/CJS interop - same approach as OpenClaw itself.
 */
async function loadOpenClawPlugin(
  pluginName: string,
  options: {
    messageBus: MessageBus
    logger: Logger
    pluginConfig: Record<string, unknown>
  }
): Promise<OpenClawPluginLoader> {
  console.log(`[loadOpenClawPlugin] Loading: ${pluginName}`)

  // Create adapter for MessageBus
  const busAdapter = {
    subscribe: (topic: string, handler: unknown) => {
      return options.messageBus.subscribe(topic, handler as (msg: unknown) => void | Promise<void>)
    },
    unsubscribe: (id: string) => options.messageBus.unsubscribe(id),
    publish: async (topic: string, message: unknown) => {
      await options.messageBus.publish(topic, message)
    },
  }

  // Use jiti for ESM/CJS interop (same as OpenClaw)
  const { createJiti } = await import('jiti')
  const jiti = createJiti(import.meta.url, {
    cache: false,
  })

  // Load the plugin module using jiti
  const mod = jiti(pluginName)
  const pluginDefinition: OpenClawPluginDefinition = mod.default || mod

  console.log(`[loadOpenClawPlugin] ✓ Module loaded: ${pluginName} (id: ${pluginDefinition.id})`)

  // Normalize Feishu plugin config BEFORE passing to the loader so that
  // adapter.pluginConfig (returned by LarkClient.runtime.config.loadConfig())
  // already contains channels.feishu.groups — required by the inbound handler.
  const isFeishu = pluginDefinition.id === 'openclaw-lark' || pluginName.includes('lark') || pluginName.includes('feishu')
  const pluginConfig = isFeishu
    ? normalizeFeishuPluginConfig(options.pluginConfig)
    : options.pluginConfig

  const loader = new OpenClawPluginLoader(pluginDefinition, {
    messageBus: busAdapter,
    logger: options.logger,
    source: `npm:${pluginName}`,
    pluginConfig,
  })

  await loader.load()
  await loader.activate()
  console.log(`[loadOpenClawPlugin] loader.activate() done`)

  // Start WebSocket monitor for Feishu plugin
  if (isFeishu) {
    console.log(`[loadOpenClawPlugin] Starting Feishu WebSocket monitor...`)
    try {
      const monitorFn = mod.monitorFeishuProvider
      if (typeof monitorFn === 'function') {
        console.log(`[loadOpenClawPlugin] Monitor config: accounts=${(pluginConfig as Record<string, unknown>).accounts ? Object.keys((pluginConfig as Record<string, unknown>).accounts as object).length : 0}`)

        // Start monitor (non-blocking, runs in background).
        // Use the same normalized pluginConfig so monitor and handler share
        // identical config (handler reads from LarkClient.runtime.config.loadConfig()).
        monitorFn({
          config: pluginConfig,
          runtime: {
            log: options.logger.info,
            error: options.logger.error,
            config: {
              loadConfig: () => pluginConfig,
            },
          },
        }).catch((err: Error) => {
          console.error(`[loadOpenClawPlugin] Monitor error:`, err)
        })

        console.log(`[loadOpenClawPlugin] ✓ Feishu monitor started`)
      } else {
        console.warn(`[loadOpenClawPlugin] ⚠ monitorFeishuProvider not found in module`)
      }
    } catch (err) {
      console.error(`[loadOpenClawPlugin] ✗ Failed to start monitor:`, err)
    }
  }

  console.log(`[loadOpenClawPlugin] ✓ Complete: ${pluginName}`)
  return loader
}

/**
 * Normalize Feishu plugin config.
 *
 * Ensures `channels.feishu.groups` is always a plain object so the
 * OpenClaw inbound handler pipeline can safely read per-group settings.
 * This must be applied BEFORE the config reaches the OpenClawPluginLoader
 * because the handler reads config via LarkClient.runtime.config.loadConfig()
 * which returns adapter.pluginConfig.
 */
export function normalizeFeishuPluginConfig(pluginConfig: Record<string, unknown>): Record<string, unknown> {
  const channels = pluginConfig?.channels as Record<string, unknown> | undefined
  const feishuChannel = channels?.feishu as Record<string, unknown> | undefined

  if (!feishuChannel) {
    console.warn('[normalizeFeishuPluginConfig] No feishu channel config found')
    return pluginConfig
  }

  const normalizedGroups = isPlainObject(feishuChannel.groups)
    ? feishuChannel.groups
    : {}

  return {
    ...pluginConfig,
    channels: {
      ...channels,
      feishu: {
        ...feishuChannel,
        groups: normalizedGroups,
      },
    },
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Simple logger interface
 */
interface Logger {
  debug(message: string, ...args: unknown[]): void
  info(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
}

function createLogger(level: string): Logger {
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
 * Graceful shutdown
 */
export async function shutdown(ctx: HiveContext): Promise<void> {
  console.log('[shutdown] Starting graceful shutdown...')

  // Log plugin unload
  for (const loader of ctx.openClawPlugins) {
    try {
      const info = loader.getInfo()
      console.log(`[shutdown] Unloaded plugin: ${info.definition.id}`)
    } catch (error) {
      console.error(`[shutdown] Error unloading plugin:`, error)
    }
  }

  console.log('[shutdown] Shutdown complete')
}

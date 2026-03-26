import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { readdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import type {
  OpenClawPluginDefinition,
  HiveToOpenClawAdapterOptions,
  PluginInfo,
  PluginLogger,
  OpenClawPluginApi,
  ChannelPlugin,
  PluginRuntime,
  OpenClawPluginService,
  ProviderPlugin
} from './types.js'

/**
 * Internal type for loaded plugin state
 */
interface LoadedPlugin {
  definition: OpenClawPluginDefinition
  api: OpenClawPluginApi | null
  channels: ChannelPlugin[]
  tools: unknown[]
  services: OpenClawPluginService[]
  state: 'loading' | 'loaded' | 'activated' | 'error'
}

/**
 * Internal type for hook entries
 */
interface PluginHookEntry {
  handler: unknown
  options?: { priority?: number }
}

/**
 * Internal type for command definitions
 */
interface PluginCommandDefinition {
  name: string
  description?: string
  handler: unknown
}

/**
 * OpenClaw Plugin Adapter
 *
 * Adapts OpenClaw plugins to run in Hive's orchestrator.
 * Converts channel registrations, tools, and hooks to Hive equivalents.
 */
export class OpenClawPluginLoader {
  private readonly plugin: OpenClawPluginDefinition
  private readonly options: HiveToOpenClawAdapterOptions
  private readonly pluginId: string
  private readonly pluginName: string
  private readonly pluginVersion: string
  private readonly pluginDescription: string
  private pluginConfig: Record<string, unknown>
  private readonly logger: PluginLogger

  private readonly pluginInfo: LoadedPlugin
  private readonly channelPlugins: Map<string, ChannelPlugin> = new Map()
  private readonly toolPlugins: Map<string, unknown> = new Map()
  private readonly hookPlugins: Map<string, PluginHookEntry> = new Map()
  private readonly servicePlugins: Map<string, OpenClawPluginService> = new Map()
  private readonly providerPlugins: Map<string, ProviderPlugin> = new Map()
  private readonly commandPlugins: Map<string, PluginCommandDefinition> = new Map()
  private contextEngine: { id: string; factory: unknown } | null = null
  private _openclawRuntime: Record<string, unknown> | null = null

  constructor(
    plugin: OpenClawPluginDefinition,
    options: HiveToOpenClawAdapterOptions
  ) {
    this.plugin = plugin
    this.options = options
    this.pluginId = plugin.id || 'unknown-plugin'
    this.pluginName = plugin.name || 'Unknown'
    this.pluginVersion = plugin.version || '0.0.0'
    this.pluginDescription = plugin.description || ''
    this.pluginConfig = options.pluginConfig || {}
    this.logger = options.logger || console
    this.pluginInfo = {
      definition: plugin,
      api: null,
      channels: [],
      tools: [],
      services: [],
      state: 'loading'
    }
  }

  /**
   * Create plugin API object for OpenClaw plugins
   */
  private createPluginApi(): OpenClawPluginApi {
    const adapter = this
    const config = this.pluginConfig
    const runtime = this.createPluginRuntime()
    const logger = this.logger

    const api: OpenClawPluginApi = {
      id: this.pluginId,
      name: this.pluginName,
      version: this.pluginVersion,
      description: this.pluginDescription,
      source: adapter.options.source ?? 'unknown',
      config,
      pluginConfig: config,
      runtime,
      logger,

      registerTool: (tool: unknown) => {
        const toolObj = tool as { name?: string }
        adapter.toolPlugins.set(toolObj.name || 'unknown-tool', tool)
        adapter.pluginInfo.tools.push(tool)
      },

      registerHook: (events: string | string[], handler: unknown, opts?: unknown) => {
        const eventList = Array.isArray(events) ? events : [events]
        for (const event of eventList) {
          adapter.hookPlugins.set(event, { handler, options: opts as { priority?: number } | undefined })
        }
      },

      registerChannel: (registration: unknown) => {
        const reg = registration as { plugin?: ChannelPlugin }
        const channel = reg.plugin || (registration as ChannelPlugin)
        adapter.channelPlugins.set(channel.id || 'unknown-channel', channel)
        adapter.pluginInfo.channels.push(channel)
      },

      registerCommand: (command: unknown) => {
        const cmd = command as PluginCommandDefinition
        adapter.commandPlugins.set(cmd.name, cmd)
      },

      registerService: (service: unknown) => {
        const svc = service as OpenClawPluginService
        adapter.servicePlugins.set(svc.id, svc)
        adapter.pluginInfo.services.push(svc)
      },

      registerProvider: (provider: unknown) => {
        const prov = provider as ProviderPlugin
        adapter.providerPlugins.set(prov.id, prov)
      },

      registerContextEngine: (id: string, factory: unknown) => {
        adapter.contextEngine = { id, factory }
      },

      registerCli: (cli: unknown) => {
        // CLI registration - store for later use
        const cliObj = cli as { name?: string }
        adapter.logger.info(`Registered CLI: ${cliObj?.name || 'unknown'}`)
      },

      on: (hookName: string, handler: unknown, opts?: { priority?: number }) => {
        adapter.hookPlugins.set(hookName, { handler, options: opts })
      },

      resolvePath: (input: string): string => {
        return input
      }
    }

    return api
  }

  /**
   * Resolve the full OpenClaw plugin runtime by dynamically loading the
   * internal runtime module from the `openclaw` package.  This provides the
   * `channel`, `agent`, `system` and other runtime surfaces that native
   * channel plugins (e.g. @larksuite/openclaw-lark) depend on.
   */
  private async resolveOpenClawRuntime(): Promise<Record<string, unknown> | null> {
    try {
      const require = createRequire(import.meta.url)
      const pkgPath = require.resolve('openclaw/package.json')
      const distDir = join(dirname(pkgPath), 'dist')

      const files = await readdir(distDir)
      const runtimeFile = files.find(f => /^runtime-[A-Za-z0-9_-]+\.js$/.test(f))
      if (!runtimeFile) return null

      // Use file:// URL to bypass Node exports-map restriction
      const mod = await import(pathToFileURL(join(distDir, runtimeFile)).href)

      // The module re-exports createPluginRuntime under a minified name.
      // Probe every exported function: the one that returns an object with
      // both `channel` and `config` is createPluginRuntime.
      for (const key of Object.keys(mod)) {
        if (typeof mod[key] !== 'function') continue
        try {
          const result = mod[key]()
          if (
            result &&
            typeof result === 'object' &&
            'channel' in result &&
            'config' in result
          ) {
            return result as Record<string, unknown>
          }
        } catch { /* try next export */ }
      }
    } catch (err) {
      this.logger.debug?.(
        `[${this.pluginId}] Could not load OpenClaw runtime (non-fatal): ${err}`
      )
    }
    return null
  }

  /**
   * Create plugin runtime that mimics OpenClaw's runtime
   */
  private createPluginRuntime(): PluginRuntime {
    const adapter = this
    const openclawRuntime = this._openclawRuntime

    // Start from the real OpenClaw runtime (if loaded) then override what
    // the adapter needs to customise.
    const base: Record<string, unknown> = openclawRuntime ? { ...openclawRuntime } : {}

    return {
      ...base,

      // Get config value
      getConfigValue: (key: string): unknown => {
        return adapter.pluginConfig?.[key]
      },

      // Set config value
      setConfigValue: (key: string, value: unknown) => {
        adapter.pluginConfig[key] = value
      },

      // Emit event
      emit: (event: string, data?: unknown) => {
        if (adapter.options.messageBus) {
          adapter.options.messageBus.publish(`plugin.${adapter.pluginId}.${event}`, data)
        }
      },

      // Subscribe to event
      subscribe: (event: string, handler: unknown) => {
        if (adapter.options.messageBus) {
          adapter.options.messageBus.subscribe(`plugin.${adapter.pluginId}.${event}`, handler as () => void)
        }
      },

      // Config management – override OpenClaw's disk-based loader with the
      // adapter's in-memory pluginConfig.
      config: {
        loadConfig: () => adapter.pluginConfig,
      },
    } as PluginRuntime
  }

  /**
   * Initialize the plugin (alias for load)
   */
  async load(): Promise<void> {
    await this.init()
  }

  /**
   * Initialize the plugin
   */
  async init(): Promise<void> {
    try {
      // Load the full OpenClaw runtime before creating the plugin API so that
      // the runtime passed to the plugin includes channel/agent/system surfaces.
      if (!this._openclawRuntime) {
        this._openclawRuntime = await this.resolveOpenClawRuntime()
        if (this._openclawRuntime) {
          this.logger.info(`[${this.pluginId}] OpenClaw runtime loaded successfully`)
        }
      }

      const api = this.createPluginApi()
      this.pluginInfo.api = api
      if (this.plugin.register) {
        this.logger.info(`[${this.pluginId}] calling register()...`)
        await this.plugin.register(api)
        this.logger.info(`[${this.pluginId}] register() complete`)
      }
      this.pluginInfo.state = 'loaded'
      this.logger.info(`[${this.pluginId}] initialized`)
    } catch (error) {
      this.pluginInfo.state = 'error'
      this.logger.error(`[${this.pluginId}] init failed:`, error)
      throw error
    }
  }

  /**
   * Activate the plugin
   */
  async activate(): Promise<void> {
    if (this.plugin.activate) {
      const api = this.createPluginApi()
      await this.plugin.activate(api)
    }
    this.pluginInfo.state = 'activated'
    this.logger.info(`[${this.pluginId}] activated`)
  }

  /**
   * Get plugin info
   */
  getInfo(): PluginInfo {
    return { ...this.pluginInfo, api: this.pluginInfo.api! }
  }

  /**
   * Get registered channels
   */
  getChannels(): ChannelPlugin[] {
    return Array.from(this.channelPlugins.values())
  }

  /**
   * Get registered tools
   */
  getTools(): unknown[] {
    return Array.from(this.toolPlugins.values())
  }

  /**
   * Get registered hooks
   */
  getHooks(): Map<string, PluginHookEntry> {
    return new Map(this.hookPlugins)
  }

  /**
   * Get registered services
   */
  getServices(): OpenClawPluginService[] {
    return Array.from(this.servicePlugins.values())
  }

  /**
   * Get registered providers
   */
  getProviders(): ProviderPlugin[] {
    return Array.from(this.providerPlugins.values())
  }

  /**
   * Get registered commands
   */
  getCommands(): PluginCommandDefinition[] {
    return Array.from(this.commandPlugins.values())
  }

  /**
   * Get context engine
   */
  getContextEngine(): { id: string; factory: unknown } | null {
    return this.contextEngine
  }

  /**
   * Trigger a hook event
   *
   * Calls all registered handlers for the given event.
   * This is the missing link - plugins register hooks but nothing triggers them.
   */
  async triggerHook(eventName: string, context: unknown): Promise<void> {
    const hookEntry = this.hookPlugins.get(eventName)
    if (!hookEntry?.handler) {
      this.logger.debug?.(`[${this.pluginId}] No handler for hook: ${eventName}`)
      return
    }

    try {
      const handler = hookEntry.handler as (ctx: unknown) => void | Promise<void>
      await handler(context)
      this.logger.debug?.(`[${this.pluginId}] Hook ${eventName} triggered successfully`)
    } catch (error) {
      this.logger.error(`[${this.pluginId}] Hook ${eventName} failed:`, error)
      throw error
    }
  }
}

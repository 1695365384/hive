/**
 * @hive/openclaw-adapter - OpenClaw Plugin Compatibility Layer
 *
 * This package provides compatibility layer for running OpenClaw plugins
 * in Hive orchestrator.
 *
 * Usage:
 * ```typescript
 * import { OpenClawPluginLoader } from '@hive/openclaw-adapter'
 * import feishuPlugin from 'openclaw/extensions/feishu'
 *
 * const loader = new OpenClawPluginLoader(feishuPlugin, {
 *   messageBus,
 *   scheduler,
 *   pluginHost,
 *   logger
 * })
 *
 * await loader.load()
 * await loader.activate()
 *
 * // Access registered channels
 * const channels = loader.getChannels()
 * ```
 */

export { OpenClawPluginLoader } from './adapter.js'
export type {
  OpenClawPluginDefinition,
  OpenClawPluginApi,
  OpenClawPluginConfigSchema,
  PluginLogger,
  PluginRuntime,
  ChannelPlugin,
  ChannelCapabilities,
  ChannelMessage,
  ChannelSendResult,
  AnyAgentTool,
  OpenClawPluginService,
  ProviderPlugin,
  PluginInfo,
  HiveToOpenClawAdapterOptions
} from './types.js'

// Import types for function signatures
import type {
  OpenClawPluginDefinition,
  HiveToOpenClawAdapterOptions
} from './types.js'
import { OpenClawPluginLoader } from './adapter.js'

export function createAdapter(
  plugin: OpenClawPluginDefinition,
  options: HiveToOpenClawAdapterOptions
): OpenClawPluginLoader {
  return new OpenClawPluginLoader(plugin, options)
}

/**
 * Load OpenClaw plugin from path
 */
export async function loadPluginFromPath(
  path: string,
  options: HiveToOpenClawAdapterOptions
): Promise<OpenClawPluginLoader> {
  const module = await import(path)
  const definition = module.default || module
  return new OpenClawPluginLoader(definition, options)
}

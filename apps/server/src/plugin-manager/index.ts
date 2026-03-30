/**
 * Plugin Manager — 公开 API
 */

export { searchPlugins, formatSearchResults } from './searcher.js'
export { installPlugin, resolveSource } from './installer.js'
export { listPlugins, removePlugin, showPluginInfo, updatePlugin } from './manager.js'
export { loadRegistry, saveRegistry, addPlugin, removePlugin as removeFromRegistry, getPlugin, hasPlugin } from './registry.js'
export { createPluginCommand } from './cli.js'
export { PLUGINS_DIR, CONFIG_PATH, REGISTRY_PATH, isPathSafe, isGitUrlTrusted, atomicWriteJSON } from './constants.js'
export type { PluginSource, InstallResult, RegistryEntry, PluginRegistry, PluginInfo, NpmSearchPackage } from './types.js'

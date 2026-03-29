/**
 * 插件动态加载
 *
 * 从 hive.config.json 的 plugins 配置读取插件列表，
 * 通过 dynamic import() 加载插件包，取 default export 实例化。
 *
 * 新增插件：npm install @hive/plugin-xxx，然后在 hive.config.json 添加配置即可。
 */

import type { IPlugin } from '@hive/core'
import { getConfig } from './config.js'

/**
 * 动态加载所有配置的插件
 */
export async function loadPlugins(): Promise<IPlugin[]> {
  const { pluginConfigs } = getConfig()
  const plugins: IPlugin[] = []

  for (const [packageName, config] of Object.entries(pluginConfigs)) {
    try {
      const mod = await import(packageName)
      const PluginClass = mod.default

      if (typeof PluginClass !== 'function') {
        console.error(`[plugins] ${packageName}: default export is not a constructor`)
        continue
      }

      const plugin = new PluginClass(config)
      plugins.push(plugin)
      console.log(`[plugins] Loaded: ${packageName}`)
    } catch (error) {
      console.error(`[plugins] Failed to load ${packageName}:`, error instanceof Error ? error.message : error)
    }
  }

  return plugins
}

/**
 * PluginHandler — 插件管理域
 *
 * plugin.list / plugin.available / plugin.install / plugin.uninstall / plugin.updateConfig
 * 含 reloadPlugin（插件热重载）
 */

import { pathToFileURL } from 'node:url'
import { searchPlugins, installPlugin, removePlugin } from '../../../plugin-manager/index.js'
import { loadRegistry } from '../../../plugin-manager/registry.js'
import { scanPluginDir } from '../../../plugins.js'
import { getConfig } from '../../../config.js'
import type { IPlugin } from '@bundy-lmw/hive-core'
import type { HandlerContext, MethodHandler } from '../handler-context.js'
import { WsDomainHandler } from './base.js'
import type {
  PluginInfo, PluginInstallParams, PluginUninstallParams,
  PluginConfigUpdateParams,
} from '../data-types.js'
import { createSuccessResponse, createErrorResponse } from '../types.js'

export class PluginHandler extends WsDomainHandler {
  /** 加载的插件实例，按 registry key 索引 */
  private pluginInstances: Map<string, IPlugin> = new Map()

  register(): Map<string, MethodHandler> {
    return new Map<string, MethodHandler>([
      ['plugin.list', this.handlePluginList.bind(this)],
      ['plugin.available', this.handlePluginAvailable.bind(this)],
      ['plugin.install', this.handlePluginInstall.bind(this)],
      ['plugin.uninstall', this.handlePluginUninstall.bind(this)],
      ['plugin.updateConfig', this.handlePluginUpdateConfig.bind(this)],
    ])
  }

  /** 注入插件实例（在 bootstrap 后调用） */
  setPlugins(plugins: IPlugin[]): void {
    const manifests = scanPluginDir()
    for (const plugin of plugins) {
      const manifest = manifests.find(m => m.name === plugin.metadata.name)
      if (manifest) {
        this.pluginInstances.set(manifest.name, plugin)
      }
    }
  }

  /** 搜索 npm 上可用的 Hive 插件 */
  private async handlePluginAvailable(params: unknown, id: string) {
    const raw = (params ?? {}) as { keyword?: unknown }
    const keyword = typeof raw.keyword === 'string' ? raw.keyword : undefined

    try {
      const { packages } = await searchPlugins(keyword)
      const items = packages.map((pkg) => ({
        name: pkg.name,
        version: pkg.version,
        description: pkg.description,
      }))
      return createSuccessResponse(id, items)
    } catch (error) {
      return createErrorResponse(
        id,
        'INTERNAL',
        error instanceof Error ? error.message : 'Search failed',
      )
    }
  }

  /** 列出已安装的插件 */
  private handlePluginList(_params: unknown, id: string) {
    try {
      const config = this.ctx.loadConfig()
      const items: PluginInfo[] = []
      const registry = loadRegistry()

      for (const [name, entry] of Object.entries(registry)) {
        const pkgName = entry.source.replace(/^npm:/, '').replace(/@[\d.]+$/, '')
        const pluginConfig = config.pluginConfigs?.[pkgName]
        items.push({
          id: name,
          name: pkgName,
          version: entry.resolvedVersion,
          source: entry.source,
          installedAt: entry.installedAt,
          description: undefined,
          enabled: true,
          channels: [],
          config: pluginConfig ?? {},
        })
      }

      return createSuccessResponse(id, items)
    } catch (error) {
      console.error('[plugin.list] Failed to load plugins:', error instanceof Error ? error.message : error)
      return createSuccessResponse(id, [])
    }
  }

  /** 安装插件 */
  private async handlePluginInstall(params: unknown, id: string) {
    const { source } = params as PluginInstallParams

    if (!source || typeof source !== 'string') {
      return createErrorResponse(id, 'VALIDATION', 'source is required')
    }

    try {
      const result = await installPlugin(source)

      // Installer writes config file directly — invalidate cache so plugin.list reads fresh data
      this.ctx.invalidateConfig()

      if (!result.success) {
        return createErrorResponse(id, 'INTERNAL', result.error || 'Installation failed')
      }

      this.ctx.broadcastEvent('plugin.installed', {
        id: result.name,
        name: result.name,
        version: result.version,
      })

      return createSuccessResponse(id, {
        id: result.name,
        name: result.packageName ?? result.name,
        version: result.version,
        enabled: true,
      })
    } catch (error) {
      return createErrorResponse(
        id,
        'INTERNAL',
        error instanceof Error ? error.message : 'Installation failed',
      )
    }
  }

  /** 卸载插件 */
  private handlePluginUninstall(params: unknown, id: string) {
    const { id: pluginId } = params as PluginUninstallParams
    if (!pluginId) {
      return createErrorResponse(id, 'VALIDATION', 'id is required')
    }

    try {
      const entry = loadRegistry()[pluginId]
      const result = removePlugin(pluginId)

      if (!result.success) {
        return createErrorResponse(id, 'INTERNAL', result.error || 'Uninstall failed')
      }

      if (entry) {
        const config = this.ctx.loadConfig()
        const pkgKey = entry.source.replace(/^npm:/, '').replace(/@[\d.]+$/, '')
        if (config.pluginConfigs && pkgKey in config.pluginConfigs) {
          delete config.pluginConfigs[pkgKey]
          this.ctx.saveConfig(config)
        }
      }

      this.ctx.broadcastEvent('plugin.uninstalled', { id: pluginId })
      return createSuccessResponse(id, { success: true })
    } catch (error) {
      return createErrorResponse(
        id,
        'INTERNAL',
        error instanceof Error ? error.message : 'Uninstall failed',
      )
    }
  }

  /** 更新插件配置（写入 hive.config.json） */
  private async handlePluginUpdateConfig(params: unknown, id: string) {
    const { id: pluginId, config } = params as PluginConfigUpdateParams
    if (!pluginId || !config) {
      return createErrorResponse(id, 'VALIDATION', 'id and config are required')
    }

    try {
      const registry = loadRegistry()
      const entry = registry[pluginId]
      const pkgKey = entry
        ? entry.source.replace(/^npm:/, '').replace(/@[\d.]+$/, '')
        : pluginId

      const cfg = this.ctx.loadConfig()
      if (!cfg.pluginConfigs) {
        cfg.pluginConfigs = {}
      }
      cfg.pluginConfigs[pkgKey] = config
      this.ctx.saveConfig(cfg)

      await this.reloadPlugin(pluginId)

      this.ctx.broadcastEvent('plugin.configChanged', { id: pluginId, config })
      return createSuccessResponse(id, { success: true })
    } catch (error) {
      return createErrorResponse(
        id,
        'INTERNAL',
        error instanceof Error ? error.message : 'Config update failed',
      )
    }
  }

  /** 重启指定插件（用最新配置重新初始化） */
  private async reloadPlugin(pluginId: string): Promise<void> {
    const oldPlugin = this.pluginInstances.get(pluginId)
    if (!oldPlugin) {
      console.warn(`[reloadPlugin] Plugin not found in instances: ${pluginId}`)
      return
    }

    const server = this.ctx.getServer()
    if (!server) return

    await oldPlugin.deactivate()
    if (oldPlugin.destroy) await oldPlugin.destroy()

    const manifests = scanPluginDir()
    const manifest = manifests.find(m => m.name === pluginId)
    if (!manifest) {
      console.error(`[reloadPlugin] Manifest not found for: ${pluginId}`)
      return
    }

    const { pluginConfigs } = getConfig()
    const config = pluginConfigs?.[pluginId] ?? {}
    try {
      const entryUrl = pathToFileURL(manifest.entry).href
      const mod = await import(entryUrl)
      const PluginClass = mod.default
      const newPlugin = new PluginClass(config) as IPlugin

      await newPlugin.initialize(
        server.bus,
        server.logger,
        (channel) => server.registerChannel(channel),
      )
      await newPlugin.activate()

      this.pluginInstances.set(pluginId, newPlugin)
      console.log(`[reloadPlugin] Plugin reloaded: ${pluginId}`)
    } catch (error) {
      console.error(`[reloadPlugin] Failed to reload ${pluginId}:`, error instanceof Error ? error.message : error)
    }
  }
}

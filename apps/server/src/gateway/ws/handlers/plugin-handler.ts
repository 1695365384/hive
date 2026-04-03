/**
 * PluginHandler — 插件管理域
 *
 * plugin.list / plugin.available / plugin.install / plugin.uninstall / plugin.updateConfig
 * 含 reloadPlugin（插件热重载）
 *
 * 插件实例由 Server 持有，PluginHandler 通过 Server.getPlugin() / replacePlugin() 操作。
 */

import { pathToFileURL } from 'node:url'
import { searchPlugins, installPlugin, removePlugin } from '../../../plugin-manager/index.js'
import { loadRegistry } from '../../../plugin-manager/registry.js'
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
  register(): Map<string, MethodHandler> {
    return new Map<string, MethodHandler>([
      ['plugin.list', this.handlePluginList.bind(this)],
      ['plugin.available', this.handlePluginAvailable.bind(this)],
      ['plugin.install', this.handlePluginInstall.bind(this)],
      ['plugin.uninstall', this.handlePluginUninstall.bind(this)],
      ['plugin.updateConfig', this.handlePluginUpdateConfig.bind(this)],
    ])
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

      for (const [pluginId, entry] of Object.entries(registry)) {
        const pluginConfig = config.pluginConfigs?.[pluginId]
        items.push({
          id: pluginId,
          name: entry.source.replace(/^npm:/, '').replace(/@[\d.]+$/, ''),
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
  private async handlePluginUninstall(params: unknown, id: string) {
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
        if (config.pluginConfigs && pluginId in config.pluginConfigs) {
          delete config.pluginConfigs[pluginId]
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
      const cfg = this.ctx.loadConfig()
      if (!cfg.pluginConfigs) {
        cfg.pluginConfigs = {}
      }
      cfg.pluginConfigs[pluginId] = config
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

  /**
   * 重启指定插件（swap 模式）
   *
   * 1. 通过 Server.getPlugin() 查找旧实例
   * 2. 创建新实例（先验证，成功后再销毁旧实例）
   * 3. 通过 Server.replacePlugin() 替换
   */
  private async reloadPlugin(pluginId: string): Promise<void> {
    const server = this.ctx.getServer()
    if (!server) {
      console.warn('[reloadPlugin] Server not available')
      return
    }

    const oldPlugin = server.getPlugin(pluginId)
    if (!oldPlugin) {
      console.warn(`[reloadPlugin] Plugin not found: ${pluginId}`)
      return
    }

    // 从 registry 反查 entry 路径
    const entry = loadRegistry()[pluginId]
    if (!entry) {
      console.error(`[reloadPlugin] Plugin not in registry: ${pluginId}`)
      return
    }

    // 读取最新配置（直接用 metadata.id 作为 key）
    const { pluginConfigs } = getConfig()
    const config = pluginConfigs?.[pluginId] ?? {}

    try {
      // Swap 模式：先创建新实例，成功后再销毁旧实例
      const newPlugin = await this.createPluginInstance(pluginId, entry, config, server)
      await newPlugin.initialize(
        (msg) => server.handleMessage(msg),
        server.logger,
        (channel) => server.registerChannel(channel),
      )
      await newPlugin.activate()

      // 新实例就绪，替换并销毁旧实例
      server.replacePlugin(pluginId, newPlugin)
      await oldPlugin.deactivate()
      if (oldPlugin.destroy) await oldPlugin.destroy()

      console.log(`[reloadPlugin] Plugin reloaded: ${pluginId}`)
    } catch (error) {
      console.error(`[reloadPlugin] Failed to reload ${pluginId}:`, error instanceof Error ? error.message : error)
    }
  }

  /** 从 registry entry 创建插件实例 */
  private async createPluginInstance(
    pluginId: string,
    entry: { source: string },
    config: Record<string, unknown>,
    _server: ReturnType<HandlerContext['getServer']>,
  ): Promise<IPlugin> {
    // 所有来源（npm/local/git）统一通过 scanPluginDir 获取 manifest，
    // 然后用文件路径 import，避免 SEA 环境下 import(npmPkg) 无法解析。
    const { scanPluginDir } = await import('../../../plugins.js')
    const manifests = scanPluginDir()
    const target = manifests.find(m => m.id === pluginId)

    if (target) {
      const entryUrl = pathToFileURL(target.entry).href
      const mod = await import(entryUrl)
      return new (mod.default)(config) as IPlugin
    }

    throw new Error(`Cannot resolve plugin entry for: ${pluginId} (${entry.source})`)
  }
}

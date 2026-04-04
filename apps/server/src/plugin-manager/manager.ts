/**
 * Plugin Manager — list / remove / info / update
 */

import { existsSync, readFileSync, rmSync } from 'fs'
import { resolve } from 'path'
import { PLUGINS_DIR, CONFIG_PATH, isPathSafe, atomicWriteJSON, sep } from './constants.js'
import { loadRegistry, removePlugin as removeFromRegistry, getPlugin } from './registry.js'
import type { PluginInfo, InstallResult } from './types.js'

/**
 * 列出所有已安装插件
 */
export function listPlugins(): string {
  const registry = loadRegistry()
  const entries = Object.entries(registry)

  if (entries.length === 0) {
    return 'No plugins installed.\n\nUse `hive plugin search <keyword>` to discover plugins.'
  }

  const lines: string[] = ['']

  for (const [name, entry] of entries) {
    const pluginDir = resolve(PLUGINS_DIR, name)
    const status = existsSync(pluginDir) ? '' : ' (missing)'
    const sourceType = entry.source.split(':')[0]
    const date = new Date(entry.installedAt).toLocaleDateString()

    lines.push(`  ${name.padEnd(20)} v${entry.resolvedVersion.padEnd(10)} ${sourceType.padEnd(6)} ${date}${status}`)
  }

  lines.push('')
  lines.push(`  ${entries.length} plugin(s) installed.`)
  lines.push('')
  return lines.join('\n')
}

/**
 * 卸载插件（含路径安全检查）
 */
export function removePlugin(name: string): { success: boolean; error?: string } {
  if (!getPlugin(name)) {
    return { success: false, error: 'Plugin not installed' }
  }

  if (!isPathSafe(name)) {
    return { success: false, error: `Invalid plugin name: ${name}` }
  }

  const pluginDir = resolve(PLUGINS_DIR, name)
  if (!pluginDir.startsWith(PLUGINS_DIR + sep)) {
    return { success: false, error: 'Path safety check failed' }
  }

  removeFromRegistry(name)

  if (existsSync(pluginDir)) {
    rmSync(pluginDir, { recursive: true, force: true })
  }

  removeFromConfig(name)

  return { success: true }
}

export interface PluginInfoResult {
  success: true
  info: PluginInfo
}

export interface PluginInfoError {
  success: false
  error: string
}

/**
 * 查看插件详情
 */
export function showPluginInfo(name: string): PluginInfoResult | PluginInfoError {
  if (!isPathSafe(name)) {
    return { success: false, error: `Invalid plugin name: ${name}` }
  }

  const entry = getPlugin(name)
  if (!entry) {
    return { success: false, error: 'Plugin not installed' }
  }

  const lines: string[] = ['']
  lines.push(`  Name:      ${name}`)
  lines.push(`  Version:   ${entry.resolvedVersion}`)
  lines.push(`  Source:    ${entry.source}`)
  lines.push(`  Installed: ${new Date(entry.installedAt).toLocaleString()}`)

  const pkgPath = resolve(PLUGINS_DIR, name, 'package.json')
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
      if (pkg.description) lines.push(`  Desc:      ${pkg.description}`)
      if (pkg.homepage) lines.push(`  Homepage:  ${pkg.homepage}`)
    } catch {
      console.warn(`[plugin-manager] Failed to read ${name}/package.json`)
    }
  }

  const config = readPluginConfig()
  const pluginConfig = config[name]
  if (pluginConfig && Object.keys(pluginConfig).length > 0) {
    lines.push(`  Config:    ${JSON.stringify(pluginConfig)}`)
  }

  lines.push('')

  const info: PluginInfo = {
    name,
    version: entry.resolvedVersion,
    source: entry.source,
    installedAt: entry.installedAt,
    description: undefined,
    homepage: undefined,
    config: pluginConfig,
  }

  return { success: true, info }
}

/**
 * 更新插件
 */
export async function updatePlugin(name?: string): Promise<{ updated: string[]; skipped: string[]; errors: Array<{ name: string; error: string }> }> {
  const registry = loadRegistry()
  const names = name ? [name] : Object.keys(registry)

  const updated: string[] = []
  const skipped: string[] = []
  const errors: Array<{ name: string; error: string }> = []

  for (const pluginName of names) {
    const entry = registry[pluginName]
    if (!entry) continue

    if (!entry.source.startsWith('npm:')) {
      skipped.push(pluginName)
      continue
    }

    const npmPackage = entry.source.replace(/^npm:/, '').replace(/@\d+\.\d+\.\d+.*$/, '')

    try {
      const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(npmPackage)}/latest`)
      if (!res.ok) {
        errors.push({ name: pluginName, error: `npm Registry returned ${res.status}` })
        continue
      }
      const latest = (await res.json()) as { version: string }

      if (latest.version === entry.resolvedVersion) {
        skipped.push(pluginName)
        continue
      }

      console.log(`  Updating ${pluginName}: ${entry.resolvedVersion} → ${latest.version}`)

      // 备份用户配置
      const configBackup = backupPluginConfig(pluginName)

      // 先从注册表移除旧记录
      removePlugin(pluginName)

      // 强制重新安装
      const { installPlugin } = await import('./installer.js')
      const result = await installPlugin(`${npmPackage}@${latest.version}`, { force: true })
      if (result.success) {
        // 恢复用户配置
        restorePluginConfig(pluginName, configBackup)
        updated.push(pluginName)
      } else {
        errors.push({ name: pluginName, error: result.error || 'Install failed' })
      }
    } catch (error) {
      errors.push({ name: pluginName, error: error instanceof Error ? error.message : String(error) })
    }
  }

  return { updated, skipped, errors }
}

/**
 * 从 hive.config.json 移除插件配置（原子写入）
 */
function removeFromConfig(pluginName: string): void {
  if (!existsSync(CONFIG_PATH)) return

  try {
    const content = readFileSync(CONFIG_PATH, 'utf-8')
    const config = JSON.parse(content)
    if (config.plugins && pluginName in config.plugins) {
      atomicWriteJSON(CONFIG_PATH, config)
    }
  } catch {
    console.warn('[plugin-manager] Failed to update hive.config.json')
  }
}

function readPluginConfig(): Record<string, Record<string, unknown>> {
  if (!existsSync(CONFIG_PATH)) return {}

  try {
    const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'))
    return config.plugins || {}
  } catch {
    console.warn('[plugin-manager] Failed to read hive.config.json')
    return {}
  }
}

/**
 * 备份插件配置（返回配置快照，更新失败时可恢复）
 */
function backupPluginConfig(pluginName: string): Record<string, unknown> | null {
  const configs = readPluginConfig()
  return configs[pluginName] ?? null
}

/**
 * 恢复插件配置（更新后写入用户之前的配置）
 */
function restorePluginConfig(pluginName: string, config: Record<string, unknown> | null): void {
  if (!config || !existsSync(CONFIG_PATH)) return

  try {
    const content = readFileSync(CONFIG_PATH, 'utf-8')
    const hiveConfig = JSON.parse(content)
    if (!hiveConfig.plugins) hiveConfig.plugins = {}
    hiveConfig.plugins[pluginName] = config
    atomicWriteJSON(CONFIG_PATH, hiveConfig)
  } catch {
    console.warn('[plugin-manager] Failed to restore plugin config')
  }
}

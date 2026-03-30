/**
 * 插件动态加载
 *
 * 支持两种来源：
 * 1. 目录扫描：.hive/plugins/ 下的插件包（优先）
 * 2. npm 动态 import：hive.config.json 中的 plugins 配置（兜底）
 *
 * 配置统一从 hive.config.json 的 plugins 字段读取，
 * 插件目录下的 config.json 仅作为配置模板。
 */

import { existsSync, readdirSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { pathToFileURL } from 'url'
import type { IPlugin } from '@hive/core'
import { getConfig } from './config.js'

// ============================================
// 类型
// ============================================

interface PluginManifest {
  dir: string
  name: string
  entry: string
}

interface HivePluginDeclaration {
  plugin: boolean
  entry?: string
}

interface PluginPackageJson {
  name?: string
  hive?: HivePluginDeclaration
}

// ============================================
// 目录扫描
// ============================================

const PLUGINS_DIR = resolve(process.cwd(), '.hive/plugins')

/**
 * 扫描 .hive/plugins/ 目录，发现合法插件
 */
function scanPluginDir(): PluginManifest[] {
  if (!existsSync(PLUGINS_DIR)) {
    return []
  }

  const manifests: PluginManifest[] = []
  const entries = readdirSync(PLUGINS_DIR, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const pluginDir = resolve(PLUGINS_DIR, entry.name)
    const pkgJsonPath = resolve(pluginDir, 'package.json')

    if (!existsSync(pkgJsonPath)) continue

    try {
      const pkgJson: PluginPackageJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'))

      if (!pkgJson.hive?.plugin) continue

      const entryFile = pkgJson.hive.entry ?? 'dist/index.js'
      const entryPath = resolve(pluginDir, entryFile)

      manifests.push({
        dir: pluginDir,
        name: pkgJson.name ?? entry.name,
        entry: entryPath,
      })
    } catch {
      console.error(`[plugins] Failed to parse ${entry.name}/package.json, skipping`)
    }
  }

  return manifests
}

// ============================================
// 加载逻辑
// ============================================

/**
 * 从目录扫描结果加载插件
 *
 * 配置从 hive.config.json 读取，按插件 name 匹配。
 */
async function loadFromDirectory(
  manifests: PluginManifest[],
  pluginConfigs: Record<string, Record<string, unknown>>,
): Promise<IPlugin[]> {
  const plugins: IPlugin[] = []

  for (const manifest of manifests) {
    try {
      const entryUrl = pathToFileURL(manifest.entry).href
      const mod = await import(entryUrl)
      const PluginClass = mod.default

      if (typeof PluginClass !== 'function') {
        console.error(`[plugins] ${manifest.name}: default export is not a constructor`)
        continue
      }

      const config = pluginConfigs[manifest.name] ?? {}
      const plugin = new PluginClass(config)
      plugins.push(plugin)
      console.log(`[plugins] Loaded (dir): ${manifest.name}`)
    } catch (error) {
      console.error(`[plugins] Failed to load ${manifest.name}:`, error instanceof Error ? error.message : error)
    }
  }

  return plugins
}

/**
 * 从 npm 包名动态加载插件
 */
async function loadFromNpm(pluginConfigs: Record<string, Record<string, unknown>>): Promise<IPlugin[]> {
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
      console.log(`[plugins] Loaded (npm): ${packageName}`)
    } catch (error) {
      console.error(`[plugins] Failed to load ${packageName}:`, error instanceof Error ? error.message : error)
    }
  }

  return plugins
}

// ============================================
// 入口
// ============================================

/**
 * 加载所有插件（目录扫描优先 + npm 兜底）
 *
 * 配置统一从 hive.config.json 的 plugins 字段读取。
 */
export async function loadPlugins(): Promise<IPlugin[]> {
  const { pluginConfigs } = getConfig()

  // 1. 目录扫描（配置从 hive.config.json 读取）
  const manifests = scanPluginDir()
  const dirPlugins = await loadFromDirectory(manifests, pluginConfigs)

  // 2. npm 动态 import（跳过已被目录加载的同名插件）
  const dirNames = new Set(manifests.map(m => m.name))
  const npmConfigs: Record<string, Record<string, unknown>> = {}
  for (const [name, config] of Object.entries(pluginConfigs)) {
    if (!dirNames.has(name)) {
      npmConfigs[name] = config
    }
  }
  const npmPlugins = await loadFromNpm(npmConfigs)

  return [...dirPlugins, ...npmPlugins]
}

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
import type { IPlugin } from '@bundy-lmw/hive-core'
import { getConfig } from './config.js'
import { PLUGINS_DIR } from './plugin-manager/constants.js'

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

/**
 * 扫描 .hive/plugins/ 目录，发现合法插件
 *
 * 支持两种目录结构：
 * 1. 直接目录：plugin/package.json（含 hive.plugin）
 * 2. npm --prefix 安装：plugin/node_modules/@bundy-lmw/hive-plugin-xxx/package.json
 */
export function scanPluginDir(): PluginManifest[] {
  if (!existsSync(PLUGINS_DIR)) {
    return []
  }

  const manifests: PluginManifest[] = []
  const entries = readdirSync(PLUGINS_DIR, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue

    const pluginDir = resolve(PLUGINS_DIR, entry.name)
    const manifest = resolveManifest(pluginDir, entry.name)
    if (manifest) {
      manifests.push(manifest)
    }
  }

  return manifests
}

/**
 * 从插件目录解析 manifest
 *
 * 优先检查直接 package.json，其次检查 npm --prefix 安装的 node_modules。
 */
function resolveManifest(pluginDir: string, dirName: string): PluginManifest | null {
  // 1. 直接目录下的 package.json
  const directPkgPath = resolve(pluginDir, 'package.json')
  if (existsSync(directPkgPath)) {
    try {
      const pkgJson: PluginPackageJson = JSON.parse(readFileSync(directPkgPath, 'utf-8'))
      if (pkgJson.hive?.plugin) {
        const entryFile = pkgJson.hive.entry ?? 'dist/index.js'
        return {
          dir: pluginDir,
          name: pkgJson.name ?? dirName,
          entry: resolve(pluginDir, entryFile),
        }
      }
    } catch (error) {
      console.error(`[plugins] Failed to parse ${dirName}/package.json:`, error instanceof Error ? error.message : 'unknown error')
      return null
    }
  }

  // 2. npm --prefix 安装：检查 node_modules/ 下的包
  const nmDir = resolve(pluginDir, 'node_modules')
  if (!existsSync(nmDir)) return null

  const nmEntries = readdirSync(nmDir, { withFileTypes: true })
  for (const nmEntry of nmEntries) {
    if (!nmEntry.isDirectory()) continue

    if (nmEntry.name.startsWith('@')) {
      const manifest = resolveScopedPackage(nmDir, nmEntry.name, pluginDir, dirName)
      if (manifest) return manifest
    } else {
      const pkgJsonPath = resolve(nmDir, nmEntry.name, 'package.json')
      const manifest = tryParsePkgJson(pkgJsonPath, pluginDir, dirName)
      if (manifest) return manifest
    }
  }

  return null
}

/**
 * 解析 scoped npm 包（@scope/pkg）的 manifest
 */
function resolveScopedPackage(
  nmDir: string,
  scopeName: string,
  pluginDir: string,
  dirName: string,
): PluginManifest | null {
  const scopeDir = resolve(nmDir, scopeName)
  const scopeEntries = readdirSync(scopeDir, { withFileTypes: true })
  for (const scopeEntry of scopeEntries) {
    if (!scopeEntry.isDirectory()) continue
    const pkgJsonPath = resolve(scopeDir, scopeEntry.name, 'package.json')
    const manifest = tryParsePkgJson(pkgJsonPath, pluginDir, dirName)
    if (manifest) return manifest
  }
  return null
}

function tryParsePkgJson(pkgJsonPath: string, pluginDir: string, dirName: string): PluginManifest | null {
  try {
    const pkgJson: PluginPackageJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'))
    if (!pkgJson.hive?.plugin) return null

    const entryFile = pkgJson.hive.entry ?? 'dist/index.js'
    const pkgDir = resolve(pkgJsonPath, '..')
    return {
      dir: pluginDir,
      name: pkgJson.name ?? dirName,
      entry: resolve(pkgDir, entryFile),
    }
  } catch (error) {
    console.warn(`[plugins] Failed to parse ${pkgJsonPath}:`, error instanceof Error ? error.message : 'unknown error')
    return null
  }
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
// 配置归一化
// ============================================

/**
 * Normalize feishu plugin config: ensure `groups` field exists and is a plain object.
 */
export function normalizeFeishuPluginConfig(pluginConfig: Record<string, unknown>): Record<string, unknown> {
  const channels = pluginConfig.channels as Record<string, unknown> | undefined
  if (!channels || typeof channels !== 'object') return pluginConfig

  const feishu = channels.feishu
  if (!feishu || typeof feishu !== 'object') return pluginConfig

  const feishuConfig = feishu as Record<string, unknown>

  if ('groups' in feishuConfig && feishuConfig.groups !== null && typeof feishuConfig.groups === 'object' && !Array.isArray(feishuConfig.groups)) {
    return pluginConfig
  }

  return {
    ...pluginConfig,
    channels: {
      ...channels,
      feishu: { ...feishuConfig, groups: {} },
    },
  }
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

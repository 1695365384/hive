/**
 * Plugin Registry — .registry.json 读写
 *
 * 使用原子写入防止竞态条件。
 */

import { existsSync, readFileSync } from 'fs'
import { REGISTRY_PATH, atomicWriteJSON } from './constants.js'
import type { PluginRegistry, RegistryEntry } from './types.js'

/**
 * 加载注册表
 */
export function loadRegistry(): PluginRegistry {
  if (!existsSync(REGISTRY_PATH)) {
    return {}
  }

  try {
    const content = readFileSync(REGISTRY_PATH, 'utf-8')
    return JSON.parse(content) as PluginRegistry
  } catch {
    console.warn(`[plugin-registry] ${REGISTRY_PATH} is corrupted, treating as empty`)
    return {}
  }
}

/**
 * 保存注册表（原子写入）
 */
export function saveRegistry(registry: PluginRegistry): void {
  atomicWriteJSON(REGISTRY_PATH, registry)
}

/**
 * 添加插件到注册表
 */
export function addPlugin(name: string, entry: RegistryEntry): void {
  const registry = loadRegistry()
  registry[name] = entry
  saveRegistry(registry)
}

/**
 * 从注册表移除插件
 */
export function removePlugin(name: string): boolean {
  const registry = loadRegistry()
  if (!(name in registry)) {
    return false
  }
  const updated = { ...registry }
  delete updated[name]
  saveRegistry(updated)
  return true
}

/**
 * 获取单个插件记录
 */
export function getPlugin(name: string): RegistryEntry | undefined {
  return loadRegistry()[name]
}

/**
 * 检查插件是否已安装
 */
export function hasPlugin(name: string): boolean {
  return name in loadRegistry()
}

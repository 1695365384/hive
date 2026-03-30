/**
 * Plugin Manager - Shared Constants & Utilities
 */

import { existsSync, mkdirSync, writeFileSync, renameSync } from 'fs'
import { resolve, dirname, sep as pathSep } from 'path'

/** Path separator (re-exported for consumers) */
export const sep = pathSep
import { HIVE_HOME } from '../config.js'

/** .hive/plugins/ 目录 */
export const PLUGINS_DIR = resolve(HIVE_HOME, 'plugins')

/** .hive/plugins/.registry.json */
export const REGISTRY_PATH = resolve(PLUGINS_DIR, '.registry.json')

/** hive.config.json */
export const CONFIG_PATH = resolve(HIVE_HOME, 'hive.config.json')

/** 可信的 Git 托管域名白名单 */
const TRUSTED_GIT_HOSTS = [
  'github.com',
  'gitlab.com',
  'bitbucket.org',
  'gitee.com',
  'code.aliyun.com',
]

/**
 * 验证目标路径是否在 plugins 目录内（防止路径穿越）
 */
export function isPathSafe(targetName: string): boolean {
  if (!targetName || targetName.includes('/') || targetName.includes('\\') || targetName.includes('..')) {
    return false
  }
  const resolved = resolve(PLUGINS_DIR, targetName)
  return resolved.startsWith(PLUGINS_DIR + pathSep) || resolved === PLUGINS_DIR
}

/**
 * 验证 Git URL 是否在可信域名白名单内
 */
export function isGitUrlTrusted(url: string): boolean {
  try {
    const hostname = new URL(url).hostname
    return TRUSTED_GIT_HOSTS.some(host => hostname === host || hostname.endsWith('.' + host))
  } catch {
    return false
  }
}

/**
 * 原子写入 JSON 文件：先写临时文件，再 rename
 */
export function atomicWriteJSON(filePath: string, data: unknown): void {
  const dir = dirname(filePath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  const tmpPath = `${filePath}.${Date.now()}.tmp`
  const content = JSON.stringify(data, null, 2) + '\n'

  writeFileSync(tmpPath, content, 'utf-8')
  renameSync(tmpPath, filePath)
}

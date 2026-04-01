/**
 * ConfigStore — 配置读写与缓存
 *
 * 负责加载、保存、脱敏 hive.config.json。
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { HIVE_HOME } from '../../config.js'
import type { ServerConfig } from './data-types.js'

export class ConfigStore {
  private cache: ServerConfig | null = null
  private configPath: string

  constructor(configPath?: string) {
    this.configPath = configPath ?? join(HIVE_HOME, 'hive.config.json')
  }

  load(): ServerConfig {
    if (this.cache) return this.cache

    const defaults: ServerConfig = {
      server: { port: 4450, host: '127.0.0.1', logLevel: 'info' },
      auth: { enabled: false, apiKey: '' },
      provider: { id: 'glm', apiKey: '', model: undefined },
      heartbeat: { enabled: false, intervalMs: 300000 },
    }

    if (!existsSync(this.configPath)) {
      this.cache = defaults
      return defaults
    }

    try {
      const raw = JSON.parse(readFileSync(this.configPath, 'utf-8'))
      const config: ServerConfig = {
        server: { ...defaults.server, ...raw.server },
        auth: { ...defaults.auth, ...raw.auth },
        provider: { ...defaults.provider, ...raw.provider },
        heartbeat: { ...defaults.heartbeat, ...raw.heartbeat },
        pluginConfigs: raw.plugins || {},
      }
      this.cache = config
      return config
    } catch {
      this.cache = defaults
      return defaults
    }
  }

  save(config: ServerConfig): void {
    const dir = resolve(this.configPath, '..')
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    const { pluginConfigs, ...rest } = config
    const fileConfig = { ...rest, plugins: pluginConfigs }
    writeFileSync(this.configPath, JSON.stringify(fileConfig, null, 2), 'utf-8')
    this.cache = config
  }

  /** Invalidate cache so next load() reads from disk */
  invalidate(): void {
    this.cache = null
  }

  sensitize(config: ServerConfig): ServerConfig {
    return {
      ...config,
      auth: { ...config.auth, apiKey: this.maskKey(config.auth.apiKey) },
      provider: { ...config.provider, apiKey: this.maskKey(config.provider.apiKey) },
    }
  }

  private maskKey(key: string): string {
    if (!key || key.length <= 3) return '***'
    return `***${key.slice(-3)}`
  }
}

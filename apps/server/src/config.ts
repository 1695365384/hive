/**
 * Hive Server Configuration
 *
 * Loads configuration from hive.config.json with environment variable interpolation.
 * Falls back to .env for backwards compatibility.
 */

import { config as dotenvConfig } from 'dotenv'
import { existsSync, readFileSync, mkdirSync } from 'fs'
import { resolve, join } from 'path'
import AjvModule from 'ajv'
const Ajv = AjvModule.default

/**
 * Hive 工作空间根目录
 *
 * 优先级: HIVE_HOME 环境变量 > ~/.hive
 */
function getHiveHome(): string {
  if (process.env.HIVE_HOME) {
    return process.env.HIVE_HOME
  }
  return resolve(process.env.HOME || '~', '.hive')
}

export const HIVE_HOME = getHiveHome()

// 确保工作空间目录存在
if (!existsSync(HIVE_HOME)) {
  mkdirSync(HIVE_HOME, { recursive: true })
}

// Load .env file if exists (for env var interpolation)
if (existsSync(join(HIVE_HOME, '.env'))) {
  dotenvConfig({ path: join(HIVE_HOME, '.env') })
}

/**
 * Raw JSON configuration structure
 */
export interface HeartbeatConfigJson {
  enabled?: boolean
  intervalMs?: number
  model?: string
  prompt?: string
}

export interface HiveConfigJson {
  server?: {
    port?: number
    host?: string
    logLevel?: 'debug' | 'info' | 'warn' | 'error'
  }
  auth?: {
    enabled?: boolean
    apiKey?: string
  }
  provider?: {
    id: string
    apiKey?: string
    model?: string
    baseUrl?: string
  }
  heartbeat?: HeartbeatConfigJson
  plugins?: Record<string, Record<string, unknown>>
}

/**
 * Resolved server configuration
 */
export interface HeartbeatConfig {
  enabled: boolean
  intervalMs: number
  model?: string
  prompt?: string
}

export interface ServerConfig {
  /** HTTP server port */
  port: number
  /** Host to bind to */
  host: string
  /** Log level: debug, info, warn, error */
  logLevel: 'debug' | 'info' | 'warn' | 'error'
  /** Plugin packages to load */
  plugins: string[]
  /** Authentication configuration */
  auth: {
    /** Whether API key authentication is enabled */
    enabled: boolean
    /** API key for authentication */
    apiKey: string
  }
  /** LLM provider configuration */
  provider: {
    /** Provider ID (e.g., glm, anthropic, openai) */
    id: string
    /** API key */
    apiKey: string
    /** Model to use */
    model?: string
    /** API base URL */
    baseUrl?: string
  }
  /** Heartbeat schedule configuration */
  heartbeat: HeartbeatConfig
  /** Plugin configurations (key = plugin name, value = config to pass) */
  pluginConfigs: Record<string, Record<string, unknown>>
}

/**
 * Interpolate ${ENV_VAR} placeholders in a string
 * E.g., "${GLM_API_KEY}" → "actual-api-key"
 */
function interpolateEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, envVar) => {
    return process.env[envVar] || ''
  })
}

/**
 * Recursively interpolate ${ENV_VAR} in configuration object
 */
function interpolateConfig(obj: unknown): unknown {
  if (typeof obj === 'string') {
    return interpolateEnvVars(obj)
  }
  if (Array.isArray(obj)) {
    return obj.map(interpolateConfig)
  }
  if (obj && typeof obj === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = interpolateConfig(value)
    }
    return result
  }
  return obj
}

/**
 * Load and parse hive.config.json
 */
function loadJsonConfig(): HiveConfigJson {
  const configPath = join(HIVE_HOME, 'hive.config.json')

  if (!existsSync(configPath)) {
    return {}
  }

  try {
    const content = readFileSync(configPath, 'utf-8')
    const raw = JSON.parse(content)
    const interpolated = interpolateConfig(raw) as HiveConfigJson

    // Validate against JSON Schema
    const schemaPath = join(HIVE_HOME, 'hive.config.schema.json')
    if (existsSync(schemaPath)) {
      const schemaContent = readFileSync(schemaPath, 'utf-8')
      const schema = JSON.parse(schemaContent)
      const ajv = new Ajv({ useDefaults: true })
      const validate = ajv.compile(schema)

      if (!validate(interpolated)) {
        console.error('[config] Validation errors:')
        for (const error of validate.errors || []) {
          console.error(`  - ${error.instancePath}: ${error.message}`)
        }
        throw new Error('Configuration validation failed')
      }
    }

    return interpolated
  } catch (error) {
    console.error('[config] Failed to load hive.config.json:', error)
    throw error
  }
}

/**
 * Load configuration from hive.config.json with fallbacks
 */
export function loadConfig(): ServerConfig {
  const jsonConfig = loadJsonConfig()

  // Server config with defaults
  const server = jsonConfig.server || {}

  // Auth config
  const auth = jsonConfig.auth || {}

  // Provider config
  const provider = jsonConfig.provider || { id: 'glm' }

  // Heartbeat config
  const heartbeat = jsonConfig.heartbeat || {}

  // Plugin list (keys of plugins object)
  const plugins = jsonConfig.plugins ? Object.keys(jsonConfig.plugins) : []

  return {
    port: server.port ?? parseInt(process.env.PORT || '4450', 10),
    host: server.host ?? process.env.HOST ?? '127.0.0.1',
    logLevel: server.logLevel ?? (process.env.LOG_LEVEL as ServerConfig['logLevel']) ?? 'info',
    auth: {
      enabled: auth.enabled ?? process.env.AUTH_ENABLED === 'true',
      apiKey: auth.apiKey || process.env.AUTH_API_KEY || '',
    },
    plugins,
    provider: {
      id: provider.id || process.env.PROVIDER_ID || 'glm',
      apiKey: provider.apiKey || process.env.API_KEY || process.env.GLM_API_KEY || '',
      model: provider.model || process.env.MODEL,
      baseUrl: provider.baseUrl || process.env.BASE_URL,
    },
    heartbeat: {
      enabled: heartbeat.enabled ?? process.env.HEARTBEAT_ENABLED === 'true',
      intervalMs: heartbeat.intervalMs ?? parseInt(process.env.HEARTBEAT_INTERVAL_MS || '300000', 10),
      model: heartbeat.model || process.env.HEARTBEAT_MODEL,
      prompt: heartbeat.prompt || process.env.HEARTBEAT_PROMPT,
    },
    pluginConfigs: jsonConfig.plugins || {},
  }
}

/**
 * Get configuration for a specific plugin
 */
export function getPluginConfig(config: ServerConfig, pluginName: string): Record<string, unknown> {
  return config.pluginConfigs[pluginName] || {}
}

/** Cached config instance */
let _config: ServerConfig | null = null

/**
 * Get configuration (lazy-loaded singleton)
 */
export function getConfig(): ServerConfig {
  if (!_config) {
    _config = loadConfig()
  }
  return _config
}

/**
 * Reset cached config (for testing)
 */
export function resetConfig(): void {
  _config = null
}

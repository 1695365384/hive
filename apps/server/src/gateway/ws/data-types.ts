/**
 * WebSocket 管理协议数据结构定义
 *
 * 定义所有 req/res 中使用的业务数据类型
 */

// ============================================
// 服务状态
// ============================================

export interface ServerStatus {
  server: {
    state: 'starting' | 'running' | 'stopping'
    port: number
    /** 运行时长（秒） */
    uptime: number
    version: string
  }
  agent: {
    initialized: boolean
    providerReady: boolean
    currentProvider: string | null
    activePlugins: string[]
  }
  system: {
    memory: {
      rss: number
      heapUsed: number
      heapTotal: number
    }
    nodeVersion: string
    platform: string
  }
}

// ============================================
// 配置
// ============================================

export interface ServerConfig {
  server: {
    port: number
    host: string
    logLevel: 'debug' | 'info' | 'warn' | 'error'
  }
  auth: {
    enabled: boolean
    apiKey: string
  }
  provider: {
    id: string
    apiKey: string
    model?: string
  }
  heartbeat: {
    enabled: boolean
    intervalMs: number
    model?: string
  }
  pluginConfigs?: Record<string, Record<string, unknown>>
}

export interface ConfigUpdateParams {
  server?: Partial<ServerConfig['server']>
  auth?: Partial<ServerConfig['auth']>
  provider?: Partial<ServerConfig['provider']>
  heartbeat?: Partial<ServerConfig['heartbeat']>
}

// ============================================
// Provider 预设
// ============================================

export interface ProviderPresetInfo {
  id: string
  name: string
  type: 'openai' | 'anthropic' | 'google' | 'openai-compatible'
  defaultModel?: string
  models?: ModelSummary[]
}

export interface ModelSummary {
  id: string
  name: string
  contextWindow: number
  supportsVision?: boolean
  supportsTools?: boolean
}

// ============================================
// 插件
// ============================================

export interface PluginInfo {
  id: string
  name: string
  version: string
  source?: string
  installedAt?: string
  description?: string
  enabled: boolean
  channels?: string[]
  config?: Record<string, unknown>
}

export interface PluginInstallParams {
  /** npm 包名 / Git URL / 本地路径 */
  source: string
}

export interface PluginUninstallParams {
  id: string
}

export interface PluginConfigUpdateParams {
  id: string
  config: Record<string, unknown>
}

// ============================================
// 日志
// ============================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  id: string
  level: LogLevel
  /** 日志来源: 'server' | 'plugin:feishu' | 'agent' 等 */
  source: string
  message: string
  timestamp: number
}

export interface LogHistoryParams {
  level?: LogLevel
  source?: string
  /** 关键词搜索 */
  query?: string
  /** 最大返回条数 (默认 100, 最大 1000) */
  limit?: number
  /** 分页偏移 */
  offset?: number
}

// ============================================
// 会话
// ============================================

export interface SessionSummary {
  id: string
  messageCount: number
  createdAt: number
  lastActiveAt: number
}

export interface SessionDetail {
  id: string
  messages: Array<{
    role: 'user' | 'assistant' | 'system'
    content: string
    timestamp: number
  }>
}

export interface SessionGetParams {
  id: string
}

export interface SessionDeleteParams {
  id: string
}

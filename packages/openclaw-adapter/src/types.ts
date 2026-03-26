/**
 * OpenClaw Plugin Types - Recreated for compatibility
 *
 * These types mirror the OpenClaw plugin SDK interface
 * to allow loading OpenClaw plugins in Hive.
 */

// ============================================================================
// Logger
// ============================================================================

export interface PluginLogger {
  debug?(message: string, ...args: unknown[]): void
  info(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
}

// ============================================================================
// Plugin Definition
// ============================================================================

export interface OpenClawPluginDefinition {
  id?: string
  name?: string
  description?: string
  version?: string
  kind?: 'memory' | 'context-engine' | 'channel'
  configSchema?: OpenClawPluginConfigSchema
  register?: (api: OpenClawPluginApi) => void | Promise<void>
  activate?: (api: OpenClawPluginApi) => void | Promise<void>
}

// ============================================================================
// Config Schema
// ============================================================================

export interface PluginConfigUiHint {
  label?: string
  help?: string
  tags?: string[]
  advanced?: boolean
  sensitive?: boolean
  placeholder?: string
}

export interface PluginConfigValidation {
  ok: boolean
  value?: unknown
  errors?: string[]
}

export interface OpenClawPluginConfigSchema {
  safeParse?: (value: unknown) => {
    success: boolean
    data?: unknown
    error?: { issues?: Array<{ path: Array<string | number>; message: string }> }
  }
  parse?: (value: unknown) => unknown
  validate?: (value: unknown) => PluginConfigValidation
  uiHints?: Record<string, PluginConfigUiHint>
  jsonSchema?: Record<string, unknown>
}

// ============================================================================
// Channel Plugin Types
// ============================================================================

export type ChannelId = string

export interface ChannelCapabilities {
  canSend?: boolean
  canReceive?: boolean
  canReply?: boolean
  canEdit?: boolean
  canDelete?: boolean
  canReact?: boolean
  canSendMedia?: boolean
  canReceiveMedia?: boolean
  supportsTyping?: boolean
  supportsReadReceipts?: boolean
  supportsThreads?: boolean
}

export interface ChannelMessage {
  id: string
  channelId: ChannelId
  chatId: string
  senderId: string
  content: ChannelMessageContent
  timestamp: number
  replyTo?: string
  threadId?: string
}

export interface ChannelMessageContent {
  text?: string
  type: 'text' | 'image' | 'file' | 'audio' | 'video' | 'card'
  data?: unknown
}

export interface ChannelPlugin {
  id: string
  name: string
  channelId: ChannelId
  capabilities?: ChannelCapabilities
  init?: () => Promise<void>
  destroy?: () => Promise<void>
  sendMessage?: (chatId: string, content: ChannelMessageContent) => Promise<void>
  onMessage?: (handler: (message: ChannelMessage) => void | Promise<void>) => void
}

export interface ChannelSendOptions {
  replyTo?: string
  threadId?: string
  parseMode?: 'text' | 'markdown'
}

export interface ChannelSendResult {
  success: boolean
  messageId?: string
  error?: string
}

// ============================================================================
// Plugin Runtime
// ============================================================================

export interface PluginRuntime {
  runSubagent?: (params: unknown) => Promise<unknown>
  getConfigValue?: (key: string) => unknown
  setConfigValue?: (key: string, value: unknown) => void
  emit?: (event: string, data?: unknown) => void
  subscribe?: (event: string, handler: unknown) => void
  config?: {
    loadConfig: () => Record<string, unknown>
  }
  /** Full OpenClaw channel runtime (groups, pairing, reply, text, etc.) */
  channel?: unknown
  /** Allow additional OpenClaw runtime properties (agent, system, etc.) */
  [key: string]: unknown
}

// ============================================================================
// Plugin API
// ============================================================================

export interface OpenClawPluginApi {
  id: string
  name: string
  version?: string
  description?: string
  source: string
  config: Record<string, unknown>
  pluginConfig?: Record<string, unknown>
  runtime: PluginRuntime
  logger: PluginLogger
  registerTool(tool: unknown, opts?: { name?: string; optional?: boolean }): void
  registerHook(events: string | string[], handler: unknown, opts?: unknown): void
  registerChannel(registration: { plugin: ChannelPlugin } | ChannelPlugin): void
  registerCommand(command: PluginCommandDefinition): void
  registerService(service: OpenClawPluginService): void
  registerProvider(provider: ProviderPlugin): void
  registerContextEngine(id: string, factory: unknown): void
  registerCli(cli: unknown): void
  on(hookName: string, handler: unknown, opts?: { priority?: number }): void
  resolvePath(input: string): string
}

// ============================================================================
// Command Types
// ============================================================================

export interface PluginCommandDefinition {
  name: string
  description: string
  acceptsArgs?: boolean
  requireAuth?: boolean
  handler: (ctx: PluginCommandContext) => PluginCommandResult | Promise<PluginCommandResult>
}

export interface PluginCommandContext {
  senderId?: string
  channel: string
  channelId?: ChannelId
  isAuthorizedSender: boolean
  args?: string
  commandBody: string
  config: Record<string, unknown>
}

export type PluginCommandResult = {
  text?: string
  type?: 'text' | 'error' | 'silent'
}

// ============================================================================
// Service Types
// ============================================================================

export interface OpenClawPluginService {
  id: string
  start?: (ctx: PluginServiceContext) => void | Promise<void>
  stop?: (ctx: PluginServiceContext) => void | Promise<void>
}

export interface PluginServiceContext {
  config: Record<string, unknown>
  workspaceDir?: string
  stateDir: string
  logger: PluginLogger
}

// ============================================================================
// Provider Types
// ============================================================================

export interface ProviderPlugin {
  id: string
  label: string
  kind: 'oauth' | 'api_key' | 'token'
}

export interface ContextEngineFactory {
  (config: unknown): unknown
}

// ============================================================================
// Tool Types
// ============================================================================

export type AnyAgentTool = {
  name: string
  description?: string
  inputSchema?: unknown
  handler?: unknown
}

// ============================================================================
// Adapter Options
// ============================================================================

export interface HiveToOpenClawAdapterOptions {
  source?: string
  messageBus?: {
    subscribe: (topic: string, handler: unknown) => string
    unsubscribe: (subscriptionId: string) => boolean
    publish: (topic: string, message: unknown) => Promise<void>
  }
  scheduler?: unknown
  pluginHost?: unknown
  logger?: PluginLogger
  pluginConfig?: Record<string, unknown>
  pluginName?: string
  pluginVersion?: string
  pluginDescription?: string
}

// ============================================================================
// Internal Types (exported for adapter use)
// ============================================================================

export interface PluginHookEntry {
  handler: unknown
  options?: { priority?: number }
}

export interface PluginInfo {
  definition: OpenClawPluginDefinition
  api: OpenClawPluginApi
  channels: ChannelPlugin[]
  tools: unknown[]
  services: OpenClawPluginService[]
  state: 'loading' | 'loaded' | 'activated' | 'error'
}

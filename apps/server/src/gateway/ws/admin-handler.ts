/**
 * Admin WebSocket Handler
 *
 * 处理 /ws/admin 端点的所有管理协议消息：
 * - req/res: 配置管理、服务状态、插件管理、日志查询
 * - event: 日志流推送、状态变更通知
 */

import { EventEmitter } from 'node:events'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { WebSocket } from 'ws'
import { searchPlugins, installPlugin, removePlugin } from '../../plugin-manager/index.js'
import { loadRegistry } from '../../plugin-manager/registry.js'
import { scanPluginDir } from '../../plugins.js'
import type {
  WsRequest, WsResponse, WsEvent,
  WsSuccessResponse, WsErrorResponse, ErrorCode,
} from './types.js'
import { createSuccessResponse, createErrorResponse, createEvent } from './types.js'
import type { Server as HttpServer } from 'node:http'
import { HIVE_HOME, getConfig } from '../../config.js'
import type {
  ServerConfig, ConfigUpdateParams, ServerStatus,
  PluginInfo, PluginInstallParams, PluginUninstallParams,
  PluginConfigUpdateParams, LogHistoryParams, LogEntry,
  SessionSummary, SessionDetail, SessionGetParams, SessionDeleteParams,
  ProviderPresetInfo, ModelSummary,
} from './data-types.js'
import { LogBuffer } from './log-buffer.js'
import { createHiveLogger, type HiveLogger, type HiveLoggerOptions } from '../../logging/hive-logger.js'
import type { Server, IPlugin, ILogger, IMessageBus } from '@bundy-lmw/hive-core'
import type { HookType } from '@bundy-lmw/hive-core'

// ============================================
// 类型
// ============================================

interface AdminClient {
  ws: WebSocket
  logSubscribed: boolean
}

type MethodHandler = (params: unknown, requestId: string, ws?: WebSocket) => WsResponse | Promise<WsResponse>

// ============================================
// AdminWsHandler
// ============================================

export class AdminWsHandler extends EventEmitter {
  private clients: Set<AdminClient> = new Set()
  private logBuffer: LogBuffer
  private hiveLogger: HiveLogger | null = null
  private configCache: ServerConfig | null = null
  private configPath: string
  private server: Server | null = null
  private httpServer: HttpServer | null = null
  private startTime: number
  private handlers: Map<string, MethodHandler>
  /** 加载的插件实例，按 registry key 索引 */
  private pluginInstances: Map<string, IPlugin> = new Map()
  /** 注册的 hook 订阅 ID，用于清理 */
  private hookIds: string[] = []

  constructor(logFileOptions?: HiveLoggerOptions) {
    super()
    this.logBuffer = new LogBuffer(10_000)
    this.configPath = join(HIVE_HOME, 'hive.config.json')
    this.startTime = Date.now()

    // 初始化 pino 日志
    if (logFileOptions) {
      this.hiveLogger = createHiveLogger(
        this.logBuffer,
        (entry) => this.broadcastLog(entry),
        logFileOptions,
      )
      this.hiveLogger.overrideConsole()
    }

    // 注册方法处理器
    this.handlers = new Map<string, MethodHandler>([
      ['config.get', this.handleConfigGet.bind(this)],
      ['config.update', this.handleConfigUpdate.bind(this)],
      ['config.getProviderPresets', this.handleGetProviderPresets.bind(this)],
      ['status.get', this.handleStatusGet.bind(this)],
      ['server.restart', this.handleServerRestart.bind(this)],
      ['server.getProviders', this.handleGetProviders.bind(this)],
      ['provider.list', this.handleProviderList.bind(this)],
      ['provider.getModels', this.handleProviderGetModels.bind(this)],
      ['plugin.list', this.handlePluginList.bind(this)],
      ['plugin.available', this.handlePluginAvailable.bind(this)],
      ['plugin.install', this.handlePluginInstall.bind(this)],
      ['plugin.uninstall', this.handlePluginUninstall.bind(this)],
      ['plugin.updateConfig', this.handlePluginUpdateConfig.bind(this)],
      ['log.getHistory', this.handleLogGetHistory.bind(this)],
      ['log.tail', this.handleLogTail.bind(this)],
      ['log.listDates', this.handleLogListDates.bind(this)],
      ['log.getByDate', this.handleLogGetByDate.bind(this)],
      ['log.subscribe', this.handleLogSubscribe.bind(this)],
      ['log.unsubscribe', this.handleLogUnsubscribe.bind(this)],
      ['session.list', this.handleSessionList.bind(this)],
      ['session.get', this.handleSessionGet.bind(this)],
      ['session.delete', this.handleSessionDelete.bind(this)],
    ])
  }

  // ============================================
  // 生命周期
  // ============================================

  /** 注入 Server 实例（在 start 后调用） */
  setServer(server: Server): void {
    this.server = server
    this.subscribeAgentHooks()
  }

  /** 注入 HttpServer 实例 */
  setHttpServer(httpServer: HttpServer): void {
    this.httpServer = httpServer
  }

  /** 注入插件实例（在 bootstrap 后调用） */
  setPlugins(plugins: IPlugin[]): void {
    const manifests = scanPluginDir()
    for (const plugin of plugins) {
      // 匹配 manifest name 或 registry key（短名）
      const manifest = manifests.find(m => m.name === plugin.metadata.name)
      if (manifest) {
        this.pluginInstances.set(manifest.name, plugin)
      }
    }
  }

  // ============================================
  // Agent Hook 订阅（直接捕获 Agent 运行日志）
  // ============================================

  /** 订阅 Agent hook 事件，通过 pino logger 统一分发 */
  private subscribeAgentHooks(): void {
    const registry = this.server?.agent?.context?.hookRegistry
    if (!registry) return

    const logger = this.hiveLogger?.logger
    const observe = (fn: (ctx: any) => void) => fn as any

    // Agent 思考过程
    this.hookIds.push(registry.on('agent:thinking', observe((ctx: any) => {
      logger?.info({ source: 'agent' }, `[${ctx.type}] ${ctx.thought}`)
    })))

    // 任务进度
    this.hookIds.push(registry.on('task:progress', observe((ctx: any) => {
      logger?.debug({ source: 'agent' }, `${ctx.description} (${ctx.progress}%)`)
    })))

    // 工具调用前
    this.hookIds.push(registry.on('tool:before', observe((ctx: any) => {
      const input = typeof ctx.input === 'object'
        ? Object.keys(ctx.input as object).join(', ')
        : String(ctx.input ?? '')
      logger?.info({ source: 'agent' }, `[tool] calling ${ctx.toolName}(${input})`)
    })))

    // 工具调用后
    this.hookIds.push(registry.on('tool:after', observe((ctx: any) => {
      const status = ctx.success ? 'ok' : 'failed'
      logger?.info({ source: 'agent' }, `[tool] ${ctx.toolName} ${status}`)
    })))

    // API 超时
    this.hookIds.push(registry.on('timeout:api', observe((ctx: any) => {
      logger?.error({ source: 'agent' }, `API timeout after ${ctx.timeout}ms (attempt ${ctx.attempt}/${ctx.maxAttempts})`)
    })))
  }

  /** 清理 hook 订阅 */
  private unsubscribeAgentHooks(): void {
    const registry = this.server?.agent?.context?.hookRegistry
    if (!registry) return
    for (const id of this.hookIds) {
      registry.off(id)
    }
    this.hookIds = []
  }

  /** 重启指定插件（用最新配置重新初始化） */
  private async reloadPlugin(pluginId: string): Promise<void> {
    const oldPlugin = this.pluginInstances.get(pluginId)
    if (!oldPlugin) {
      console.warn(`[reloadPlugin] Plugin not found in instances: ${pluginId}`)
      return
    }
    if (!this.server) return

    // 停用旧实例
    await oldPlugin.deactivate()
    if (oldPlugin.destroy) await oldPlugin.destroy()

    // 查找 manifest
    const manifests = scanPluginDir()
    const manifest = manifests.find(m => m.name === pluginId)
    if (!manifest) {
      console.error(`[reloadPlugin] Manifest not found for: ${pluginId}`)
      return
    }

    // 用最新配置创建新实例
    const { pluginConfigs } = getConfig()
    const config = pluginConfigs?.[pluginId] ?? {}
    try {
      const entryUrl = pathToFileURL(manifest.entry).href
      const mod = await import(entryUrl)
      const PluginClass = mod.default
      const newPlugin = new PluginClass(config) as IPlugin

      // 初始化并激活（复用 server 的 bus/logger）
      await newPlugin.initialize(
        this.server.bus,
        this.server.logger,
        (channel) => this.server!.registerChannel(channel),
      )
      await newPlugin.activate()

      // 更新实例 map
      this.pluginInstances.set(pluginId, newPlugin)
      console.log(`[reloadPlugin] Plugin reloaded: ${pluginId}`)
    } catch (error) {
      console.error(`[reloadPlugin] Failed to reload ${pluginId}:`, error instanceof Error ? error.message : error)
    }
  }

  /** 处理新的 WS 连接 */
  handleConnection(ws: WebSocket): void {
    const client: AdminClient = { ws, logSubscribed: false }
    this.clients.add(client)

    ws.on('message', (raw) => {
      const data = raw.toString()
      const msg = this.parseMessage(data)
      if (!msg) return

      if (msg.type === 'req') {
        this.handleRequest(msg, client).then(response => {
          ws.send(JSON.stringify(response))
        })
      }
    })

    ws.on('close', () => {
      this.clients.delete(client)
    })

    ws.on('error', () => {
      this.clients.delete(client)
    })
  }

  /** 关闭所有连接（graceful shutdown 时调用） */
  async closeAll(): Promise<void> {
    this.broadcastEvent('server.shutting_down', { reason: 'shutdown' })
    this.unsubscribeAgentHooks()
    for (const client of this.clients) {
      client.ws.close()
    }
    this.clients.clear()
    await this.hiveLogger?.dispose()
  }

  // ============================================
  // 消息处理
  // ============================================

  private parseMessage(data: string): WsRequest | null {
    try {
      const msg = JSON.parse(data)
      if (!msg || typeof msg !== 'object') return null
      if (msg.type !== 'req' || !msg.id || !msg.method) return null
      return msg as WsRequest
    } catch {
      return null
    }
  }

  private async handleRequest(req: WsRequest, client: AdminClient): Promise<WsResponse> {
    const handler = this.handlers.get(req.method)
    if (!handler) {
      return createErrorResponse(
        req.id,
        'NOT_FOUND',
        `Unknown method: ${req.method}`,
      )
    }

    try {
      return await handler(req.params, req.id, client.ws)
    } catch (error) {
      return createErrorResponse(
        req.id,
        'INTERNAL',
        error instanceof Error ? error.message : 'Unknown error',
      )
    }
  }

  // ============================================
  // Config Handlers
  // ============================================

  private handleConfigGet(_params: unknown, id: string): WsResponse {
    const config = this.loadConfig()
    return createSuccessResponse(id, this.sensitizeConfig(config))
  }

  private handleConfigUpdate(params: unknown, id: string): WsResponse {
    if (!params || typeof params !== 'object') {
      return createErrorResponse(id, 'VALIDATION', 'params must be an object')
    }
    const updates = params as ConfigUpdateParams
    const config = this.loadConfig()

    if (updates.server) Object.assign(config.server, updates.server)
    if (updates.auth) Object.assign(config.auth, updates.auth)
    if (updates.provider) Object.assign(config.provider, updates.provider)
    if (updates.heartbeat) Object.assign(config.heartbeat, updates.heartbeat)

    this.saveConfig(config)
    this.configCache = null // 清除缓存

    const changedKeys = Object.keys(updates)
    this.broadcastEvent('config.changed', { keys: changedKeys })

    return createSuccessResponse(id, { success: true })
  }

  private handleGetProviderPresets(_params: unknown, id: string): WsResponse {
    if (!this.server) {
      return createErrorResponse(id, 'INTERNAL', 'Server not initialized')
    }

    try {
      const presets = this.server.agent.listPresets()
      return createSuccessResponse(id, presets)
    } catch {
      return createSuccessResponse(id, [])
    }
  }

  // ============================================
  // Status Handlers
  // ============================================

  private handleStatusGet(_params: unknown, id: string): WsResponse {
    const providerReady = this.isProviderReady()
    const currentProvider = this.server?.agent.currentProvider

    const status: ServerStatus = {
      server: {
        state: 'running',
        port: this.getPort(),
        uptime: Math.floor((Date.now() - this.startTime) / 1000),
        version: this.getVersion(),
      },
      agent: {
        initialized: !!this.server,
        providerReady,
        currentProvider: currentProvider?.id ?? null,
        activePlugins: this.getActivePluginIds(),
      },
      system: {
        memory: {
          rss: process.memoryUsage().rss,
          heapUsed: process.memoryUsage().heapUsed,
          heapTotal: process.memoryUsage().heapTotal,
        },
        nodeVersion: process.version,
        platform: `${process.platform} ${process.arch}`,
      },
    }

    return createSuccessResponse(id, status)
  }

  private handleServerRestart(_params: unknown, id: string): WsResponse {
    const response = createSuccessResponse(id, { success: true })

    // 先广播事件，再退出
    this.broadcastEvent('server.shutting_down', { reason: 'restart' })

    setTimeout(() => {
      process.exit(0)
    }, 300)

    return response
  }

  private handleGetProviders(_params: unknown, id: string): WsResponse {
    if (!this.server) {
      return createErrorResponse(id, 'INTERNAL', 'Server not initialized')
    }

    const providers = this.server.agent.listProviders()
    return createSuccessResponse(id, providers)
  }

  private async handleProviderList(_params: unknown, id: string): Promise<WsResponse> {
    if (!this.server) {
      return createErrorResponse(id, 'INTERNAL', 'Server not initialized')
    }

    try {
      const providers = await this.server.agent.listAllProviders()
      return createSuccessResponse(id, providers.map(p => ({
        id: p.id,
        name: p.name,
        logo: p.logo,
        type: p.type,
        defaultModel: p.models.length > 0 ? p.models[0].id : undefined,
        modelCount: p.models.length,
      })))
    } catch (error) {
      return createErrorResponse(id, 'INTERNAL', error instanceof Error ? error.message : 'Failed to list providers')
    }
  }

  private async handleProviderGetModels(params: unknown, id: string): Promise<WsResponse> {
    const { providerId } = params as { providerId: string }
    if (!providerId) {
      return createErrorResponse(id, 'VALIDATION', 'providerId is required')
    }

    if (!this.server) {
      return createErrorResponse(id, 'INTERNAL', 'Server not initialized')
    }

    try {
      const models = await this.server.agent.listProviderModels(providerId)
      return createSuccessResponse(id, models.map(m => ({
        id: m.id,
        name: m.name,
        family: m.family,
        contextWindow: m.contextWindow,
        maxOutputTokens: m.maxOutputTokens,
      })))
    } catch (error) {
      return createErrorResponse(id, 'INTERNAL', error instanceof Error ? error.message : 'Failed to get models')
    }
  }

  // ============================================
  // Plugin Handlers
  // ============================================

  /** 搜索 npm 上可用的 Hive 插件 */
  private async handlePluginAvailable(params: unknown, id: string): Promise<WsResponse> {
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
  private handlePluginList(_params: unknown, id: string): WsResponse {
    try {
      const config = this.loadConfig()
      const items: PluginInfo[] = []

      // 读取 registry 获取结构化数据
      const registry = loadRegistry()

      for (const [name, entry] of Object.entries(registry)) {
        // entry.source 格式: "npm:@bundy-lmw/hive-plugin-feishu@1.0.1"
        // 提取包名
        const pkgName = entry.source.replace(/^npm:/, '').replace(/@[\d.]+$/, '')
        const pluginConfig = config.pluginConfigs?.[pkgName]
        console.debug('[plugin.list] pkgName:', pkgName, 'pluginConfig:', pluginConfig)
        items.push({
          id: name,
          name: pkgName,
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
  private async handlePluginInstall(params: unknown, id: string): Promise<WsResponse> {
    const { source } = params as PluginInstallParams

    if (!source || typeof source !== 'string') {
      return createErrorResponse(id, 'VALIDATION', 'source is required')
    }

    try {
      const result = await installPlugin(source)

      if (!result.success) {
        return createErrorResponse(id, 'INTERNAL', result.error || 'Installation failed')
      }

      this.broadcastEvent('plugin.installed', {
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
  private handlePluginUninstall(params: unknown, id: string): WsResponse {
    const { id: pluginId } = params as PluginUninstallParams
    if (!pluginId) {
      return createErrorResponse(id, 'VALIDATION', 'id is required')
    }

    try {
      // 先查 entry（removePlugin 会把它删掉）
      const entry = loadRegistry()[pluginId]
      const result = removePlugin(pluginId)

      if (!result.success) {
        return createErrorResponse(id, 'INTERNAL', result.error || 'Uninstall failed')
      }

      // 从 hive.config.json 清除插件配置（用包名 key）
      if (entry) {
        const config = this.loadConfig()
        const pkgKey = entry.source.replace(/^npm:/, '').replace(/@[\d.]+$/, '')
        if (config.pluginConfigs && pkgKey in config.pluginConfigs) {
          delete config.pluginConfigs[pkgKey]
          this.saveConfig(config)
        }
      }

      this.broadcastEvent('plugin.uninstalled', { id: pluginId })
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
  private async handlePluginUpdateConfig(params: unknown, id: string): Promise<WsResponse> {
    const { id: pluginId, config } = params as PluginConfigUpdateParams
    if (!pluginId || !config) {
      return createErrorResponse(id, 'VALIDATION', 'id and config are required')
    }

    try {
      // 从 registry 中查找包全名作为 pluginConfigs 的 key
      const registry = loadRegistry()
      const entry = registry[pluginId]
      const pkgKey = entry
        ? entry.source.replace(/^npm:/, '').replace(/@[\d.]+$/, '')
        : pluginId

      const cfg = this.loadConfig()
      if (!cfg.pluginConfigs) {
        cfg.pluginConfigs = {}
      }
      cfg.pluginConfigs[pkgKey] = config
      this.saveConfig(cfg)

      // 重启插件使新配置生效
      await this.reloadPlugin(pluginId)

      this.broadcastEvent('plugin.configChanged', { id: pluginId, config })
      return createSuccessResponse(id, { success: true })
    } catch (error) {
      return createErrorResponse(
        id,
        'INTERNAL',
        error instanceof Error ? error.message : 'Config update failed',
      )
    }
  }

  // ============================================
  // Log Handlers
  // ============================================

  private handleLogGetHistory(params: unknown, id: string): WsResponse {
    const options = params as LogHistoryParams
    const entries = this.logBuffer.query(options)
    return createSuccessResponse(id, entries)
  }

  /** 增量拉取：返回 sinceId 之后的日志（前端轮询用） */
  private handleLogTail(params: unknown, id: string): WsResponse {
    const { sinceId, limit } = params as { sinceId?: string; limit?: number }
    const entries = this.logBuffer.query({ sinceId, limit: limit ?? 200 })
    return createSuccessResponse(id, entries)
  }

  /** 列出有日志文件的日期 */
  private handleLogListDates(_params: unknown, id: string): WsResponse {
    const dates = this.hiveLogger?.listLogDates() ?? []
    return createSuccessResponse(id, dates)
  }

  /** 按日期读取历史日志 */
  private handleLogGetByDate(params: unknown, id: string): WsResponse {
    const { date, limit, offset } = params as { date?: string; limit?: number; offset?: number }
    if (!date) {
      return createErrorResponse(id, 'VALIDATION', 'date is required')
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return createErrorResponse(id, 'VALIDATION', 'date must be YYYY-MM-DD format')
    }
    const entries = this.hiveLogger?.getLogsByDate(date, limit ?? 200, offset ?? 0) ?? []
    return createSuccessResponse(id, entries)
  }

  private handleLogSubscribe(_params: unknown, id: string, ws?: WebSocket): WsResponse {
    // 查找并标记对应客户端为 log subscriber
    for (const client of this.clients) {
      if (client.ws === ws) {
        client.logSubscribed = true
        break
      }
    }
    return createSuccessResponse(id, { success: true })
  }

  private handleLogUnsubscribe(_params: unknown, id: string, ws?: WebSocket): WsResponse {
    for (const client of this.clients) {
      if (client.ws === ws) {
        client.logSubscribed = false
        break
      }
    }
    return createSuccessResponse(id, { success: true })
  }

  // ============================================
  // Session Handlers
  // ============================================

  private handleSessionList(_params: unknown, id: string): WsResponse {
    // Session 数据由 core 的 SessionCapability 管理
    // 暂时返回空列表，后续通过 server 实例获取
    return createSuccessResponse(id, [])
  }

  private handleSessionGet(params: unknown, id: string): WsResponse {
    const { id: sessionId } = params as SessionGetParams
    if (!sessionId || typeof sessionId !== 'string') {
      return createErrorResponse(id, 'VALIDATION', 'id is required')
    }
    return createSuccessResponse(id, null)
  }

  private handleSessionDelete(params: unknown, id: string): WsResponse {
    const { id: sessionId } = params as SessionDeleteParams
    if (!sessionId || typeof sessionId !== 'string') {
      return createErrorResponse(id, 'VALIDATION', 'id is required')
    }
    return createSuccessResponse(id, { success: true })
  }

  // ============================================
  // 事件广播
  // ============================================

  private broadcastEvent(event: string, data: unknown): void {
    const msg = createEvent(event, data)
    const payload = JSON.stringify(msg)
    for (const client of this.clients) {
      if (client.ws.readyState === client.ws.OPEN) {
        client.ws.send(payload)
      }
    }
  }

  /** 推送日志到所有已订阅的客户端 */
  private broadcastLog(entry: LogEntry): void {
    const msg = createEvent('log', entry)
    const payload = JSON.stringify(msg)
    for (const client of this.clients) {
      if (client.logSubscribed && client.ws.readyState === client.ws.OPEN) {
        client.ws.send(payload)
      }
    }
  }

  // ============================================

  private loadConfig(): ServerConfig {
    if (this.configCache) return this.configCache

    const defaults: ServerConfig = {
      server: { port: 4450, host: '127.0.0.1', logLevel: 'info' },
      auth: { enabled: false, apiKey: '' },
      provider: { id: 'glm', apiKey: '', model: undefined },
      heartbeat: { enabled: false, intervalMs: 300000 },
    }

    if (!existsSync(this.configPath)) {
      this.configCache = defaults
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
      this.configCache = config
      return config
    } catch {
      this.configCache = defaults
      return defaults
    }
  }

  private saveConfig(config: ServerConfig): void {
    const dir = resolve(this.configPath, '..')
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    // 写入时将 pluginConfigs 改名为 plugins（与 hive.config.json 格式对齐）
    const { pluginConfigs, ...rest } = config
    const fileConfig = { ...rest, plugins: pluginConfigs }
    writeFileSync(this.configPath, JSON.stringify(fileConfig, null, 2), 'utf-8')
    this.configCache = config
  }

  /** 脱敏配置中的敏感字段 */
  private sensitizeConfig(config: ServerConfig): ServerConfig {
    return {
      ...config,
      auth: {
        ...config.auth,
        apiKey: this.sensitizeApiKey(config.auth.apiKey),
      },
      provider: {
        ...config.provider,
        apiKey: this.sensitizeApiKey(config.provider.apiKey),
      },
    }
  }

  private sensitizeApiKey(key: string): string {
    if (!key || key.length <= 3) return '***'
    return `***${key.slice(-3)}`
  }

  // ============================================
  // 辅助方法
  // ============================================

  private isProviderReady(): boolean {
    const provider = this.server?.agent.currentProvider
    return !!provider?.apiKey && provider.apiKey.length > 0
  }

  private getPort(): number {
    if (this.httpServer) {
      const addr = this.httpServer.address()
      if (typeof addr === 'object' && addr) return addr.port
    }
    return 4450
  }

  private getVersion(): string {
    try {
      const pkgPath = resolve(HIVE_HOME, 'package.json')
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
      return pkg.version ?? '0.0.0'
    } catch {
      return '0.0.0'
    }
  }

  private getActivePluginIds(): string[] {
    // 暂时返回空列表
    return []
  }

}

// ============================================
// 工厂函数
// ============================================

export function createAdminWsHandler(logFileOptions?: HiveLoggerOptions): AdminWsHandler {
  return new AdminWsHandler(logFileOptions)
}

/**
 * @bundy-lmw/hive-plugin-feishu - FeishuPlugin
 *
 * 飞书插件主类，实现 IPlugin 接口。
 */

import type {
  IPlugin,
  IChannel,
  PluginMetadata,
  PluginContext,
  ILogger,
  ChannelMessage,
} from '@bundy-lmw/hive-core'
import { FeishuChannel } from './channel.js'
import type { FeishuPluginConfig, FeishuAppConfig, IFeishuChannel } from './types.js'

/**
 * 飞书插件
 */
export class FeishuPlugin implements IPlugin {
  readonly metadata: PluginMetadata = {
    id: 'feishu',
    name: 'Feishu Plugin',
    version: '1.0.0',
    description: '飞书消息通道插件，支持接收和发送飞书消息',
    author: 'Hive Team',
  }

  private messageHandler: ((message: ChannelMessage) => void) | null = null
  private logger: ILogger | null = null
  private channels: Map<string, IFeishuChannel> = new Map()
  private config: FeishuPluginConfig | any = null
  private workspaceDir: string | null = null

  constructor(config: Record<string, unknown>) {
    this.config = this.validateConfig(config)
  }

  /**
   * 初始化插件
   */
  async initialize(messageHandler: (message: ChannelMessage) => void, logger: ILogger, registerChannel: (channel: IChannel) => void, context?: PluginContext): Promise<void> {
    this.messageHandler = messageHandler
    this.logger = logger
    this.workspaceDir = context?.workspaceDir ?? null

    logger.info(`[FeishuPlugin] Initializing with ${this.config.apps.length} app(s)`)

    for (const appConfig of this.config.apps) {
      const channel = new FeishuChannel(appConfig, messageHandler, logger, this.workspaceDir)
      this.channels.set(channel.id, channel)
      registerChannel(channel)
    }

    logger.info(`[FeishuPlugin] Initialized successfully`)
  }

  /**
   * 激活插件
   */
  async activate(): Promise<void> {
    if (!this.logger) {
      throw new Error('Plugin not initialized')
    }

    this.logger.info(`[FeishuPlugin] Activating...`)

    for (const channel of this.channels.values()) {
      await channel.start()
    }

    this.logger.info(`[FeishuPlugin] Activated successfully`)
  }

  /**
   * 停用插件
   */
  async deactivate(): Promise<void> {
    if (!this.logger) {
      return
    }

    this.logger.info(`[FeishuPlugin] Deactivating...`)

    for (const channel of this.channels.values()) {
      await channel.stop()
    }

    this.channels.clear()

    this.logger.info(`[FeishuPlugin] Deactivated successfully`)
  }

  /**
   * 销毁插件
   */
  async destroy(): Promise<void> {
    await this.deactivate()
    this.messageHandler = null
    this.logger = null
    this.config = null
  }

  /**
   * 获取通道列表
   */
  getChannels(): IChannel[] {
    return Array.from(this.channels.values())
  }

  /**
   * 获取指定应用的通道
   */
  getChannelByAppId(appId: string): IFeishuChannel | undefined {
    return this.channels.get(`feishu:${appId}`)
  }

  /**
   * 验证配置
   */
  private validateConfig(config: Record<string, unknown>): FeishuPluginConfig {
    if (!config.apps || !Array.isArray(config.apps)) {
      throw new Error('FeishuPlugin config requires "apps" array')
    }

    if (config.apps.length === 0) {
      throw new Error('FeishuPlugin config requires at least one app')
    }

    for (const app of config.apps) {
      const appConfig = app as Record<string, unknown>
      if (appConfig.appId !== undefined && typeof appConfig.appId !== 'string') {
        throw new Error('Each app config requires "appId" string')
      }
      if (appConfig.appSecret !== undefined && typeof appConfig.appSecret !== 'string') {
        throw new Error('Each app config requires "appSecret" string')
      }
    }

    return config as unknown as FeishuPluginConfig
  }
}

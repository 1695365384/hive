/**
 * @hive/plugin-feishu - FeishuPlugin
 *
 * 飞书插件主类，实现 IPlugin 接口。
 */

import type {
  IPlugin,
  IChannel,
  PluginMetadata,
  PluginContext,
  IMessageBus,
  ILogger,
} from '@hive/core'
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

  private context: PluginContext | null = null
  private channels: Map<string, IFeishuChannel> = new Map()
  private config: FeishuPluginConfig | null = null

  /**
   * 初始化插件
   */
  async initialize(context: PluginContext): Promise<void> {
    this.context = context
    this.config = this.validateConfig(context.config)

    context.logger.info(`[FeishuPlugin] Initializing with ${this.config.apps.length} app(s)`)

    // 创建通道实例
    for (const appConfig of this.config.apps) {
      const channel = new FeishuChannel(appConfig, context.messageBus, context.logger)
      this.channels.set(channel.id, channel)
      context.registerChannel(channel)
    }

    context.logger.info(`[FeishuPlugin] Initialized successfully`)
  }

  /**
   * 激活插件
   */
  async activate(): Promise<void> {
    if (!this.context) {
      throw new Error('Plugin not initialized')
    }

    this.context.logger.info(`[FeishuPlugin] Activating...`)

    // 订阅消息事件，用于自动回复等场景
    for (const [channelId, channel] of this.channels) {
      this.context.messageBus.subscribe(
        `channel:${channelId}:message:received`,
        this.handleMessage.bind(this)
      )
    }

    this.context.logger.info(`[FeishuPlugin] Activated successfully`)
  }

  /**
   * 停用插件
   */
  async deactivate(): Promise<void> {
    if (!this.context) {
      return
    }

    this.context.logger.info(`[FeishuPlugin] Deactivating...`)

    // 清理资源
    this.channels.clear()

    this.context.logger.info(`[FeishuPlugin] Deactivated successfully`)
  }

  /**
   * 销毁插件
   */
  async destroy(): Promise<void> {
    await this.deactivate()
    this.context = null
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
   * 处理消息事件
   */
  private handleMessage(message: unknown): void {
    if (!this.context) return

    this.context.logger.debug(`[FeishuPlugin] Processing message:`, message)

    // 发布到通用消息通道，供 Agent 处理
    this.context.messageBus.emit('message:received', message)
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
      // 允许空字符串（占位符），只检查类型
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

/**
 * 创建飞书插件实例
 */
export function createFeishuPlugin(): FeishuPlugin {
  return new FeishuPlugin()
}

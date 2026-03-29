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
  ChannelMessageType,
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

    // 启动所有通道的 WebSocket 连接
    for (const channel of this.channels.values()) {
      await channel.start()
    }

    // 订阅消息事件，转发到通用消息通道
    for (const [channelId] of this.channels) {
      this.context.messageBus.subscribe(
        `channel:${channelId}:message:received`,
        this.handleMessage.bind(this)
      )
    }

    // 订阅 Agent 响应，回复到飞书
    this.context.messageBus.subscribe(
      'message:response',
      this.handleResponse.bind(this)
    )

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

    // 关闭所有通道的 WebSocket 连接
    for (const channel of this.channels.values()) {
      await channel.stop()
    }

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

    const data = (message as { payload: unknown }).payload

    // 发布到通用消息通道，供 Agent 处理
    this.context.messageBus.publish('message:received', data)
  }

  /**
   * 处理 Agent 响应，回复到飞书
   */
  private async handleResponse(message: unknown): Promise<void> {
    if (!this.context) return

    const { channelId, chatId, content, type } = (message as { payload: unknown }).payload as {
      channelId?: string
      chatId?: string
      replyTo?: string
      content: string
      type?: string
    }

    // 根据 channelId 找到对应通道
    const channel = channelId ? this.channels.get(channelId) : undefined
    if (!channel) {
      this.context.logger.warn(`[FeishuPlugin] No channel found for response, channelId=${channelId}`)
      return
    }

    if (!chatId) {
      this.context.logger.warn(`[FeishuPlugin] No chatId in response, skipping`)
      return
    }

    try {
      this.context.logger.info(`[FeishuPlugin] Sending reply to chat ${chatId}`)
      await channel.send({ to: chatId, content, type: (type || 'markdown') as ChannelMessageType })
    } catch (error) {
      this.context.logger.error(`[FeishuPlugin] Failed to send reply:`, error)
    }
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

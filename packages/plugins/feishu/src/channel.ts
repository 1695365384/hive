/**
 * @hive/plugin-feishu - FeishuChannel
 *
 * 飞书通道实现，基于 @larksuiteoapi/node-sdk。
 */

import * as lark from '@larksuiteoapi/node-sdk'
import crypto from 'crypto'
import type {
  IChannel,
  ChannelCapabilities,
  ChannelSendOptions,
  ChannelSendResult,
  IMessageBus,
  ILogger,
  ChannelMessage,
} from '@hive/core'
import type {
  FeishuAppConfig,
  FeishuChallengeRequest,
  FeishuChallengeResponse,
  FeishuMessageEvent,
  IFeishuChannel,
} from './types.js'

/**
 * 飞书通道实现
 */
export class FeishuChannel implements IFeishuChannel {
  readonly id: string
  readonly name: string
  readonly type = 'feishu'
  readonly appId: string

  readonly capabilities: ChannelCapabilities = {
    sendText: true,
    sendImage: true,
    sendFile: true,
    sendCard: true,
    sendMarkdown: true,
    replyMessage: true,
    editMessage: false,
    deleteMessage: false,
  }

  private client: lark.Client
  private messageBus: IMessageBus
  private logger: ILogger
  private config: FeishuAppConfig

  constructor(config: FeishuAppConfig, messageBus: IMessageBus, logger: ILogger) {
    this.appId = config.appId
    this.id = `feishu:${config.appId}`
    this.name = `Feishu Channel (${config.appId.slice(0, 8)})`
    this.config = config
    this.messageBus = messageBus
    this.logger = logger

    this.client = new lark.Client({
      appId: config.appId,
      appSecret: config.appSecret,
      appType: lark.AppType.SelfBuild,
      domain: config.domain || lark.Domain.Feishu,
    })

    this.logger.info(`[FeishuChannel] Created channel for app ${this.appId}`)
  }

  /**
   * 获取飞书 Client
   */
  getClient(): lark.Client {
    return this.client
  }

  /**
   * 发送消息
   */
  async send(options: ChannelSendOptions): Promise<ChannelSendResult> {
    try {
      const response = await this.client.im.v1.message.create({
        params: {
          receive_id_type: 'chat_id',
        },
        data: {
          receive_id: options.to,
          msg_type: this.mapMessageType(options.type || 'text'),
          content: this.buildContent(options),
        },
      })

      if (response.code !== 0) {
        return {
          success: false,
          error: `Feishu API error: ${response.msg}`,
        }
      }

      return {
        success: true,
        messageId: response.data?.message_id,
      }
    } catch (error) {
      this.logger.error(`[FeishuChannel] Send message failed:`, error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * 回复消息
   */
  async reply(messageId: string, options: ChannelSendOptions): Promise<ChannelSendResult> {
    try {
      const response = await this.client.im.v1.message.reply({
        path: {
          message_id: messageId,
        },
        data: {
          content: this.buildContent(options),
          msg_type: this.mapMessageType(options.type || 'text'),
        },
      })

      if (response.code !== 0) {
        return {
          success: false,
          error: `Feishu API error: ${response.msg}`,
        }
      }

      return {
        success: true,
        messageId: response.data?.message_id,
      }
    } catch (error) {
      this.logger.error(`[FeishuChannel] Reply message failed:`, error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * 处理 Webhook 请求
   */
  async handleWebhook(
    body: unknown,
    signature: string,
    timestamp: string,
    nonce: string
  ): Promise<unknown> {
    // 验证签名
    if (!this.verifySignature(signature, timestamp, nonce, body)) {
      this.logger.warn(`[FeishuChannel] Invalid signature`)
      throw new Error('Invalid signature')
    }

    // 处理 Challenge
    const challengeReq = body as FeishuChallengeRequest
    if (challengeReq.type === 'url_verification') {
      this.logger.info(`[FeishuChannel] Challenge received`)
      return { challenge: challengeReq.challenge } as FeishuChallengeResponse
    }

    // 处理消息事件
    const event = body as FeishuMessageEvent
    if (event.header?.event_type?.startsWith('im.message.')) {
      await this.handleMessageEvent(event)
      return { code: 0, msg: 'success' }
    }

    this.logger.debug(`[FeishuChannel] Ignoring event: ${event.header?.event_type}`)
    return { code: 0, msg: 'ignored' }
  }

  /**
   * 处理消息事件
   */
  private async handleMessageEvent(event: FeishuMessageEvent): Promise<void> {
    const message = this.convertMessage(event)

    if (message) {
      this.logger.info(
        `[FeishuChannel] Received message from ${message.from.id}: ${message.content.slice(0, 50)}...`
      )

      // 发布到消息总线
      this.messageBus.emit(`channel:${this.id}:message:received`, message)
    }
  }

  /**
   * 转换飞书消息为通用格式
   */
  private convertMessage(event: FeishuMessageEvent): ChannelMessage | null {
    const { sender, message: msg } = event.event

    // 解析消息内容
    let content = ''
    try {
      if (msg.message_type === 'text') {
        const textContent = JSON.parse(msg.content) as { text: string }
        content = textContent.text
      } else {
        content = `[${msg.message_type}]`
      }
    } catch {
      content = msg.content
    }

    return {
      id: msg.message_id,
      content,
      type: this.mapToMessageType(msg.message_type),
      from: {
        id: sender.sender_id.open_id || sender.sender_id.user_id,
        type: 'user',
      },
      to: {
        id: msg.chat_id,
        type: 'group',
      },
      timestamp: parseInt(msg.create_time, 10) * 1000,
      raw: event,
    }
  }

  /**
   * 验证飞书签名
   */
  private verifySignature(
    signature: string,
    timestamp: string,
    nonce: string,
    body: unknown
  ): boolean {
    if (!this.config.encryptKey) {
      // 如果没有配置加密密钥，跳过验证（仅用于开发环境）
      this.logger.warn(`[FeishuChannel] Skipping signature verification (no encryptKey)`)
      return true
    }

    const token = this.config.verificationToken || ''
    const bodyStr = JSON.stringify(body)

    // 构建签名字符串
    const signBase = timestamp + nonce + token + bodyStr
    const hash = crypto.createHash('sha256').update(signBase).digest('hex')

    return hash === signature
  }

  /**
   * 构建消息内容
   */
  private buildContent(options: ChannelSendOptions): string {
    switch (options.type) {
      case 'card':
        return options.content // 假设已经是 JSON 字符串
      case 'markdown':
        return JSON.stringify({ zh_cn: { content: options.content } })
      case 'text':
      default:
        return JSON.stringify({ text: options.content })
    }
  }

  /**
   * 映射消息类型
   */
  private mapMessageType(type: string): string {
    const typeMap: Record<string, string> = {
      text: 'text',
      card: 'interactive',
      markdown: 'post',
      image: 'image',
      file: 'file',
    }
    return typeMap[type] || 'text'
  }

  /**
   * 映射到通用消息类型
   */
  private mapToMessageType(feishuType: string): ChannelMessage['type'] {
    const typeMap: Record<string, ChannelMessage['type']> = {
      text: 'text',
      post: 'markdown',
      image: 'image',
      file: 'file',
      interactive: 'card',
      audio: 'file',
      media: 'file',
      sticker: 'image',
    }
    return typeMap[feishuType] || 'text'
  }
}

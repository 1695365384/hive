/**
 * @hive/plugin-feishu - FeishuChannel
 *
 * 飞书通道实现，基于 @larksuiteoapi/node-sdk。
 * 支持 WebSocket 长连接模式（推荐）和 Webhook 模式（备用）。
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
 * 飞书 WebSocket 事件数据结构
 * 使用 any 避免 SDK 内部类型与自定义类型不兼容
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FeishuWSEventData = any

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

  /** HTTP API 客户端，用于发送消息 */
  private client: lark.Client
  /** WebSocket 客户端，用于接收事件 */
  private wsClient: lark.WSClient
  /** 事件分发器 */
  private dispatcher: lark.EventDispatcher
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

    // HTTP API 客户端（发消息用）
    this.client = new lark.Client({
      appId: config.appId,
      appSecret: config.appSecret,
      appType: lark.AppType.SelfBuild,
      domain: config.domain || lark.Domain.Feishu,
    })

    // WebSocket 客户端（接收事件用）
    this.wsClient = new lark.WSClient({
      appId: config.appId,
      appSecret: config.appSecret,
      domain: config.domain || lark.Domain.Feishu,
      autoReconnect: true,
      loggerLevel: lark.LoggerLevel.info,
    })

    // 事件分发器，注册消息接收事件
    this.dispatcher = new lark.EventDispatcher({
      encryptKey: config.encryptKey,
      verificationToken: config.verificationToken,
    }).register({
      'im.message.receive_v1': async (data: FeishuWSEventData) => {
        await this.handleWSMessageEvent(data)
      },
    })

    this.logger.info(`[FeishuChannel] Created channel for app ${this.appId}`)
  }

  /**
   * 获取飞书 HTTP API Client
   */
  getClient(): lark.Client {
    return this.client
  }

  /**
   * 启动通道 — 建立 WebSocket 长连接
   */
  async start(): Promise<void> {
    this.logger.info(`[FeishuChannel] Starting WebSocket connection for app ${this.appId}...`)

    await this.wsClient.start({
      eventDispatcher: this.dispatcher,
    })

    this.logger.info(`[FeishuChannel] WebSocket connection established for app ${this.appId}`)
  }

  /**
   * 停止通道 — 关闭 WebSocket 连接
   */
  async stop(): Promise<void> {
    this.logger.info(`[FeishuChannel] Stopping WebSocket connection for app ${this.appId}...`)
    this.wsClient.close({ force: false })
    this.logger.info(`[FeishuChannel] WebSocket connection closed for app ${this.appId}`)
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
   * 处理 Webhook 请求（Webhook 模式备用）
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
      await this.handleWebhookMessageEvent(event)
      return { code: 0, msg: 'success' }
    }

    this.logger.debug(`[FeishuChannel] Ignoring event: ${event.header?.event_type}`)
    return { code: 0, msg: 'ignored' }
  }

  // ============================
  // WebSocket 事件处理
  // ============================

  /**
   * 处理 WebSocket 接收到的消息事件
   */
  private async handleWSMessageEvent(data: FeishuWSEventData): Promise<void> {
    const message = this.convertWSMessage(data)

    if (message) {
      this.logger.info(
        `[FeishuChannel] [WS] Received message from ${message.from.id}: ${message.content.slice(0, 50)}`
      )

      this.messageBus.publish(`channel:${this.id}:message:received`, message)
    }
  }

  /**
   * 转换 WebSocket 事件数据为通用消息格式
   */
  private convertWSMessage(data: FeishuWSEventData): ChannelMessage | null {
    const sender = data.sender
    const msg = data.message
    if (!sender?.sender_id || !msg?.message_id) {
      this.logger.warn(`[FeishuChannel] [WS] Invalid message data, missing sender or message_id`)
      return null
    }

    let content = ''
    try {
      if (msg.message_type === 'text' && msg.content) {
        const textContent = JSON.parse(msg.content) as { text: string }
        content = textContent.text
      } else if (msg.message_type === 'interactive' && msg.content) {
        content = this.extractCardText(msg.content)
      } else if (msg.message_type === 'post' && msg.content) {
        content = this.extractPostText(msg.content)
      } else {
        content = msg.content || `[${msg.message_type || 'unknown'}]`
      }
    } catch {
      content = msg.content || ''
    }

    return {
      id: msg.message_id,
      content,
      type: this.mapToMessageType(msg.message_type || 'text'),
      from: {
        id: sender.sender_id.open_id || sender.sender_id.user_id || '',
        type: 'user',
      },
      to: {
        id: msg.chat_id || '',
        type: 'group',
      },
      timestamp: parseInt(msg.create_time || '0', 10) * 1000,
      raw: data,
      metadata: {
        channelId: this.id,
      },
    }
  }

  // ============================
  // Webhook 事件处理（备用）
  // ============================

  /**
   * 处理 Webhook 消息事件
   */
  private async handleWebhookMessageEvent(event: FeishuMessageEvent): Promise<void> {
    const message = this.convertWebhookMessage(event)

    if (message) {
      this.logger.info(
        `[FeishuChannel] [Webhook] Received message from ${message.from.id}: ${message.content.slice(0, 50)}`
      )

      this.messageBus.publish(`channel:${this.id}:message:received`, message)
    }
  }

  /**
   * 转换 Webhook 消息为通用格式
   */
  private convertWebhookMessage(event: FeishuMessageEvent): ChannelMessage | null {
    const { sender, message: msg } = event.event

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

  // ============================
  // 消息内容提取与构建
  // ============================

  /**
   * 从飞书 interactive card JSON 中提取纯文本
   *
   * 卡片结构: { header: { title: { content } }, elements: [{ tag: "div", text: { content } }] }
   */
  private extractCardText(contentJson: string): string {
    try {
      const card = JSON.parse(contentJson)
      const parts: string[] = []

      // 提取 header title
      const titleContent = card?.header?.title?.content
      if (titleContent) parts.push(titleContent)

      // 递归提取 elements 中的文本
      const elements = card?.elements
      if (Array.isArray(elements)) {
        this.extractElementsText(elements, parts)
      }

      return parts.length > 0 ? parts.join('\n') : ''
    } catch {
      return contentJson
    }
  }

  /**
   * 递归提取 elements 数组中的文本内容
   */
  private extractElementsText(elements: unknown[], parts: string[]): void {
    for (const el of elements) {
      if (!el || typeof el !== 'object') continue
      const element = el as Record<string, unknown>

      // div / note 等容器中的 text
      if (element.text && typeof element.text === 'object') {
        const text = element.text as Record<string, unknown>
        if (typeof text.content === 'string' && text.content) {
          parts.push(text.content)
        }
      }

      // column_set 中的 columns
      if (element.columns && Array.isArray(element.columns)) {
        for (const col of element.columns) {
          if (col && typeof col === 'object') {
            const column = col as Record<string, unknown>
            if (Array.isArray(column.elements)) {
              this.extractElementsText(column.elements, parts)
            }
          }
        }
      }
    }
  }

  /**
   * 从飞书 post JSON 中提取纯文本
   *
   * Post 结构: { zh_cn: { title, content: [{ tag: "text", text: "..." }] } }
   */
  private extractPostText(contentJson: string): string {
    try {
      const post = JSON.parse(contentJson)
      const parts: string[] = []

      // 尝试提取中文内容，fallback 到英文
      const lang = post.zh_cn || post.en_us || post.ja_jp
      if (!lang) return contentJson

      if (lang.title) parts.push(lang.title)

      const content = lang.content
      if (Array.isArray(content)) {
        for (const item of content) {
          if (item.tag === 'text' && item.text) {
            parts.push(item.text)
          }
        }
      }

      return parts.length > 0 ? parts.join('\n') : ''
    } catch {
      return contentJson
    }
  }

  /**
   * 将 Markdown 文本构建为飞书 interactive card JSON
   *
   * 使用 lark_md tag 让卡片内支持 Markdown 渲染
   */
  private buildCardContent(markdownText: string): string {
    const card = {
      config: { wide_screen_mode: true },
      elements: [
        {
          tag: 'div',
          text: { tag: 'lark_md', content: markdownText },
        },
      ],
    }
    return JSON.stringify(card)
  }

  // ============================
  // 工具方法
  // ============================

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
      this.logger.warn(`[FeishuChannel] Skipping signature verification (no encryptKey)`)
      return true
    }

    const token = this.config.verificationToken || ''
    const bodyStr = JSON.stringify(body)

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
      case 'markdown':
        // interactive card + lark_md 才能渲染 Markdown
        return this.buildCardContent(options.content)
      case 'text':
      default:
        return JSON.stringify({ text: options.content })
    }
  }

  /**
   * 映射消息类型（发送时）
   */
  private mapMessageType(type: string): string {
    const typeMap: Record<string, string> = {
      text: 'text',
      card: 'interactive',
      markdown: 'interactive',
      image: 'image',
      file: 'file',
    }
    return typeMap[type] || 'interactive'
  }

  /**
   * 映射到通用消息类型（接收时）
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

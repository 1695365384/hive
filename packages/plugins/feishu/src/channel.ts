/**
 * @bundy-lmw/hive-plugin-feishu - FeishuChannel
 *
 * 飞书通道实现，基于 @larksuiteoapi/node-sdk。
 * 支持 WebSocket 长连接模式（推荐）和 Webhook 模式（备用）。
 */

import * as lark from '@larksuiteoapi/node-sdk'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import type {
  IChannel,
  ChannelCapabilities,
  ChannelSendOptions,
  ChannelSendResult,
  IMessageBus,
  ILogger,
  ChannelMessage,
} from '@bundy-lmw/hive-core'
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
  /** 文件接收存储目录 */
  private readonly receivedDir: string

  constructor(config: FeishuAppConfig, messageBus: IMessageBus, logger: ILogger, workspaceDir?: string | null) {
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

    // 文件接收目录
    this.receivedDir = workspaceDir
      ? path.join(workspaceDir, 'files', 'feishu', 'received')
      : path.join(process.cwd(), 'files', 'feishu', 'received')
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
      const filePath = options.filePath ?? (options.metadata?.filePath as string | undefined)
      const msgType = this.resolveSendType(options.type, filePath)

      // 文件/图片：先上传再发送
      if (msgType === 'file' && filePath) {
        return this.sendFileMessage(options.to, filePath)
      }
      if (msgType === 'image' && filePath) {
        return this.sendImageMessage(options.to, filePath)
      }

      const response = await this.client.im.v1.message.create({
        params: {
          receive_id_type: 'chat_id',
        },
        data: {
          receive_id: options.to,
          msg_type: this.mapMessageType(msgType),
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
      const filePath = options.filePath ?? (options.metadata?.filePath as string | undefined)
      const msgType = this.resolveSendType(options.type, filePath)

      // 文件/图片：先上传再回复
      if (msgType === 'file' && filePath) {
        return this.replyFileMessage(messageId, filePath)
      }
      if (msgType === 'image' && filePath) {
        return this.replyImageMessage(messageId, filePath)
      }

      const response = await this.client.im.v1.message.reply({
        path: {
          message_id: messageId,
        },
        data: {
          content: this.buildContent(options),
          msg_type: this.mapMessageType(msgType),
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
    const message = await this.convertWSMessage(data)

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
  private async convertWSMessage(data: FeishuWSEventData): Promise<ChannelMessage | null> {
    const sender = data.sender
    const msg = data.message
    if (!sender?.sender_id || !msg?.message_id) {
      this.logger.warn(`[FeishuChannel] [WS] Invalid message data, missing sender or message_id`)
      return null
    }

    let content = ''
    const msgType = msg.message_type || 'text'
    try {
      if (msgType === 'text' && msg.content) {
        const textContent = JSON.parse(msg.content) as { text: string }
        content = textContent.text
      } else if (msgType === 'interactive' && msg.content) {
        content = this.extractCardText(msg.content)
      } else if (msgType === 'post' && msg.content) {
        content = this.extractPostText(msg.content)
      } else if (msgType === 'image' && msg.content) {
        content = await this.handleReceiveImage(msg.content)
      } else if ((msgType === 'file' || msgType === 'audio' || msgType === 'media') && msg.content) {
        content = await this.handleReceiveFile(msg.content)
      } else {
        content = msg.content || `[${msgType}]`
      }
    } catch {
      content = msg.content || ''
    }

    return {
      id: msg.message_id,
      content,
      type: this.mapToMessageType(msgType),
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
    const message = await this.convertWebhookMessage(event)

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
  private async convertWebhookMessage(event: FeishuMessageEvent): Promise<ChannelMessage | null> {
    const { sender, message: msg } = event.event

    let content = ''
    const msgType = msg.message_type || 'text'
    try {
      if (msgType === 'text') {
        const textContent = JSON.parse(msg.content) as { text: string }
        content = textContent.text
      } else if (msgType === 'image' && msg.content) {
        content = await this.handleReceiveImage(msg.content)
      } else if ((msgType === 'file' || msgType === 'audio' || msgType === 'media') && msg.content) {
        content = await this.handleReceiveFile(msg.content)
      } else {
        content = `[${msgType}]`
      }
    } catch {
      content = msg.content
    }

    return {
      id: msg.message_id,
      content,
      type: this.mapToMessageType(msgType),
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
   * 图片扩展名集合
   */
  private static readonly IMAGE_EXTENSIONS = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg',
  ])

  /**
   * 根据文件扩展名推断发送类型
   */
  private resolveSendType(type: string | undefined, filePath?: string): string {
    if (type === 'file' || type === 'image') return type
    if (filePath) {
      const ext = path.extname(filePath).toLowerCase()
      if (FeishuChannel.IMAGE_EXTENSIONS.has(ext)) return 'image'
    }
    return type || 'text'
  }

  /**
   * 上传文件到飞书
   *
   * @returns file_key
   */
  private async uploadFile(filePath: string): Promise<string> {
    const absolutePath = path.resolve(filePath)
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`File not found: ${absolutePath}`)
    }

    const ext = path.extname(absolutePath).slice(1).toLowerCase() || 'bin'
    const fileName = path.basename(absolutePath)

    const response = await this.client.im.file.create({
      data: {
        file_type: ext as 'pdf' | 'doc' | 'xls' | 'ppt' | 'mp4' | 'opus' | 'stream',
        file_name: fileName,
        file: fs.readFileSync(absolutePath),
      },
    })

    if (!response || !response.file_key) {
      throw new Error('Upload file failed: no file_key returned')
    }

    return response.file_key
  }

  /**
   * 上传图片到飞书
   *
   * @returns image_key
   */
  private async uploadImage(filePath: string): Promise<string> {
    const absolutePath = path.resolve(filePath)
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Image not found: ${absolutePath}`)
    }

    const response = await this.client.im.image.create({
      data: {
        image_type: 'message',
        image: fs.readFileSync(absolutePath),
      },
    })

    if (!response || !response.image_key) {
      throw new Error('Upload image failed: no image_key returned')
    }

    return response.image_key
  }

  /**
   * 下载文件并保存到本地
   *
   * @returns 本地文件路径，失败时返回 null
   */
  private async downloadFile(fileKey: string, fileName: string): Promise<string | null> {
    try {
      fs.mkdirSync(this.receivedDir, { recursive: true })
      const date = new Date().toISOString().slice(0, 10)
      const ext = path.extname(fileName) || '.bin'
      const localPath = path.join(this.receivedDir, `${date}_${fileKey}${ext}`)

      const resp = await this.client.im.file.get({
        path: { file_key: fileKey },
      })
      await resp.writeFile(localPath)

      this.logger.info(`[FeishuChannel] File downloaded: ${localPath}`)
      return localPath
    } catch (error) {
      this.logger.error(`[FeishuChannel] Download file failed (key=${fileKey}):`, error)
      return null
    }
  }

  /**
   * 下载图片并保存到本地
   *
   * @returns 本地文件路径，失败时返回 null
   */
  private async downloadImage(imageKey: string): Promise<string | null> {
    try {
      fs.mkdirSync(this.receivedDir, { recursive: true })
      const date = new Date().toISOString().slice(0, 10)
      const localPath = path.join(this.receivedDir, `${date}_${imageKey}.png`)

      const resp = await this.client.im.image.get({
        path: { image_key: imageKey },
      })
      await resp.writeFile(localPath)

      this.logger.info(`[FeishuChannel] Image downloaded: ${localPath}`)
      return localPath
    } catch (error) {
      this.logger.error(`[FeishuChannel] Download image failed (key=${imageKey}):`, error)
      return null
    }
  }

  /**
   * 发送文件消息（上传 + 发送）
   */
  private async sendFileMessage(chatId: string, filePath: string): Promise<ChannelSendResult> {
    try {
      const fileKey = await this.uploadFile(filePath)
      const response = await this.client.im.v1.message.create({
        params: { receive_id_type: 'chat_id' },
        data: {
          receive_id: chatId,
          msg_type: 'file',
          content: JSON.stringify({ file_key: fileKey }),
        },
      })

      if (response.code !== 0) {
        return { success: false, error: `Feishu API error: ${response.msg}` }
      }

      return { success: true, messageId: response.data?.message_id }
    } catch (error) {
      this.logger.error(`[FeishuChannel] Send file message failed:`, error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  /**
   * 发送图片消息（上传 + 发送）
   */
  private async sendImageMessage(chatId: string, filePath: string): Promise<ChannelSendResult> {
    try {
      const imageKey = await this.uploadImage(filePath)
      const response = await this.client.im.v1.message.create({
        params: { receive_id_type: 'chat_id' },
        data: {
          receive_id: chatId,
          msg_type: 'image',
          content: JSON.stringify({ image_key: imageKey }),
        },
      })

      if (response.code !== 0) {
        return { success: false, error: `Feishu API error: ${response.msg}` }
      }

      return { success: true, messageId: response.data?.message_id }
    } catch (error) {
      this.logger.error(`[FeishuChannel] Send image message failed:`, error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  /**
   * 回复文件消息（上传 + 回复）
   */
  private async replyFileMessage(messageId: string, filePath: string): Promise<ChannelSendResult> {
    try {
      const fileKey = await this.uploadFile(filePath)
      const response = await this.client.im.v1.message.reply({
        path: { message_id: messageId },
        data: {
          msg_type: 'file',
          content: JSON.stringify({ file_key: fileKey }),
        },
      })

      if (response.code !== 0) {
        return { success: false, error: `Feishu API error: ${response.msg}` }
      }

      return { success: true, messageId: response.data?.message_id }
    } catch (error) {
      this.logger.error(`[FeishuChannel] Reply file message failed:`, error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  /**
   * 回复图片消息（上传 + 回复）
   */
  private async replyImageMessage(messageId: string, filePath: string): Promise<ChannelSendResult> {
    try {
      const imageKey = await this.uploadImage(filePath)
      const response = await this.client.im.v1.message.reply({
        path: { message_id: messageId },
        data: {
          msg_type: 'image',
          content: JSON.stringify({ image_key: imageKey }),
        },
      })

      if (response.code !== 0) {
        return { success: false, error: `Feishu API error: ${response.msg}` }
      }

      return { success: true, messageId: response.data?.message_id }
    } catch (error) {
      this.logger.error(`[FeishuChannel] Reply image message failed:`, error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
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
   * 处理接收到的图片消息，下载并返回本地路径
   */
  private async handleReceiveImage(contentJson: string): Promise<string> {
    try {
      const parsed = JSON.parse(contentJson) as { image_key?: string }
      const imageKey = parsed.image_key
      if (!imageKey) return contentJson

      const localPath = await this.downloadImage(imageKey)
      return localPath ?? `[image: ${imageKey}]`
    } catch {
      return contentJson
    }
  }

  /**
   * 处理接收到的文件消息，下载并返回本地路径
   */
  private async handleReceiveFile(contentJson: string): Promise<string> {
    try {
      const parsed = JSON.parse(contentJson) as { file_key?: string; file_name?: string }
      const fileKey = parsed.file_key
      const fileName = parsed.file_name ?? 'unknown'
      if (!fileKey) return contentJson

      const localPath = await this.downloadFile(fileKey, fileName)
      return localPath ?? `[file: ${fileName}]`
    } catch {
      return contentJson
    }
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

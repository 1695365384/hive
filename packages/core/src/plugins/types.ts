/**
 * Hive Plugin System - Types
 *
 * 定义插件系统的核心接口。
 */

// ============================================
// 消息类型
// ============================================

/**
 * 通道消息格式
 *
 * 用于通道插件与系统之间的消息传递。
 */
export interface ChannelMessage {
  /** 消息 ID */
  id: string
  /** 消息内容 */
  content: string
  /** 消息类型 */
  type: ChannelMessageType
  /** 发送者信息 */
  from: ChannelMessageSender
  /** 目标信息（群聊时使用） */
  to?: ChannelMessageRecipient
  /** 时间戳 */
  timestamp: number
  /** 原始消息数据（平台特定） */
  raw?: unknown
  /** 元数据 */
  metadata?: Record<string, unknown>
}

export type ChannelMessageType = 'text' | 'image' | 'file' | 'card' | 'markdown' | 'mixed'

export interface ChannelMessageSender {
  /** 发送者 ID */
  id: string
  /** 发送者名称 */
  name?: string
  /** 发送者类型 */
  type?: 'user' | 'bot' | 'system'
}

export interface ChannelMessageRecipient {
  /** 接收者 ID（群聊 ID 或用户 ID） */
  id: string
  /** 接收者类型 */
  type: 'user' | 'group' | 'channel'
}

/**
 * 发送消息选项
 */
export interface ChannelSendOptions {
  /** 消息内容 */
  content: string
  /** 消息类型 */
  type?: ChannelMessageType
  /** 目标 ID（用户 ID 或群聊 ID） */
  to: string
  /** 回复的消息 ID */
  replyTo?: string
  /** 元数据 */
  metadata?: Record<string, unknown>
}

/**
 * 发送消息结果
 */
export interface ChannelSendResult {
  /** 是否成功 */
  success: boolean
  /** 消息 ID（成功时） */
  messageId?: string
  /** 错误信息（失败时） */
  error?: string
}

// ============================================
// 通道接口
// ============================================

/**
 * 通道能力标志
 */
export interface ChannelCapabilities {
  /** 支持发送文本 */
  sendText: boolean
  /** 支持发送图片 */
  sendImage: boolean
  /** 支持发送文件 */
  sendFile: boolean
  /** 支持发送卡片 */
  sendCard: boolean
  /** 支持发送 Markdown */
  sendMarkdown: boolean
  /** 支持回复消息 */
  replyMessage: boolean
  /** 支持编辑消息 */
  editMessage: boolean
  /** 支持删除消息 */
  deleteMessage: boolean
}

/**
 * Webhook 处理器接口
 *
 * 支持 webhook 回调的通道可实现此接口。
 */
export interface IWebhookHandler {
  /**
   * 处理 webhook 回调
   */
  handleWebhook(body: unknown, signature?: string, timestamp?: string, nonce?: string): Promise<unknown>
}

/**
 * 通道接口
 *
 * 所有消息平台通道必须实现此接口。
 */
export interface IChannel {
  /** 通道唯一标识 */
  readonly id: string

  /** 通道名称 */
  readonly name: string

  /** 通道类型（如 'feishu', 'wechat', 'discord'） */
  readonly type: string

  /** 通道能力 */
  readonly capabilities: ChannelCapabilities

  /**
   * 发送消息
   */
  send(options: ChannelSendOptions): Promise<ChannelSendResult>

  /**
   * 回复消息
   */
  reply?(messageId: string, options: ChannelSendOptions): Promise<ChannelSendResult>

  /**
   * 启动通道（开始接收消息）
   */
  start?(): Promise<void>

  /**
   * 停止通道
   */
  stop?(): Promise<void>
}

// ============================================
// 插件上下文
// ============================================

/**
 * 消息总线接口
 */
export interface IMessageBus {
  subscribe(topic: string, handler: (message: unknown) => void | Promise<void>): string
  unsubscribe(id: string): void
  publish(topic: string, message: unknown): Promise<string>
  emit(event: string, data: unknown): void
}

// Import ILogger for local use and re-export
import { type ILogger, noopLogger } from '../types/logger.js'
export { type ILogger, noopLogger }

// ============================================
// 插件接口
// ============================================

/**
 * 插件元数据
 */
export interface PluginMetadata {
  /** 插件 ID */
  id: string
  /** 插件名称 */
  name: string
  /** 插件版本 */
  version: string
  /** 插件描述 */
  description?: string
  /** 插件作者 */
  author?: string
}

/**
 * 插件构造函数签名
 *
 * 所有插件必须在构造函数中接收配置。
 */
export interface IPluginConstructor {
  new (config: Record<string, unknown>): IPlugin
}

/**
 * 插件接口
 *
 * 所有 Hive 插件必须实现此接口。
 */
export interface IPlugin {
  /** 插件元数据 */
  readonly metadata: PluginMetadata

  /**
   * 初始化插件
   *
   * 在此阶段进行配置验证和资源准备。
   */
  initialize(messageBus: IMessageBus, logger: ILogger, registerChannel: (channel: IChannel) => void): Promise<void>

  /**
   * 激活插件
   *
   * 在此阶段启动通道、注册事件处理器等。
   */
  activate(): Promise<void>

  /**
   * 停用插件
   *
   * 在此阶段停止通道、清理资源。
   */
  deactivate(): Promise<void>

  /**
   * 销毁插件
   *
   * 完全清理插件状态。
   */
  destroy?(): Promise<void>

  /**
   * 获取插件提供的通道
   */
  getChannels(): IChannel[]
}

// ============================================
// 插件加载器
// ============================================

/**
 * 插件加载选项
 */
export interface PluginLoadOptions {
  /** 插件模块名或路径 */
  name: string
  /** 插件配置 */
  config?: Record<string, unknown>
}

/**
 * 插件加载器接口
 */
export interface IPluginLoader {
  /**
   * 加载插件
   */
  load(options: PluginLoadOptions): Promise<IPlugin>

  /**
   * 加载所有配置的插件
   */
  loadAll(configs: PluginLoadOptions[]): Promise<IPlugin[]>
}

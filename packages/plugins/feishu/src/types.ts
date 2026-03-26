/**
 * @hive/plugin-feishu - Types
 *
 * 飞书插件特定类型定义。
 */

import type {
  IChannel,
  ChannelCapabilities,
  ChannelMessage,
  ChannelSendOptions,
  ChannelSendResult,
} from '@hive/core'

// ============================================
// 飞书配置
// ============================================

/**
 * 飞书应用配置
 */
export interface FeishuAppConfig {
  /** 飞书应用 ID */
  appId: string
  /** 飞书应用 Secret */
  appSecret: string
  /** 加密密钥（用于事件回调验证） */
  encryptKey?: string
  /** 验证令牌（用于事件回调验证） */
  verificationToken?: string
  /** 自定义飞书域名（私有部署时使用） */
  domain?: string
}

/**
 * 飞书插件配置
 */
export interface FeishuPluginConfig {
  /** 飞书应用配置列表（支持多租户） */
  apps: FeishuAppConfig[]
}

// ============================================
// 飞书事件
// ============================================

/**
 * 飞书事件头
 */
export interface FeishuEventHeader {
  /** 事件 ID */
  event_id: string
  /** 事件类型 */
  event_type: string
  /** 事件创建时间 */
  create_time: string
  /** 令牌 */
  token: string
  /** 应用 ID */
  app_id: string
  /** 租户 Key */
  tenant_key: string
  /** 租户类型 */
  ts: string
}

/**
 * 飞书消息事件
 */
export interface FeishuMessageEvent {
  /** 事件头 */
  header: FeishuEventHeader
  /** 事件体 */
  event: {
    /** 发送者信息 */
    sender: {
      sender_id: {
        union_id: string
        user_id: string
        open_id: string
      }
      sender_type: string
      tenant_key: string
    }
    /** 消息内容 */
    message: {
      message_id: string
      root_id: string
      parent_id: string
      create_time: string
      chat_id: string
      message_type: string
      content: string
      mentions?: Array<{
        key: string
        id: {
          union_id: string
          user_id: string
          open_id: string
        }
        name: string
        tenant_key: string
      }>
    }
  }
}

/**
 * 飞书 Challenge 请求
 */
export interface FeishuChallengeRequest {
  /** Challenge */
  challenge: string
  /** 令牌 */
  token: string
  /** 类型 */
  type: string
}

/**
 * 飞书 Challenge 响应
 */
export interface FeishuChallengeResponse {
  /** Challenge */
  challenge: string
}

// ============================================
// 飞书消息类型
// ============================================

/**
 * 飞书文本消息内容
 */
export interface FeishuTextContent {
  text: string
}

/**
 * 飞书消息体
 */
export interface FeishuMessageBody {
  /** 接收者 ID */
  receive_id: string
  /** 接收者类型 */
  receive_id_type: 'open_id' | 'user_id' | 'union_id' | 'email' | 'chat_id'
  /** 消息类型 */
  msg_type: 'text' | 'post' | 'image' | 'file' | 'audio' | 'media' | 'sticker' | 'interactive'
  /** 消息内容 */
  content: string
  /** 飞书消息 ID（回复时使用） */
  uuid?: string
}

/**
 * 飞书发送消息响应
 */
export interface FeishuSendMessageResponse {
  code: number
  msg: string
  data?: {
    message_id: string
  }
}

// ============================================
// 通道接口扩展
// ============================================

/**
 * 飞书通道接口
 */
export interface IFeishuChannel extends IChannel {
  /** 应用 ID */
  readonly appId: string

  /** 处理 Webhook 请求 */
  handleWebhook(body: unknown, signature: string, timestamp: string, nonce: string): Promise<unknown>

  /** 获取飞书 Client */
  getClient(): unknown
}

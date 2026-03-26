/**
 * Feishu (Lark) Message Types
 */

export interface FeishuConfig {
  /** App ID from Feishu Open Platform */
  appId: string;
  /** App Secret from Feishu Open Platform */
  appSecret: string;
  /** Verification token for WebSocket */
  verifyToken?: string;
  /** WebSocket endpoint */
  endpoint?: string;
}

export interface FeishuMessage {
  /** Message ID */
  msgId: string;
  /** Message type */
  msgType: FeishuMessageType;
  /** Chat ID (group or user) */
  chatId: string;
  /** Message content */
  content: FeishuContent;
  /** Sender ID */
  sender?: FeishuSender;
  /** Timestamp */
  createTime?: string;
  /** Message ID for reply */
  parent_id?: string;
  /** Root ID for thread */
  root_id?: string;
}

export type FeishuMessageType =
  | 'text'
  | 'post'
  | 'image'
  | 'file'
  | 'audio'
  | 'video'
  | 'sticker'
  | 'interactive'
  | 'card';

export interface FeishuTextContent {
  text: string;
}

export interface FeishuPostContent {
  title: string;
  content: string;
}

export interface FeishuImageContent {
  image_key: string;
}

export interface FeishuFileContent {
  file_key: string;
  file_name?: string;
}

export type FeishuContent =
  | FeishuTextContent
  | FeishuPostContent
  | FeishuImageContent
  | FeishuFileContent
  | Record<string, unknown>;

export interface FeishuSender {
  /** Sender ID */
  senderId: FeishuUser | FeishuChat;
  /** Sender type */
  senderType: 'user' | 'chat';
}

export interface FeishuUser {
  openId: string;
  name?: string;
}

export interface FeishuChat {
  chatId: string;
  name?: string;
}

export interface FeishuEvent {
  /** Event type */
  type: 'message' | 'read' | 'typing';
  /** Event data */
  data: FeishuMessage;
}

export interface FeishuResponse {
  /** Message ID to respond to */
  msgId: string;
  /** Response content */
  content: FeishuContent;
}

export interface FeishuError {
  code: number;
  message: string;
}

export interface FeishuAck {
  code: number;
  msg: string;
  data?: Record<string, unknown>;
}

/**
 * SessionId — session key 编码/解码工具
 *
 * sessionId 格式: "channelId:recipientId"
 * - channelId 用于路由到正确的 Channel
 * - recipientId 用于定位具体的会话/线程
 *
 * 所有跨层使用 sessionId 的地方统一走这个工具，避免硬编码 `:` 拼接和切片。
 */

import { randomUUID } from 'node:crypto';

const SEPARATOR = ':';

/** 解析后的 sessionId 组成部分 */
export interface ParsedSessionId {
  channelId: string;
  recipientId: string;
}

/**
 * SessionId 工具类
 *
 * 用法:
 *   SessionId.create('ws-chat', threadId)  →  'ws-chat:abc-123'
 *   SessionId.parse('ws-chat:abc-123')     →  { channelId: 'ws-chat', recipientId: 'abc-123' }
 *   SessionId.recipient('ws-chat:abc-123')  →  'abc-123'
 */
export class SessionId {
  /** 构造 sessionId */
  static create(channelId: string, recipientId: string): string {
    return `${channelId}${SEPARATOR}${recipientId}`;
  }

  /** 解析 sessionId 为 channelId + recipientId */
  static parse(sessionId: string): ParsedSessionId | null {
    const idx = sessionId.indexOf(SEPARATOR);
    if (idx === -1) return null;
    return {
      channelId: sessionId.slice(0, idx),
      recipientId: sessionId.slice(idx + 1),
    };
  }

  /** 从 sessionId 提取 recipientId（= threadId 在 chat-handler 侧的含义） */
  static recipient(sessionId: string): string {
    return SessionId.parse(sessionId)?.recipientId ?? sessionId;
  }

  /** 从 sessionId 提取 channelId */
  static channel(sessionId: string): string | null {
    return SessionId.parse(sessionId)?.channelId ?? null;
  }

  /** 通过 threadId 构造 server.abort() 所需的 sessionId */
  static forAbort(threadId: string): string {
    return SessionId.create('ws-chat', threadId);
  }

  /** 生成新的 recipientId (UUID) */
  static newRecipientId(): string {
    return randomUUID();
  }
}

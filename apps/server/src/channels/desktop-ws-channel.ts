/**
 * DesktopWSChannel — Desktop 端 WebSocket 虚拟通道
 *
 * 实现 IChannel 接口，让 Agent 的 send-file 工具在 Desktop 端可用。
 * send() 方法通过 MessageBus 发布 agent:file 事件，
 * 由 ChatWsHandler 订阅并推送给前端 WebSocket。
 */

import type {
  IChannel,
  ChannelSendOptions,
  ChannelSendResult,
  ChannelCapabilities,
  IMessageBus,
} from '@bundy-lmw/hive-core';

export class DesktopWSChannel implements IChannel {
  readonly id = 'ws-chat';
  readonly name = 'Desktop WebSocket';
  readonly type = 'websocket';
  readonly capabilities: ChannelCapabilities = {
    sendText: true,
    sendImage: true,
    sendFile: true,
    sendCard: false,
    sendMarkdown: true,
    replyMessage: false,
    editMessage: false,
    deleteMessage: false,
  };

  constructor(private bus: IMessageBus) {}

  async send(options: ChannelSendOptions): Promise<ChannelSendResult> {
    const to = options.to;
    if (!to) return { success: false, error: 'No recipient ID' };

    if (options.filePath) {
      this.bus.publish('agent:file', {
        sessionId: `ws-chat:${to}`,
        threadId: to,
        filePath: options.filePath,
        content: options.content || '',
        type: options.type || 'file',
      });
      return { success: true };
    }

    // Desktop 端不需要 message:response 重复推送文本
    // 流式阶段 agent:streaming text-delta 已经完整推送了所有文本
    if (options.content) {
      return { success: true };
    }

    return { success: false, error: 'No content or filePath' };
  }
}

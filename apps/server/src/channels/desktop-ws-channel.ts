/**
 * DesktopWSChannel — Desktop 端 WebSocket 虚拟通道
 *
 * 实现 IChannel 接口，让 Agent 的 send-file 工具在 Desktop 端可用。
 * send() 方法通过 FileHandler 回调发送文件事件，
 * 由 ServerImpl 转发到已注册的 ChatWsHandler。
 */

import type {
  IChannel,
  ChannelSendOptions,
  ChannelSendResult,
  ChannelCapabilities,
  FileHandler,
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

  constructor(private onFile: FileHandler) {}

  async send(options: ChannelSendOptions): Promise<ChannelSendResult> {
    const to = options.to;
    if (!to) return { success: false, error: 'No recipient ID' };

    if (options.filePath) {
      this.onFile({
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

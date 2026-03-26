import type { BusMessage } from '@hive/orchestrator';
import type {
  FeishuMessage,
  FeishuTextContent,
  FeishuContent,
  FeishuConfig
} from './types.js';

/**
 * Message Adapter - Transforms between Feishu and internal message formats
 */
export class MessageAdapter {
  private config: FeishuConfig;

  constructor(config: FeishuConfig) {
    this.config = config;
  }

  /**
   * Transform Feishu message to internal BusMessage
   */
  transformIncoming(feishuMsg: FeishuMessage): BusMessage {
    return {
      id: feishuMsg.msgId,
      topic: `feishu.message.${feishuMsg.chatId}`,
      payload: this.extractPayload(feishuMsg),
      source: 'feishu',
      target: undefined, // Will be set by scheduler
      timestamp: Date.now(),
      meta: {
        chatId: feishuMsg.chatId,
        senderId: feishuMsg.sender?.senderId,
        senderType: feishuMsg.sender?.senderType,
        rootId: feishuMsg.root_id,
        parentId: feishuMsg.parent_id
      }
    };
  }

  /**
   * Transform internal BusMessage to Feishu message format
   */
  transformOutgoing(busMsg: BusMessage): FeishuMessage {
    const meta = busMsg.meta as {
      chatId?: string;
      rootId?: string;
    } | undefined;

    return {
      msgId: busMsg.id,
      msgType: 'text',
      chatId: meta?.chatId ?? busMsg.target ?? '',
      content: this.createFeishuContent(busMsg),
      root_id: meta?.rootId,
      createTime: new Date(busMsg.timestamp).toISOString()
    };
  }

  /**
   * Extract payload from Feishu message
   */
  private extractPayload(msg: FeishuMessage): unknown {
    const content = msg.content;

    if (this.isTextContent(content)) {
      return {
        type: 'text',
        text: content.text,
        mentions: this.extractMentions(content.text)
      };
    }

    if (this.isPostContent(content)) {
      return {
        type: 'post',
        title: content.title,
        content: content.content
      };
    }

    if (this.isImageContent(content)) {
      return {
        type: 'image',
        imageKey: content.image_key
      };
    }

    if (this.isFileContent(content)) {
      return {
        type: 'file',
        fileKey: content.file_key,
        fileName: content.file_name
      };
    }

    // Unknown content type
    return {
      type: 'unknown',
      raw: content
    };
  }

  /**
   * Create Feishu content from bus message
   */
  private createFeishuContent(msg: BusMessage): FeishuContent {
    const payload = msg.payload as { text?: string; content?: string };

    const text = payload.text ?? payload.content ?? JSON.stringify(msg.payload);

    return {
      text
    } as FeishuTextContent;
  }

  /**
   * Extract @mentions from text
   */
  private extractMentions(text: string): string[] {
    const mentions: string[] = [];
    const regex = /@([a-zA-Z0-9_-]+)/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      mentions.push(match[1]);
    }
    return mentions;
  }

  /**
   * Type guards for content types
   */
  private isTextContent(content: FeishuContent): content is FeishuTextContent {
    return 'text' in content;
  }

  private isPostContent(content: FeishuContent): content is { title: string; content: string } {
    return 'title' in content && 'content' in content;
  }

  private isImageContent(content: FeishuContent): content is { image_key: string } {
    return 'image_key' in content;
  }

  private isFileContent(content: FeishuContent): content is { file_key: string } {
    return 'file_key' in content;
  }
}

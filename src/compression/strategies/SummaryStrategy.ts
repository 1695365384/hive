/**
 * 摘要压缩策略
 *
 * 将早期消息压缩为摘要
 */

import { randomUUID } from 'crypto';
import type { Message } from '../../session/types.js';
import type { CompressionStrategy, CompressionContext, CompressionStrategyName } from '../types.js';
import { createTokenCounter } from '../TokenCounter.js';

/**
 * 摘要压缩策略实现
 */
export class SummaryStrategy implements CompressionStrategy {
  readonly name: CompressionStrategyName = 'summary';
  private readonly summaryThreshold: number;
  private readonly maxSummaryTokens: number;
  private readonly tokenCounter = createTokenCounter();

  constructor(options?: { summaryThreshold?: number; maxSummaryTokens?: number }) {
    this.summaryThreshold = options?.summaryThreshold ?? 10;
    this.maxSummaryTokens = options?.maxSummaryTokens ?? 500;
  }

  /**
   * 判断是否需要压缩
   */
  shouldCompress(context: CompressionContext): boolean {
    // 消息数超过摘要阈值时触发
    return context.messageCount >= this.summaryThreshold;
  }

  /**
   * 生成简单摘要
   *
   * 注意：这是一个简化的实现，实际应用中可能需要调用 LLM 生成摘要
   */
  private generateSimpleSummary(messages: Message[]): string {
    const userMessages = messages.filter((m) => m.role === 'user');
    const assistantMessages = messages.filter((m) => m.role === 'assistant');

    const summaryParts: string[] = ['[早期对话摘要]'];

    // 添加用户问题概要
    if (userMessages.length > 0) {
      summaryParts.push(`用户提问 ${userMessages.length} 次，涉及：`);
      const topics = userMessages
        .slice(0, 3)
        .map((m) => {
          const preview = m.content.slice(0, 50);
          return `- ${preview}${m.content.length > 50 ? '...' : ''}`;
        });
      summaryParts.push(topics.join('\n'));
    }

    // 添加助手回答概要
    if (assistantMessages.length > 0) {
      summaryParts.push(`助手回答 ${assistantMessages.length} 次`);
    }

    return summaryParts.join('\n');
  }

  /**
   * 执行压缩
   */
  async compress(
    messages: Message[],
    context: CompressionContext
  ): Promise<{ messages: Message[]; tokensSaved: number }> {
    if (messages.length < this.summaryThreshold) {
      return { messages, tokensSaved: 0 };
    }

    // 计算原始 Token 数
    const originalTokens = this.tokenCounter.countMessages(messages);

    // 分割消息：前半部分生成摘要，后半部分保留
    const summaryEndIndex = Math.floor(messages.length / 2);
    const messagesToSummarize = messages.slice(0, summaryEndIndex);
    const messagesToKeep = messages.slice(summaryEndIndex);

    // 生成摘要消息
    const summaryContent = this.generateSimpleSummary(messagesToSummarize);
    const summaryMessage: Message = {
      id: `summary_${randomUUID()}`,
      role: 'system',
      content: summaryContent,
      timestamp: new Date(),
      tokenCount: this.tokenCounter.count(summaryContent),
    };

    // 组合：摘要 + 保留的消息
    const compressedMessages = [summaryMessage, ...messagesToKeep];

    // 计算压缩后 Token 数
    const compressedTokens = this.tokenCounter.countMessages(compressedMessages);

    const tokensSaved = Math.max(0, originalTokens - compressedTokens);

    return { messages: compressedMessages, tokensSaved };
  }
}

/**
 * 创建摘要策略实例
 */
export function createSummaryStrategy(options?: {
  summaryThreshold?: number;
  maxSummaryTokens?: number;
}): SummaryStrategy {
  return new SummaryStrategy(options);
}

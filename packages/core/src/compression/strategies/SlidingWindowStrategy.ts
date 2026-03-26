/**
 * 滑动窗口压缩策略
 *
 * 保留最近 N 条消息，丢弃早期消息
 */

import type { Message } from '../../session/types.js';
import type { CompressionStrategy, CompressionContext, CompressionStrategyName } from '../types.js';
import { createTokenCounter } from '../TokenCounter.js';

/**
 * 滑动窗口策略实现
 */
export class SlidingWindowStrategy implements CompressionStrategy {
  readonly name: CompressionStrategyName = 'sliding-window';
  private readonly preserveRecent: number;
  private readonly tokenCounter = createTokenCounter();

  constructor(preserveRecent?: number) {
    this.preserveRecent = preserveRecent ?? 5;
  }

  /**
   * 判断是否需要压缩
   */
  shouldCompress(context: CompressionContext): boolean {
    // 消息数超过保留数的 2 倍时触发
    return context.messageCount > this.preserveRecent * 2;
  }

  /**
   * 执行压缩
   */
  async compress(
    messages: Message[],
    context: CompressionContext
  ): Promise<{ messages: Message[]; tokensSaved: number }> {
    if (messages.length <= this.preserveRecent) {
      return { messages, tokensSaved: 0 };
    }

    // 计算原始 Token 数
    const originalTokens = this.tokenCounter.countMessages(messages);

    // 保留最近 N 条消息
    const compressedMessages = messages.slice(-this.preserveRecent);

    // 计算压缩后 Token 数
    const compressedTokens = this.tokenCounter.countMessages(compressedMessages);

    const tokensSaved = Math.max(0, originalTokens - compressedTokens);

    return { messages: compressedMessages, tokensSaved };
  }
}

/**
 * 创建滑动窗口策略实例
 */
export function createSlidingWindowStrategy(preserveRecent?: number): SlidingWindowStrategy {
  return new SlidingWindowStrategy(preserveRecent);
}

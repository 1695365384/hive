/**
 * 观察掩码压缩策略（L1）
 *
 * 将历史消息中的长助手回复替换为简短占位符，
 * 保留最近 N 条消息完整不变。
 *
 * 零本地成本（只替换内容，不涉及 LLM 调用）
 */

import type { Message } from '../../session/types.js';
import type { CompressionStrategy, CompressionContext, CompressionStrategyName } from '../types.js';
import { DEFAULT_MASKING_CONFIG } from '../types.js';
import type { MaskingConfig } from '../types.js';
import { createTokenCounter } from '../TokenCounter.js';

/**
 * 观察掩码策略实现
 */
export class ObservationMaskingStrategy implements CompressionStrategy {
  readonly name: CompressionStrategyName = 'masking';
  private readonly config: MaskingConfig;
  private readonly tokenCounter = createTokenCounter();

  constructor(config?: Partial<MaskingConfig>) {
    this.config = { ...DEFAULT_MASKING_CONFIG, ...config };
  }

  /**
   * 判断是否需要压缩
   *
   * 当消息数超过保留值的 2 倍时触发
   */
  shouldCompress(context: CompressionContext): boolean {
    return context.messageCount > this.config.keepRecentToolResults * 2;
  }

  /**
   * 执行压缩
   *
   * 从后向前扫描，保留最近 N 条消息完整，
   * 其余 assistant 消息替换为占位符。
   */
  async compress(
    messages: Message[],
    _context: CompressionContext,
  ): Promise<{ messages: Message[]; tokensSaved: number }> {
    if (messages.length <= this.config.keepRecentToolResults) {
      return { messages, tokensSaved: 0 };
    }

    const originalTokens = this.tokenCounter.countMessages(messages);

    const keepCount = this.config.keepRecentToolResults;
    const remaining = messages.length - keepCount;
    let maskedCount = 0;

    const compressedMessages = messages.map((msg, i) => {
      // 保留最近 N 条
      if (i >= remaining) return msg;
      // 只掩码 assistant 消息
      if (msg.role !== 'assistant') return msg;

      maskedCount++;
      return { ...msg, content: this.config.placeholderFormat.replace('{n}', '1') };
    });

    if (maskedCount === 0) {
      return { messages, tokensSaved: 0 };
    }

    const compressedTokens = this.tokenCounter.countMessages(compressedMessages);
    const tokensSaved = Math.max(0, originalTokens - compressedTokens);

    return { messages: compressedMessages, tokensSaved };
  }
}

/**
 * 创建观察掩码策略实例
 */
export function createObservationMaskingStrategy(config?: Partial<MaskingConfig>): ObservationMaskingStrategy {
  return new ObservationMaskingStrategy(config);
}

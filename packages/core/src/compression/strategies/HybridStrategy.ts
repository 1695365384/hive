/**
 * 混合压缩策略
 *
 * 结合滑动窗口和摘要压缩：
 * 1. 先对早期消息生成摘要
 * 2. 保留摘要 + 最近 N 条消息
 */

import { randomUUID } from 'crypto';
import type { Message } from '../../session/types.js';
import type { CompressionStrategy, CompressionContext, CompressionStrategyName } from '../types.js';
import { createTokenCounter } from '../TokenCounter.js';

/**
 * 混合策略配置
 */
export interface HybridStrategyConfig {
  /** 保留最近 N 条消息 */
  preserveRecent: number;
  /** 摘要触发阈值（消息数） */
  summaryThreshold: number;
  /** 摘要最大 Token 数 */
  maxSummaryTokens: number;
}

/**
 * 混合压缩策略实现
 */
export class HybridStrategy implements CompressionStrategy {
  readonly name: CompressionStrategyName = 'hybrid';
  private readonly preserveRecent: number;
  private readonly summaryThreshold: number;
  private readonly maxSummaryTokens: number;
  private readonly tokenCounter = createTokenCounter();

  constructor(config?: Partial<HybridStrategyConfig>) {
    this.preserveRecent = config?.preserveRecent ?? 5;
    this.summaryThreshold = config?.summaryThreshold ?? 10;
    this.maxSummaryTokens = config?.maxSummaryTokens ?? 500;
  }

  /**
   * 判断是否需要压缩
   */
  shouldCompress(context: CompressionContext): boolean {
    // 消息数超过阈值，或者 Token 数接近阈值
    const messageThreshold = Math.max(this.summaryThreshold, this.preserveRecent * 2);
    const tokenThreshold = context.threshold > 0 ? context.threshold * 0.9 : Infinity;

    return context.messageCount >= messageThreshold || context.currentTokens >= tokenThreshold;
  }

  /**
   * 生成智能摘要
   *
   * 提取关键信息点
   */
  private generateSummary(messages: Message[]): string {
    const userMessages = messages.filter((m) => m.role === 'user');
    const assistantMessages = messages.filter((m) => m.role === 'assistant');

    const lines: string[] = ['[历史对话摘要]'];

    // 统计交互次数
    lines.push(`共进行了 ${userMessages.length} 轮对话。`);

    // 提取关键主题（从用户消息中）
    if (userMessages.length > 0) {
      lines.push('\n主要讨论内容：');

      // 简单提取：取前几条用户消息的关键词
      const topics = new Set<string>();
      for (const msg of userMessages.slice(0, 5)) {
        // 提取可能的主题词（简单实现）
        const words = msg.content.split(/[\s,，。！？、]+/).filter((w) => w.length >= 2 && w.length <= 10);
        words.slice(0, 3).forEach((w) => topics.add(w));
      }

      if (topics.size > 0) {
        lines.push(Array.from(topics).slice(0, 5).join('、'));
      }
    }

    // 总结助手响应
    if (assistantMessages.length > 0) {
      const hasCode = assistantMessages.some((m) =>
        m.content.includes('```') || m.content.includes('function') || m.content.includes('class')
      );
      const hasExplanation = assistantMessages.some((m) => m.content.length > 500);

      const activities: string[] = [];
      if (hasCode) activities.push('代码编写');
      if (hasExplanation) activities.push('问题解答');

      if (activities.length > 0) {
        lines.push(`\n涉及活动：${activities.join('、')}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * 执行压缩
   */
  async compress(
    messages: Message[],
    context: CompressionContext
  ): Promise<{ messages: Message[]; tokensSaved: number }> {
    // 如果消息数太少，不压缩
    if (messages.length <= this.preserveRecent) {
      return { messages, tokensSaved: 0 };
    }

    // 计算原始 Token 数
    const originalTokens = this.tokenCounter.countMessages(messages);

    // 如果消息数不足以触发摘要，使用滑动窗口
    if (messages.length < this.summaryThreshold) {
      const compressedMessages = messages.slice(-this.preserveRecent);
      const compressedTokens = this.tokenCounter.countMessages(compressedMessages);
      return {
        messages: compressedMessages,
        tokensSaved: Math.max(0, originalTokens - compressedTokens),
      };
    }

    // 混合策略：
    // 1. 保留最近 N 条消息
    // 2. 对其余消息生成摘要

    const recentMessages = messages.slice(-this.preserveRecent);
    const earlierMessages = messages.slice(0, -this.preserveRecent);

    // 生成摘要
    const summaryContent = this.generateSummary(earlierMessages);
    const summaryMessage: Message = {
      id: `summary_${randomUUID()}`,
      role: 'system',
      content: summaryContent,
      timestamp: new Date(),
      tokenCount: this.tokenCounter.count(summaryContent),
    };

    // 组合结果
    const compressedMessages = [summaryMessage, ...recentMessages];

    // 计算压缩后 Token 数
    const compressedTokens = this.tokenCounter.countMessages(compressedMessages);

    const tokensSaved = Math.max(0, originalTokens - compressedTokens);

    return { messages: compressedMessages, tokensSaved };
  }
}

/**
 * 创建混合策略实例
 */
export function createHybridStrategy(config?: Partial<HybridStrategyConfig>): HybridStrategy {
  return new HybridStrategy(config);
}

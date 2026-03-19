/**
 * Token 计数器
 *
 * 提供基于字符估算的 Token 计数功能
 */

import type { Message } from '../session/types.js';
import type { TokenCounter, TokenCounterConfig, CompressionConfig } from './types.js';
import { DEFAULT_TOKEN_COUNTER_CONFIG } from './types.js';

/**
 * Token 计数器实现
 */
export class SimpleTokenCounter implements TokenCounter {
  private readonly charsPerToken: number;
  private readonly safetyFactor: number;

  constructor(config?: Partial<TokenCounterConfig>) {
    const fullConfig = { ...DEFAULT_TOKEN_COUNTER_CONFIG, ...config };
    this.charsPerToken = fullConfig.charsPerToken ?? 4;
    this.safetyFactor = fullConfig.safetyFactor ?? 1.1;
  }

  /**
   * 计算文本的 Token 数
   */
  count(text: string): number {
    if (!text) {
      return 0;
    }

    // 基本估算：字符数 / 每 Token 字符数
    const baseEstimate = Math.ceil(text.length / this.charsPerToken);

    // 应用安全系数
    return Math.ceil(baseEstimate * this.safetyFactor);
  }

  /**
   * 计算消息的 Token 数
   *
   * 包括角色前缀和格式化开销
   */
  countMessage(message: Message): number {
    // 角色前缀开销（约 4 tokens）
    const roleOverhead = 4;

    // 消息格式开销（JSON 结构等，约 10 tokens）
    const formatOverhead = 10;

    const contentTokens = this.count(message.content);

    return roleOverhead + formatOverhead + contentTokens;
  }

  /**
   * 计算消息列表的总 Token 数
   */
  countMessages(messages: Message[]): number {
    if (messages.length === 0) {
      return 0;
    }

    // 消息列表格式开销（约 20 tokens）
    const listOverhead = 20;

    const messagesTokens = messages.reduce((sum, msg) => sum + this.countMessage(msg), 0);

    return listOverhead + messagesTokens;
  }
}

/**
 * 创建 Token 计数器实例
 */
export function createTokenCounter(config?: Partial<TokenCounterConfig>): TokenCounter {
  return new SimpleTokenCounter(config);
}

/**
 * 计算压缩阈值
 */
export function calculateThreshold(config: CompressionConfig): number {
  if (config.threshold > 0) {
    return config.threshold;
  }

  return Math.floor(config.contextWindowSize * config.thresholdPercentage);
}

/**
 * 判断是否需要压缩
 */
export function shouldCompress(
  currentTokens: number,
  messageCount: number,
  config: CompressionConfig
): boolean {
  const threshold = calculateThreshold(config);

  // 超过 Token 阈值
  if (currentTokens >= threshold) {
    return true;
  }

  // 消息数超过摘要阈值（针对摘要策略）
  if (messageCount >= config.summaryThreshold * 2) {
    return true;
  }

  return false;
}

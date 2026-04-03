/**
 * Token 计数器
 *
 * 提供 CJK 感知的 Token 计数功能。
 *
 * 为什么需要 CJK 感知：
 *   - 英文/代码：约 4 个字符 = 1 token（chars / 4）
 *   - 中日韩字符：约 1 个字符 = 1~1.5 tokens（比英文密度更高）
 *   - 混合文本：按字符类型分段估算，精度远优于统一除以 4
 */

import type { Message } from '../session/types.js';
import type { TokenCounter, TokenCounterConfig, CompressionConfig } from './types.js';
import { DEFAULT_TOKEN_COUNTER_CONFIG } from './types.js';

// CJK Unicode 区间（基础 + 扩展 A/B + 兼容）
const CJK_REGEX = /[\u2E80-\u2EFF\u2F00-\u2FDF\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\u3100-\u312F\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA48F\uF900-\uFAFF\uFE30-\uFE4F]/g;

/**
 * CJK 感知的 Token 数估算
 *
 * 策略：
 *   1. 统计文本中 CJK 字符数量
 *   2. CJK 字符按 1 char = 1.3 tokens 计算（保守估计）
 *   3. 非 CJK 字符按 4 chars = 1 token 计算
 *   4. 叠加安全系数
 */
function estimateTokensCJKAware(text: string, safetyFactor: number): number {
  if (!text) return 0;

  const cjkMatches = text.match(CJK_REGEX);
  const cjkCount = cjkMatches ? cjkMatches.length : 0;
  const nonCjkCount = text.length - cjkCount;

  // CJK: ~1.3 tokens/char; 非 CJK (含 ASCII + 空格): ~0.25 tokens/char (= chars/4)
  const rawTokens = cjkCount * 1.3 + nonCjkCount * 0.25;
  return Math.ceil(rawTokens * safetyFactor);
}

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
   * 计算文本的 Token 数（CJK 感知）
   */
  count(text: string): number {
    if (!text) {
      return 0;
    }
    return estimateTokensCJKAware(text, this.safetyFactor);
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

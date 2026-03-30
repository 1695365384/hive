/**
 * 压缩系统类型定义
 *
 * 定义智能压缩所需的类型和接口
 */

import type { Message } from '../session/types.js';

// ============================================
// 压缩配置
// ============================================

/**
 * 压缩策略名称
 */
export type CompressionStrategyName = 'sliding-window' | 'summary' | 'hybrid';

/**
 * 压缩配置
 */
export interface CompressionConfig {
  /** 压缩阈值（Token 数，达到此值触发压缩） */
  threshold: number;
  /** 压缩策略 */
  strategy: CompressionStrategyName;
  /** 保留最近 N 条消息（滑动窗口策略） */
  preserveRecent: number;
  /** 摘要触发阈值（消息数） */
  summaryThreshold: number;
  /** 摘要最大 Token 数 */
  maxSummaryTokens: number;
  /** 上下文窗口大小（用于计算阈值百分比） */
  contextWindowSize: number;
  /** 压缩触发阈值百分比（默认 80%） */
  thresholdPercentage: number;
}

/**
 * 默认压缩配置
 */
export const DEFAULT_COMPRESSION_CONFIG: CompressionConfig = {
  threshold: 0, // 0 表示基于 contextWindowSize 和 thresholdPercentage 计算
  strategy: 'hybrid',
  preserveRecent: 5,
  summaryThreshold: 10,
  maxSummaryTokens: 500,
  contextWindowSize: 200000, // 默认值，建议通过构造参数传入实际模型的 contextWindow
  thresholdPercentage: 0.8, // 80%
};

// ============================================
// 压缩上下文
// ============================================

/**
 * 压缩上下文
 */
export interface CompressionContext {
  /** 当前 Token 总数 */
  currentTokens: number;
  /** 消息总数 */
  messageCount: number;
  /** 上下文窗口大小 */
  contextWindowSize: number;
  /** 压缩阈值 */
  threshold: number;
  /** 配置 */
  config: CompressionConfig;
}

// ============================================
// 压缩策略接口
// ============================================

/**
 * 压缩策略接口
 */
export interface CompressionStrategy {
  /** 策略名称 */
  readonly name: CompressionStrategyName;

  /**
   * 判断是否需要压缩
   */
  shouldCompress(context: CompressionContext): boolean;

  /**
   * 执行压缩
   *
   * @returns 压缩后的消息列表和节省的 Token 数
   */
  compress(
    messages: Message[],
    context: CompressionContext
  ): Promise<{ messages: Message[]; tokensSaved: number }>;
}

// ============================================
// Token 计数
// ============================================

/**
 * Token 计数器接口
 */
export interface TokenCounter {
  /**
   * 计算文本的 Token 数
   */
  count(text: string): number;

  /**
   * 计算消息的 Token 数
   */
  countMessage(message: Message): number;

  /**
   * 计算消息列表的总 Token 数
   */
  countMessages(messages: Message[]): number;
}

/**
 * Token 计数器配置
 */
export interface TokenCounterConfig {
  /** 计数模式：estimate（估算）或 tiktoken（精确） */
  mode: 'estimate' | 'tiktoken';
  /** 估算模式下的每 Token 字符数（默认 4） */
  charsPerToken?: number;
  /** 安全系数（估算结果乘以此值） */
  safetyFactor?: number;
}

/**
 * 默认 Token 计数器配置
 */
export const DEFAULT_TOKEN_COUNTER_CONFIG: TokenCounterConfig = {
  mode: 'estimate',
  charsPerToken: 4,
  safetyFactor: 1.1,
};

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
export type CompressionStrategyName = 'sliding-window' | 'summary' | 'hybrid' | 'masking' | 'offload';

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
  /** system prompt 的大致 Token 数（从 budget 中扣除，默认 0） */
  systemPromptTokens?: number;
  /** 工具 schema 的大致 Token 数（从 budget 中扣除，默认 0） */
  toolSchemaTokens?: number;
  /** 模型的最大输出 Token 数（从 budget 中扣除，预留输出空间） */
  maxOutputTokens?: number;
}

/**
 * 观察掩码策略配置
 */
export interface MaskingConfig {
  /** 保留最近 N 条工具结果不变 */
  keepRecentToolResults: number;
  /** 掩码占位符格式，{n} 替换为结果数 */
  placeholderFormat: string;
}

/**
 * 工具结果卸载策略配置
 */
export interface OffloadConfig {
  /** 单条工具结果超过此 Token 数即卸载 */
  maxToolResultTokens: number;
  /** 保留预览行数 */
  previewLines: number;
  /** 卸载目录（相对于 workspace） */
  offloadDir: string;
  /** 卸载文件最大存活时间（毫秒），0 表示不过期。默认 1 小时 */
  maxOffloadAgeMs: number;
}

/**
 * 默认观察掩码配置
 */
export const DEFAULT_MASKING_CONFIG: MaskingConfig = {
  keepRecentToolResults: 3,
  placeholderFormat: '[Masked: {n} tool result(s)]',
};

/**
 * 默认工具卸载配置
 */
export const DEFAULT_OFFLOAD_CONFIG: OffloadConfig = {
  maxToolResultTokens: 20_000,
  previewLines: 10,
  offloadDir: '.hive/offload',
  maxOffloadAgeMs: 3_600_000, // 1 小时
};

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
  /** 计数模式
   *  - 'auto': 优先 tiktoken（模型已知时），回退到 CJK 估算
   *  - 'tiktoken': 强制 tiktoken（模型未知时抛错）
   *  - 'estimate': 强制 CJK 估算（不加载 tiktoken）
   */
  mode: 'auto' | 'tiktoken' | 'estimate';
  /** 当前模型的 ID（用于 tiktoken 自动选择编码） */
  modelId?: string;
  /** 估算模式下的每 Token 字符数（默认 4，仅 estimate 模式） */
  charsPerToken?: number;
  /** 安全系数（估算结果乘以此值，默认 1.1） */
  safetyFactor?: number;
}

/**
 * 默认 Token 计数器配置
 *
 * mode='auto' 自动选择：有已知模型 → tiktoken，否则 → CJK 估算
 */
export const DEFAULT_TOKEN_COUNTER_CONFIG: TokenCounterConfig = {
  mode: 'auto',
  safetyFactor: 1.1,
};

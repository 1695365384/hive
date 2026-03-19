/**
 * 压缩服务
 *
 * 管理压缩策略和自动压缩触发
 */

import type { Message, CompressionState } from '../session/types.js';
import type {
  CompressionConfig,
  CompressionContext,
  CompressionStrategy,
  CompressionStrategyName,
  TokenCounter,
} from './types.js';
import { DEFAULT_COMPRESSION_CONFIG } from './types.js';
import { createTokenCounter, calculateThreshold } from './TokenCounter.js';
import {
  SlidingWindowStrategy,
  SummaryStrategy,
  HybridStrategy,
} from './strategies/index.js';

/**
 * 压缩服务配置
 */
export interface CompressionServiceConfig {
  /** 压缩配置 */
  compression?: Partial<CompressionConfig>;
  /** Token 计数器配置 */
  tokenCounter?: Parameters<typeof createTokenCounter>[0];
  /** 是否自动压缩 */
  autoCompress?: boolean;
}

/**
 * 压缩结果
 */
export interface CompressionResult {
  /** 压缩后的消息 */
  messages: Message[];
  /** 节省的 Token 数 */
  tokensSaved: number;
  /** 使用的策略 */
  strategy: CompressionStrategyName;
  /** 压缩状态 */
  state: CompressionState;
}

/**
 * 压缩服务
 */
export class CompressionService {
  private readonly config: CompressionConfig;
  private readonly tokenCounter: TokenCounter;
  private readonly strategy: CompressionStrategy;
  private readonly autoCompress: boolean;

  constructor(config?: CompressionServiceConfig) {
    this.config = { ...DEFAULT_COMPRESSION_CONFIG, ...config?.compression };
    this.tokenCounter = createTokenCounter(config?.tokenCounter);
    this.autoCompress = config?.autoCompress ?? true;
    this.strategy = this.createStrategy();
  }

  /**
   * 创建压缩策略
   */
  private createStrategy(): CompressionStrategy {
    switch (this.config.strategy) {
      case 'sliding-window':
        return new SlidingWindowStrategy(this.config.preserveRecent);
      case 'summary':
        return new SummaryStrategy({
          summaryThreshold: this.config.summaryThreshold,
          maxSummaryTokens: this.config.maxSummaryTokens,
        });
      case 'hybrid':
      default:
        return new HybridStrategy({
          preserveRecent: this.config.preserveRecent,
          summaryThreshold: this.config.summaryThreshold,
          maxSummaryTokens: this.config.maxSummaryTokens,
        });
    }
  }

  /**
   * 获取压缩配置
   */
  getConfig(): CompressionConfig {
    return this.config;
  }

  /**
   * 获取压缩阈值
   */
  getThreshold(): number {
    return calculateThreshold(this.config);
  }

  /**
   * 计算消息的 Token 数
   */
  countTokens(messages: Message[]): number {
    return this.tokenCounter.countMessages(messages);
  }

  /**
   * 创建压缩上下文
   */
  createContext(messages: Message[]): CompressionContext {
    const currentTokens = this.countTokens(messages);
    const threshold = this.getThreshold();

    return {
      currentTokens,
      messageCount: messages.length,
      contextWindowSize: this.config.contextWindowSize,
      threshold,
      config: this.config,
    };
  }

  /**
   * 判断是否需要压缩
   */
  needsCompression(messages: Message[]): boolean {
    if (!this.autoCompress) {
      return false;
    }

    const context = this.createContext(messages);
    return this.strategy.shouldCompress(context);
  }

  /**
   * 执行压缩
   */
  async compress(messages: Message[]): Promise<CompressionResult> {
    const context = this.createContext(messages);
    const result = await this.strategy.compress(messages, context);

    // 创建压缩状态
    const state: CompressionState = {
      lastCompressedAt: new Date(),
      originalMessageCount: messages.length,
      compressedMessageCount: result.messages.length,
      strategy: this.strategy.name,
      tokensSaved: result.tokensSaved,
    };

    return {
      messages: result.messages,
      tokensSaved: result.tokensSaved,
      strategy: this.strategy.name,
      state,
    };
  }

  /**
   * 条件压缩（仅在需要时压缩）
   */
  async compressIfNeeded(messages: Message[]): Promise<CompressionResult> {
    if (!this.needsCompression(messages)) {
      // 不需要压缩，返回原始消息
      return {
        messages,
        tokensSaved: 0,
        strategy: this.strategy.name,
        state: {
          lastCompressedAt: new Date(),
          originalMessageCount: messages.length,
          compressedMessageCount: messages.length,
          strategy: 'sliding-window', // 无压缩
          tokensSaved: 0,
        },
      };
    }

    return this.compress(messages);
  }

  /**
   * 更新配置
   */
  updateConfig(updates: Partial<CompressionConfig>): void {
    Object.assign(this.config, updates);
  }
}

/**
 * 创建压缩服务实例
 */
export function createCompressionService(config?: CompressionServiceConfig): CompressionService {
  return new CompressionService(config);
}

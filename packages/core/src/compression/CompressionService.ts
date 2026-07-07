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
  TokenCounterConfig,
  MaskingConfig,
  OffloadConfig,
} from './types.js';
import { DEFAULT_COMPRESSION_CONFIG, DEFAULT_MASKING_CONFIG, DEFAULT_OFFLOAD_CONFIG } from './types.js';
import { ModelAwareTokenCounter, calculateThreshold, calculateEffectiveBudget } from './TokenCounter.js';
import {
  SlidingWindowStrategy,
  SummaryStrategy,
  HybridStrategy,
  ObservationMaskingStrategy,
  ToolResultOffloadStrategy,
} from './strategies/index.js';

/**
 * 压缩服务配置
 */
export interface CompressionServiceConfig {
  /** 压缩配置 */
  compression?: Partial<CompressionConfig>;
  /** Token 计数器配置 */
  tokenCounter?: Partial<TokenCounterConfig>;
  /** 当前模型 ID（传递给 token counter 实现模型感知计数） */
  modelId?: string;
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
 * 管道阶段信息
 */
export interface PipelinePhaseInfo {
  /** 阶段策略名 */
  strategy: CompressionStrategyName;
  /** 该阶段节省的 Token */
  tokensSaved: number;
  /** 该阶段是否需要压缩 */
  triggered: boolean;
}

/**
 * 管道压缩结果
 */
export interface PipelineCompressionResult {
  /** 压缩后的消息 */
  messages: Message[];
  /** 总节省 Token */
  totalTokensSaved: number;
  /** 各阶段详情 */
  phases: PipelinePhaseInfo[];
  /** 是否已达标（不再需要更多压缩） */
  budgetMet: boolean;
}

/**
 * 压缩服务
 */
export class CompressionService {
  private readonly config: CompressionConfig;
  private readonly tokenCounter: ModelAwareTokenCounter;
  private readonly strategy: CompressionStrategy;
  private readonly autoCompress: boolean;

  constructor(config?: CompressionServiceConfig) {
    this.config = { ...DEFAULT_COMPRESSION_CONFIG, ...config?.compression };
    this.tokenCounter = new ModelAwareTokenCounter({
      ...config?.tokenCounter,
      modelId: config?.modelId ?? config?.tokenCounter?.modelId,
    });
    this.autoCompress = config?.autoCompress ?? true;
    this.strategy = this.createStrategy();
  }

  /**
   * 初始化 Token 计数器（加载 tiktoken WASM）
   * 调用前可选调用，不调用也能用（回退到估算模式）
   */
  async initialize(): Promise<void> {
    await this.tokenCounter.initialize();
  }

  /**
   * 获取模型 ID
   */
  get modelId(): string | undefined {
    return this.tokenCounter.modelId;
  }

  /**
   * 设置模型 ID（dispatch 时动态更新）
   */
  setModelId(modelId: string | undefined): void {
    this.tokenCounter.setModelId(modelId);
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

  /**
   * 按管道顺序压缩（L0 → L1 → L2/L3），每阶段后检查是否达标，达标即止。
   *
   * 管道设计：
   *   L0: ToolResultOffload — 卸载大内容到文件
   *   L1: ObservationMasking — 掩码旧助手消息
   *   L2: SlidingWindow — 丢弃早期消息
   *   L3: Hybrid — 摘要 + 滑动窗口
   *
   * @param messages 原始消息
   * @param maskingConfig 可选掩码配置
   * @param offloadConfig 可选卸载配置
   */
  async compressPipeline(
    messages: Message[],
    maskingConfig?: Partial<MaskingConfig>,
    offloadConfig?: Partial<OffloadConfig>,
  ): Promise<PipelineCompressionResult> {
    const phases: PipelinePhaseInfo[] = [];
    let currentMessages = messages;
    let totalTokensSaved = 0;

    // 计算有效 budget（扣除 system prompt + tools schema + maxOutputTokens）
    const effectiveBudget = calculateEffectiveBudget(this.config);

    // 判断是否已达标
    const isBudgetMet = (msgs: Message[]): boolean => {
      const tokens = this.tokenCounter.countMessages(msgs);
      return tokens <= effectiveBudget;
    };

    if (isBudgetMet(currentMessages)) {
      return { messages: currentMessages, totalTokensSaved: 0, phases: [], budgetMet: true };
    }

    // 阶段 1: L0 — 工具结果卸载（零成本）
    const offloadStrategy = new ToolResultOffloadStrategy({
      ...DEFAULT_OFFLOAD_CONFIG,
      ...offloadConfig,
    });
    const offloadCtx = this.createContext(currentMessages);
    if (offloadStrategy.shouldCompress(offloadCtx)) {
      const offloadResult = await offloadStrategy.compress(currentMessages, offloadCtx);
      totalTokensSaved += offloadResult.tokensSaved;
      currentMessages = offloadResult.messages;
      phases.push({
        strategy: 'offload',
        tokensSaved: offloadResult.tokensSaved,
        triggered: offloadResult.tokensSaved > 0,
      });
      if (isBudgetMet(currentMessages)) {
        return { messages: currentMessages, totalTokensSaved, phases, budgetMet: true };
      }
    } else {
      phases.push({ strategy: 'offload', tokensSaved: 0, triggered: false });
    }

    // 阶段 2: L1 — 观察掩码（零成本）
    const maskingStrategy = new ObservationMaskingStrategy({
      ...DEFAULT_MASKING_CONFIG,
      ...maskingConfig,
    });
    const maskingCtx = this.createContext(currentMessages);
    if (maskingStrategy.shouldCompress(maskingCtx)) {
      const maskingResult = await maskingStrategy.compress(currentMessages, maskingCtx);
      totalTokensSaved += maskingResult.tokensSaved;
      currentMessages = maskingResult.messages;
      phases.push({
        strategy: 'masking',
        tokensSaved: maskingResult.tokensSaved,
        triggered: maskingResult.tokensSaved > 0,
      });
      if (isBudgetMet(currentMessages)) {
        return { messages: currentMessages, totalTokensSaved, phases, budgetMet: true };
      }
    } else {
      phases.push({ strategy: 'masking', tokensSaved: 0, triggered: false });
    }

    // 阶段 3: L2 — 滑动窗口（已有策略）
    const windowStrategy = new SlidingWindowStrategy(this.config.preserveRecent);
    const windowCtx = this.createContext(currentMessages);
    if (windowStrategy.shouldCompress(windowCtx)) {
      const windowResult = await windowStrategy.compress(currentMessages, windowCtx);
      totalTokensSaved += windowResult.tokensSaved;
      currentMessages = windowResult.messages;
      phases.push({
        strategy: 'sliding-window',
        tokensSaved: windowResult.tokensSaved,
        triggered: windowResult.tokensSaved > 0,
      });
      if (isBudgetMet(currentMessages)) {
        return { messages: currentMessages, totalTokensSaved, phases, budgetMet: true };
      }
    } else {
      phases.push({ strategy: 'sliding-window', tokensSaved: 0, triggered: false });
    }

    // 阶段 4: L3 — 混合（摘要 + 滑动窗口）
    const hybridStrategy = new HybridStrategy({
      preserveRecent: this.config.preserveRecent,
      summaryThreshold: this.config.summaryThreshold,
      maxSummaryTokens: this.config.maxSummaryTokens,
    });
    const hybridCtx = this.createContext(currentMessages);
    if (hybridStrategy.shouldCompress(hybridCtx)) {
      const hybridResult = await hybridStrategy.compress(currentMessages, hybridCtx);
      totalTokensSaved += hybridResult.tokensSaved;
      currentMessages = hybridResult.messages;
      phases.push({
        strategy: 'hybrid',
        tokensSaved: hybridResult.tokensSaved,
        triggered: hybridResult.tokensSaved > 0,
      });
    } else {
      phases.push({ strategy: 'hybrid', tokensSaved: 0, triggered: false });
    }

    const tokens = this.tokenCounter.countMessages(currentMessages);
    return {
      messages: currentMessages,
      totalTokensSaved,
      phases,
      budgetMet: tokens <= effectiveBudget,
    };
  }
}

/**
 * 创建压缩服务实例
 */
export function createCompressionService(config?: CompressionServiceConfig): CompressionService {
  return new CompressionService(config);
}

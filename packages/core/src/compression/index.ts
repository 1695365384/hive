/**
 * 压缩模块导出
 */

// 类型
export type {
  CompressionStrategyName,
  CompressionConfig,
  CompressionContext,
  CompressionStrategy,
  TokenCounter,
  TokenCounterConfig,
  MaskingConfig,
  OffloadConfig,
} from './types.js';

// 常量
export {
  DEFAULT_COMPRESSION_CONFIG,
  DEFAULT_TOKEN_COUNTER_CONFIG,
  DEFAULT_MASKING_CONFIG,
  DEFAULT_OFFLOAD_CONFIG,
} from './types.js';

// Token 计数器
export {
  ModelAwareTokenCounter,
  SimpleTokenCounter,
  createTokenCounter,
  calculateThreshold,
  calculateEffectiveBudget,
  shouldCompress,
  registerTokenizer,
  type TokenizerFn,
} from './TokenCounter.js';

// 压缩服务
export {
  CompressionService,
  createCompressionService,
  type CompressionServiceConfig,
  type CompressionResult,
} from './CompressionService.js';

// 压缩策略
export {
  SlidingWindowStrategy,
  createSlidingWindowStrategy,
  SummaryStrategy,
  createSummaryStrategy,
  HybridStrategy,
  createHybridStrategy,
  type HybridStrategyConfig,
  ObservationMaskingStrategy,
  createObservationMaskingStrategy,
  ToolResultOffloadStrategy,
  createToolResultOffloadStrategy,
} from './strategies/index.js';

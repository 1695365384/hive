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
} from './types.js';

// 常量
export {
  DEFAULT_COMPRESSION_CONFIG,
  DEFAULT_TOKEN_COUNTER_CONFIG,
} from './types.js';

// Token 计数器
export {
  SimpleTokenCounter,
  createTokenCounter,
  calculateThreshold,
  shouldCompress,
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
} from './strategies/index.js';

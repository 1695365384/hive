/**
 * Provider 模块 - 统一入口
 *
 * 提供 LLM 提供商管理功能
 */

// ============================================
// 核心类
// ============================================

export { Provider } from './Provider.js';
export {
  ProviderManager,
  getProviderManager,
  createProviderManager,
  providerManager,
} from './ProviderManager.js';

// ============================================
// 类型
// ============================================

export type {
  ProviderConfig,
  McpServerConfig,
  ModelSpec,
  ProviderPreset,
  ConfigSource,
  IProvider,
} from './types.js';

// ============================================
// 配置来源
// ============================================

export {
  CCSwitchSource,
  LocalConfigSource,
  EnvSource,
  createConfigChain,
  mergeSources,
} from './sources/index.js';

// ============================================
// 预设
// ============================================

export {
  ALL_PRESETS,
  getPresets,
  getPresetsByCategory,
  getPreset,
  applyPreset,
  searchPresets,
  ANTHROPIC_PRESETS,
  OPENAI_PRESETS,
  CHINESE_PRESETS,
  GATEWAY_PRESETS,
} from './presets/index.js';

// ============================================
// 模型
// ============================================

export {
  fetchModels,
  fetchModelDetail,
  getModelFetcher,
  getProviderModels,
  getModelSpec,
  getContextWindow,
  checkModelSupport,
  estimateCost,
  getAllModels,
  searchModels,
} from './models/index.js';

export type { ModelFetcher } from './models/fetcher.js';

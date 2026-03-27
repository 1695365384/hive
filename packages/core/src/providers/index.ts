/**
 * Provider 模块 - 统一入口
 *
 * 提供 LLM 提供商管理功能
 * 使用 AI SDK 适配器和 Models.dev 元数据
 */

// ============================================
// 核心类
// ============================================

export {
  ProviderManager,
  createProviderManager,
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
  ProviderType,
  ExternalConfig,
  AgentDefaults,
} from './types.js';

// ============================================
// 配置来源
// ============================================

export {
  EnvSource,
  ModelsDevSource,
  createModelsDevSource,
  getModelsDevSource,
  createConfigChain,
  mergeSources,
} from './sources/index.js';

// ============================================
// AI SDK 适配器
// ============================================

export {
  // 类型
  type ProviderAdapter,
  type AdapterConfig,
  // 类
  OpenAIAdapter,
  AnthropicAdapter,
  GoogleAdapter,
  OpenAICompatibleAdapter,
  // 函数
  createAdapter,
  createOpenAIAdapter,
  createAnthropicAdapter,
  createGoogleAdapter,
  createOpenAICompatibleAdapter,
  getProviderType,
  getKnownProviders,
  getKnownProvidersSync,
  isKnownProvider,
  adapterRegistry,
} from './adapters/index.js';

// ============================================
// 模型元数据
// ============================================

export {
  ModelsDevClient,
  getModelsDevClient,
  createModelsDevClient,
  getStaticModels,
  fetchModelSpec,
  fetchProviderModels,
} from './metadata/index.js';

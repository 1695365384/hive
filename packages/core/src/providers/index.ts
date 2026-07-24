/**
 * Provider 模块 - 统一入口
 *
 * 供应商/模型目录唯一来源：oh-my-pi catalog（pi-catalog-bridge）。
 */

export {
  ProviderManager,
  createProviderManager,
} from './ProviderManager.js';

export type {
  ProviderConfig,
  McpServerConfig,
  McpStdioServerConfig,
  McpHttpServerConfig,
  ModelSpec,
  ProviderPreset,
  ConfigSource,
  IProvider,
  ProviderType,
  ExternalConfig,
  AgentDefaults,
  PiCatalogProvider,
} from './types.js';

export {
  isHttpMcpConfig,
  normalizeMcpServerConfig,
} from './types.js';

export {
  EnvSource,
  createConfigChain,
} from './sources/index.js';

export {
  normalizeProviderId,
  warmPiCatalog,
  listPiProviders,
  listPiProviderModels,
  testPiProviderConnection,
  getPiProviderMetaSync,
  getPiProviderDescriptorSync,
  PROVIDER_ID_ALIASES,
} from './pi-catalog-bridge.js';

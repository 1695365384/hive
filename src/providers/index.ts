/**
 * Provider 模块
 */

export {
  CCSwitchReader,
  getCurrentProvider,
  switchProvider,
  UnifiedProviderManager,
  providerManager,
  type CCProvider,
  type CCMcpServer,
} from './cc-switch-provider.js';

export {
  ALL_PRESETS,
  CHINESE_PROVIDERS,
  OPENAI_SERIES_PROVIDERS,
  GATEWAY_PROVIDERS,
  ANTHROPIC_PROVIDERS,
  getProviderPreset,
  createProviderConfig,
  applyPreset,
  listAllPresets,
  listPresetsByCategory,
} from './presets.js';

// 本地配置加载器
export {
  findConfigFile,
  getConfigPath,
  loadConfig,
  reloadConfig,
  saveConfig,
  getProviders,
  getProvider,
  getDefaultProvider,
  getEnabledProviders,
  toCCProvider,
  getMcpServers,
  getEnabledMcpServers,
  getAgentDefaults,
  useProvider,
  listProviders,
  type ProviderConfig,
  type McpServerConfig,
  type AgentDefaults,
  type ProvidersConfig,
} from './config-loader.js';

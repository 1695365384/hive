/**
 * 配置来源模块
 *
 * 定义统一的配置来源接口和实现
 */

import type { ConfigSource, ProviderConfig, McpServerConfig } from '../types.js';
import { CCSwitchSource } from './cc-switch.js';
import { LocalConfigSource } from './local-config.js';
import { EnvSource } from './env.js';
import { ModelsDevSource, createModelsDevSource, getModelsDevSource } from './models-dev.js';

// 导出所有来源
export { CCSwitchSource } from './cc-switch.js';
export { LocalConfigSource } from './local-config.js';
export { EnvSource } from './env.js';
export { ModelsDevSource, createModelsDevSource, getModelsDevSource } from './models-dev.js';

// 导出类型
export type { ConfigSource } from '../types.js';

/**
 * 创建配置来源链
 *
 * 按优先级顺序：CC-Switch > Local Config > Environment
 */
export function createConfigChain(): ConfigSource[] {
  return [
    new CCSwitchSource(),
    new LocalConfigSource(),
    new EnvSource(),
  ];
}

/**
 * 合并多个配置来源
 */
export function mergeSources(sources: ConfigSource[]): {
  providers: ProviderConfig[];
  mcpServers: Record<string, McpServerConfig>;
  defaultProviderId: string | null;
} {
  const providers: ProviderConfig[] = [];
  const providerIds = new Set<string>();
  const mcpServers: Record<string, McpServerConfig> = {};
  let defaultProviderId: string | null = null;

  // 按优先级顺序处理
  for (const source of sources) {
    if (!source.isAvailable()) continue;

    // 获取 Provider
    const sourceProviders = source.getAllProviders();
    for (const config of sourceProviders) {
      if (!providerIds.has(config.id)) {
        providers.push(config);
        providerIds.add(config.id);
      }
    }

    // 获取 MCP 服务器
    const sourceMcpServers = source.getMcpServers();
    for (const [name, config] of Object.entries(sourceMcpServers)) {
      if (!mcpServers[name]) {
        mcpServers[name] = config;
      }
    }

    // 获取默认 Provider
    if (!defaultProviderId && source.getDefaultProviderId) {
      defaultProviderId = source.getDefaultProviderId();
    }
  }

  return { providers, mcpServers, defaultProviderId };
}

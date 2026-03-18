/**
 * 本地配置加载器
 *
 * 从 providers.json 加载 LLM 提供商配置
 */

import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { CCProvider, ProviderConfig, McpServerConfig, ProvidersConfig, AgentDefaults } from './types.js';

// 重新导出类型
export type { ProviderConfig, McpServerConfig, AgentDefaults, ProvidersConfig };

// ============================================
// 配置文件路径
// ============================================

const CONFIG_FILENAMES = [
  'providers.json',
  '.claude/providers.json',
  join(homedir(), '.claude', 'providers.json'),
];

/**
 * 查找配置文件
 */
export function findConfigFile(): string | null {
  for (const filename of CONFIG_FILENAMES) {
    if (existsSync(filename)) {
      return filename;
    }
  }
  return null;
}

/**
 * 获取配置文件路径
 */
export function getConfigPath(): string {
  return findConfigFile() || CONFIG_FILENAMES[0];
}

// ============================================
// 配置加载
// ============================================

let cachedConfig: ProvidersConfig | null = null;

/**
 * 加载配置
 */
export function loadConfig(): ProvidersConfig | null {
  if (cachedConfig) {
    return cachedConfig;
  }

  const configPath = findConfigFile();
  if (!configPath) {
    return null;
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    cachedConfig = JSON.parse(content) as ProvidersConfig;
    return cachedConfig;
  } catch (error) {
    console.error(`Failed to load config from ${configPath}:`, error);
    return null;
  }
}

/**
 * 重新加载配置
 */
export function reloadConfig(): ProvidersConfig | null {
  cachedConfig = null;
  return loadConfig();
}

/**
 * 保存配置
 */
export function saveConfig(config: ProvidersConfig): boolean {
  const configPath = getConfigPath();

  try {
    writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    cachedConfig = config;
    return true;
  } catch (error) {
    console.error(`Failed to save config to ${configPath}:`, error);
    return false;
  }
}

// ============================================
// 提供商管理
// ============================================

/**
 * 获取所有提供商
 */
export function getProviders(): Record<string, ProviderConfig> {
  const config = loadConfig();
  return config?.providers || {};
}

/**
 * 获取提供商配置
 */
export function getProvider(id: string): ProviderConfig | null {
  const providers = getProviders();
  return providers[id] || null;
}

/**
 * 获取默认提供商
 */
export function getDefaultProvider(): ProviderConfig | null {
  const config = loadConfig();
  if (!config?.default) {
    return null;
  }
  return getProvider(config.default);
}

/**
 * 获取启用的提供商列表
 */
export function getEnabledProviders(): string[] {
  const providers = getProviders();
  return Object.entries(providers)
    .filter(([, config]) => config.enabled !== false)
    .map(([id]) => id);
}

/**
 * 将本地配置转换为 CCProvider 格式
 */
export function toCCProvider(id: string, config: ProviderConfig): CCProvider {
  return {
    id,
    app_id: 'claude-code',
    name: config.name,
    base_url: config.base_url,
    api_key: config.api_key || process.env.ANTHROPIC_API_KEY || '',
    model: config.model,
    is_active: true,
    config: {
      models: config.models,
      defaultModel: config.model,
      description: config.description,
    },
  };
}

// ============================================
// MCP 服务器管理
// ============================================

/**
 * 获取 MCP 服务器配置
 */
export function getMcpServers(): Record<string, McpServerConfig> {
  const config = loadConfig();
  return config?.mcp_servers || {};
}

/**
 * 获取启用的 MCP 服务器
 */
export function getEnabledMcpServers(): Record<string, McpServerConfig> {
  const servers = getMcpServers();
  const enabled: Record<string, McpServerConfig> = {};

  for (const [id, config] of Object.entries(servers)) {
    if (config.enabled !== false) {
      enabled[id] = config;
    }
  }

  return enabled;
}

// ============================================
// Agent 默认配置
// ============================================

/**
 * 获取 Agent 默认配置
 */
export function getAgentDefaults(agentType: string): AgentDefaults | null {
  const config = loadConfig();
  return config?.agent_defaults?.[agentType as keyof typeof config.agent_defaults] || null;
}

// ============================================
// 便捷函数
// ============================================

/**
 * 使用指定提供商
 */
export function useProvider(providerId: string): boolean {
  const config = getProvider(providerId);
  if (!config) {
    console.error(`Provider not found: ${providerId}`);
    return false;
  }

  if (!config.api_key) {
    console.error(`API key not set for provider: ${providerId}`);
    return false;
  }

  process.env.ANTHROPIC_BASE_URL = config.base_url;
  process.env.ANTHROPIC_API_KEY = config.api_key;

  if (config.model) {
    process.env.ANTHROPIC_MODEL = config.model;
  }

  console.log(`✅ Using provider: ${config.name} (model: ${config.model || 'default'})`);
  return true;
}

/**
 * 列出所有提供商
 */
export function listProviders(): void {
  const providers = getProviders();
  const defaultId = loadConfig()?.default;

  console.log('\n📋 Available Providers:\n');

  for (const [id, config] of Object.entries(providers)) {
    const isDefault = id === defaultId;
    const status = config.enabled === false ? '❌' : '✅';
    const defaultMarker = isDefault ? ' (default)' : '';
    const hasKey = config.api_key ? '🔑' : '⚠️';

    console.log(`  ${status} ${id}${defaultMarker}`);
    console.log(`     Name: ${config.name}`);
    console.log(`     Model: ${config.model || 'default'}`);
    console.log(`     API Key: ${hasKey}`);
    if (config.description) {
      console.log(`     Description: ${config.description}`);
    }
    console.log();
  }
}

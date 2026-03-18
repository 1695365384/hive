/**
 * 本地配置文件来源
 *
 * 从 providers.json 读取配置
 */

import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { ConfigSource, ProviderConfig, McpServerConfig } from '../types.js';

/**
 * providers.json 配置结构
 */
interface ProvidersJsonConfig {
  version: string;
  description?: string;
  default?: string;
  providers: Record<string, Omit<ProviderConfig, 'id'>>;
  mcp_servers?: Record<string, McpServerConfig>;
}

/**
 * 本地配置文件来源
 */
export class LocalConfigSource implements ConfigSource {
  readonly name = 'local-config';

  private configPath: string;
  private config: ProvidersJsonConfig | null = null;

  constructor(configPath?: string) {
    this.configPath = configPath || join(homedir(), '.claude', 'providers.json');
  }

  isAvailable(): boolean {
    return existsSync(this.configPath);
  }

  private loadConfig(): ProvidersJsonConfig | null {
    if (this.config) return this.config;

    if (!this.isAvailable()) return null;

    try {
      const content = readFileSync(this.configPath, 'utf-8');
      this.config = JSON.parse(content);
      return this.config;
    } catch (error) {
      console.warn(`读取配置文件失败 (${this.configPath}):`, error);
      return null;
    }
  }

  getProvider(id: string): ProviderConfig | null {
    const config = this.loadConfig();
    if (!config) return null;

    const providerConfig = config.providers[id];
    if (!providerConfig) return null;

    return {
      id,
      ...providerConfig,
    };
  }

  getAllProviders(): ProviderConfig[] {
    const config = this.loadConfig();
    if (!config) return [];

    const providers: ProviderConfig[] = [];
    for (const [id, providerConfig] of Object.entries(config.providers)) {
      providers.push({
        id,
        ...providerConfig,
      });
    }

    return providers;
  }

  getMcpServers(): Record<string, McpServerConfig> {
    const config = this.loadConfig();
    if (!config) return {};

    return config.mcp_servers || {};
  }

  getDefaultProviderId(): string | null {
    const config = this.loadConfig();
    if (!config) return null;

    // 如果有默认配置
    if (config.default) return config.default;

    // 返回第一个启用的
    for (const [id, provider] of Object.entries(config.providers)) {
      if (provider.enabled !== false) {
        return id;
      }
    }

    return null;
  }

  /**
   * 重新加载配置
   */
  reload(): void {
    this.config = null;
  }
}

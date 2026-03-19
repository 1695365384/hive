/**
 * 本地配置文件来源
 *
 * 从 providers.json 读取配置
 */

import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { cwd } from 'process';
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
 * 查找配置文件路径
 *
 * 按优先级查找：
 * 1. 环境变量 PROVIDERS_CONFIG
 * 2. 当前工作目录下的 providers.json
 * 3. ~/.claude/providers.json
 */
function findConfigPath(): string {
  // 1. 环境变量
  const envPath = process.env.PROVIDERS_CONFIG;
  if (envPath && existsSync(envPath)) {
    return envPath;
  }

  // 2. 当前工作目录
  const cwdPath = join(cwd(), 'providers.json');
  if (existsSync(cwdPath)) {
    return cwdPath;
  }

  // 3. 用户主目录
  return join(homedir(), '.claude', 'providers.json');
}

/**
 * 本地配置文件来源
 */
export class LocalConfigSource implements ConfigSource {
  readonly name = 'providers';

  private configPath: string;
  private config: ProvidersJsonConfig | null = null;

  constructor(configPath?: string) {
    this.configPath = configPath || findConfigPath();
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

    if (config.default) return config.default;

    for (const [id, provider] of Object.entries(config.providers)) {
      if (provider.enabled !== false) {
        return id;
      }
    }

    return null;
  }

  /**
   * 获取配置文件路径
   */
  getPath(): string {
    return this.configPath;
  }

  /**
   * 重新加载配置
   */
  reload(): void {
    this.config = null;
  }
}

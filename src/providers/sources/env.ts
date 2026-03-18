/**
 * 环境变量配置来源
 *
 * 从环境变量读取配置（作为最后的 fallback）
 */

import type { ConfigSource, ProviderConfig, McpServerConfig } from '../types.js';

/**
 * 环境变量配置来源
 */
export class EnvSource implements ConfigSource {
  readonly name = 'environment';

  isAvailable(): boolean {
    // 检查是否有 Anthropic 相关环境变量
    return !!(
      process.env.ANTHROPIC_API_KEY ||
      process.env.ANTHROPIC_BASE_URL
    );
  }

  getProvider(id: string): ProviderConfig | null {
    // 只支持 'env' 或 'default' ID
    if (id !== 'env' && id !== 'default') return null;

    return this.buildProviderConfig();
  }

  getAllProviders(): ProviderConfig[] {
    const config = this.buildProviderConfig();
    return config ? [config] : [];
  }

  getMcpServers(): Record<string, McpServerConfig> {
    // 环境变量不支持 MCP 服务器配置
    return {};
  }

  getDefaultProviderId(): string | null {
    return this.isAvailable() ? 'env' : null;
  }

  private buildProviderConfig(): ProviderConfig | null {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const baseUrl = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
    const model = process.env.ANTHROPIC_MODEL;

    if (!apiKey && baseUrl === 'https://api.anthropic.com') {
      return null;
    }

    return {
      id: 'env',
      name: 'Environment Provider',
      baseUrl,
      apiKey,
      model,
      enabled: true,
    };
  }
}

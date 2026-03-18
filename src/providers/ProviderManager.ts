/**
 * Provider 管理器
 *
 * 统一管理所有 Provider 配置和状态
 */

import type { ProviderConfig, McpServerConfig, ModelSpec, ConfigSource } from './types.js';
import { Provider } from './Provider.js';
import { createConfigChain } from './sources/index.js';
import { applyPreset, getPresets } from './presets/index.js';

/**
 * Provider 管理器
 */
export class ProviderManager {
  private providers: Map<string, Provider> = new Map();
  private activeId: string | null = null;
  private sources: ConfigSource[];

  constructor() {
    this.sources = createConfigChain();
    this.loadProviders();
  }

  /**
   * 从所有配置源加载 Provider
   */
  private loadProviders(): void {
    // 按优先级加载配置
    for (const source of this.sources) {
      if (!source.isAvailable()) continue;

      // 加载所有 Provider
      const configs = source.getAllProviders();
      for (const config of configs) {
        if (!this.providers.has(config.id)) {
          this.providers.set(config.id, new Provider(config));
        }
      }

      // 设置默认
      if (!this.activeId && source.getDefaultProviderId) {
        const defaultId = source.getDefaultProviderId();
        if (defaultId && this.providers.has(defaultId)) {
          this.activeId = defaultId;
        }
      }
    }

    // 如果没有默认，使用第一个
    if (!this.activeId && this.providers.size > 0) {
      this.activeId = this.providers.keys().next().value ?? null;
    }
  }

  /**
   * 获取当前活跃的 Provider
   */
  get active(): Provider | null {
    if (!this.activeId) return null;
    return this.providers.get(this.activeId) ?? null;
  }

  /**
   * 获取所有 Provider
   */
  get all(): Provider[] {
    return Array.from(this.providers.values());
  }

  /**
   * 获取所有 Provider ID
   */
  get ids(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * 获取指定 Provider
   */
  get(id: string): Provider | undefined {
    return this.providers.get(id);
  }

  /**
   * 切换 Provider
   *
   * @param id Provider ID 或预设 ID
   * @param apiKey 可选的 API Key（用于预设）
   */
  switch(id: string, apiKey?: string): boolean {
    // 检查是否是已存在的 Provider
    if (this.providers.has(id)) {
      this.activeId = id;
      this.active?.apply();
      return true;
    }

    // 检查是否是预设
    const preset = getPresets().find(p => p.id === id);
    if (preset) {
      const key = apiKey || process.env[preset.envKey];
      if (!key) {
        console.error(`使用预设 "${id}" 需要设置 ${preset.envKey}`);
        return false;
      }

      const provider = applyPreset(preset, key);
      this.providers.set(provider.id, provider);
      this.activeId = provider.id;
      provider.apply();
      return true;
    }

    console.error(`未找到 Provider: ${id}`);
    return false;
  }

  /**
   * 注册新的 Provider
   */
  register(config: ProviderConfig): Provider {
    const provider = new Provider(config);
    this.providers.set(config.id, provider);
    return provider;
  }

  /**
   * 注销 Provider
   */
  unregister(id: string): boolean {
    if (this.activeId === id) {
      console.warn(`不能注销当前活跃的 Provider: ${id}`);
      return false;
    }
    return this.providers.delete(id);
  }

  /**
   * 获取 MCP 服务器配置
   */
  getMcpServers(): Record<string, McpServerConfig> {
    const result: Record<string, McpServerConfig> = {};

    for (const source of this.sources) {
      if (!source.isAvailable()) continue;

      const servers = source.getMcpServers();
      for (const [name, config] of Object.entries(servers)) {
        if (!result[name]) {
          result[name] = config;
        }
      }
    }

    return result;
  }

  /**
   * 获取指定 Provider 的模型列表
   */
  async getModels(providerId?: string): Promise<ModelSpec[]> {
    const provider = providerId
      ? this.providers.get(providerId)
      : this.active;

    if (!provider) return [];
    return provider.getModels();
  }

  /**
   * 获取当前模型的上下文窗口
   */
  async getContextWindow(): Promise<number> {
    const provider = this.active;
    if (!provider || !provider.defaultModel) return 4096;
    return provider.getContextWindow(provider.defaultModel);
  }

  /**
   * 检查功能支持
   */
  async checkSupport(
    feature: 'vision' | 'tools' | 'streaming',
    providerId?: string,
    modelId?: string
  ): Promise<boolean> {
    const provider = providerId
      ? this.providers.get(providerId)
      : this.active;

    if (!provider) return false;

    const model = modelId || provider.defaultModel;
    if (!model) return false;

    return provider.checkSupport(model, feature);
  }

  /**
   * 预估费用
   */
  async estimateCost(
    inputTokens: number,
    outputTokens: number,
    providerId?: string,
    modelId?: string
  ): Promise<{ cost: number; currency: 'USD' | 'CNY' } | null> {
    const provider = providerId
      ? this.providers.get(providerId)
      : this.active;

    if (!provider) return null;

    const model = modelId || provider.defaultModel;
    if (!model) return null;

    return provider.estimateCost(model, inputTokens, outputTokens);
  }

  /**
   * 列出所有预设
   */
  listPresets() {
    return getPresets();
  }

  /**
   * 重新加载配置
   */
  reload(): void {
    this.providers.clear();
    this.activeId = null;
    this.loadProviders();
  }

  /**
   * 获取配置来源状态
   */
  getSourceStatus(): Array<{ name: string; available: boolean }> {
    return this.sources.map(source => ({
      name: source.name,
      available: source.isAvailable(),
    }));
  }

  // ============================================
  // 兼容性方法（向后兼容）
  // ============================================

  /**
   * 获取当前活跃的 Provider 配置
   */
  getActiveProvider(): ProviderConfig | null {
    return this.active?.toConfig() ?? null;
  }

  /**
   * 获取所有 Provider 配置
   */
  getAllProviders(): ProviderConfig[] {
    return this.all.map(p => p.toConfig());
  }

  /**
   * 切换 Provider
   */
  switchProvider(name: string, apiKey?: string): boolean {
    return this.switch(name, apiKey);
  }

  /**
   * 获取 MCP 服务器配置（别名）
   */
  getMcpServersForAgent(): Record<string, McpServerConfig> {
    return this.getMcpServers();
  }

  /**
   * 检查 CC-Switch 是否安装
   */
  isCCSwitchInstalled(): boolean {
    return this.sources.some(s => s.name === 'cc-switch' && s.isAvailable());
  }
}

// ============================================
// 单例导出
// ============================================

let _instance: ProviderManager | null = null;

/**
 * 获取全局 Provider 管理器实例
 */
export function getProviderManager(): ProviderManager {
  if (!_instance) {
    _instance = new ProviderManager();
  }
  return _instance;
}

/**
 * 创建新的 Provider 管理器实例
 */
export function createProviderManager(): ProviderManager {
  return new ProviderManager();
}

/**
 * 全局实例（便捷访问）
 */
export const providerManager = getProviderManager();

/**
 * Provider 管理器
 *
 * 统一管理所有 Provider 配置和状态
 * 使用 AI SDK 适配器和 Models.dev 元数据
 */

import type { LanguageModelV3 } from '@ai-sdk/provider';
import type { ProviderConfig, McpServerConfig, ModelSpec, ConfigSource, ProviderType } from './types.js';
import { createAdapter, adapterRegistry, getProviderType } from './adapters/index.js';
import { createConfigChain } from './sources/index.js';
import { getModelsDevClient, fetchProviderModels, fetchModelSpec } from './metadata/index.js';

/**
 * Provider 信息
 */
interface ProviderInfo {
  config: ProviderConfig;
  modelCache: ModelSpec[] | null;
  cacheTime: number;
}

/**
 * Provider 管理器
 */
export class ProviderManager {
  private providers: Map<string, ProviderInfo> = new Map();
  private activeId: string | null = null;
  private sources: ConfigSource[];
  private readonly CACHE_TTL = 3600000; // 1 小时

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
          this.providers.set(config.id, {
            config,
            modelCache: null,
            cacheTime: 0,
          });
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
   * 获取当前活跃的 Provider 配置
   */
  get active(): ProviderConfig | null {
    if (!this.activeId) return null;
    return this.providers.get(this.activeId)?.config ?? null;
  }

  /**
   * 获取所有 Provider 配置
   */
  get all(): ProviderConfig[] {
    return Array.from(this.providers.values()).map(p => p.config);
  }

  /**
   * 获取所有 Provider ID
   */
  get ids(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * 获取指定 Provider 配置
   */
  get(id: string): ProviderConfig | undefined {
    return this.providers.get(id)?.config;
  }

  /**
   * 切换 Provider
   */
  switch(id: string, apiKey?: string): boolean {
    if (!this.providers.has(id)) {
      console.error(`未找到 Provider: ${id}`);
      return false;
    }

    // 如果提供了新的 apiKey，更新配置
    if (apiKey) {
      const info = this.providers.get(id)!;
      info.config = { ...info.config, apiKey };
      // 清除模型缓存
      info.modelCache = null;
    }

    this.activeId = id;
    return true;
  }

  /**
   * 注册新的 Provider
   */
  register(config: ProviderConfig): ProviderConfig {
    this.providers.set(config.id, {
      config,
      modelCache: null,
      cacheTime: 0,
    });
    return config;
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

  // ============================================
  // AI SDK 集成方法
  // ============================================

  /**
   * 获取 AI SDK 模型实例
   *
   * @param modelId 可选的模型 ID，不提供则使用默认
   */
  getModel(modelId?: string): LanguageModelV3 | null {
    const config = this.active;
    if (!config) return null;

    const adapter = adapterRegistry.getOrCreate(config);
    return adapter.createModel(config, modelId);
  }

  /**
   * 获取指定 Provider 的 AI SDK 模型实例
   */
  getModelForProvider(providerId: string, modelId?: string): LanguageModelV3 | null {
    const config = this.providers.get(providerId)?.config;
    if (!config) return null;

    const adapter = adapterRegistry.getOrCreate(config);
    return adapter.createModel(config, modelId);
  }

  // ============================================
  // 模型元数据方法
  // ============================================

  /**
   * 获取指定 Provider 的模型列表
   */
  async getModels(providerId?: string): Promise<ModelSpec[]> {
    const id = providerId || this.activeId;
    if (!id) return [];

    const info = this.providers.get(id);
    if (!info) return [];

    // 检查缓存
    if (info.modelCache && Date.now() - info.cacheTime < this.CACHE_TTL) {
      return info.modelCache;
    }

    // 获取模型列表
    const models = await fetchProviderModels(id);
    info.modelCache = models;
    info.cacheTime = Date.now();

    return models;
  }

  /**
   * 获取模型规格（从 Models.dev）
   */
  async getModelSpec(modelId?: string): Promise<ModelSpec | undefined> {
    const config = this.active;
    if (!config) return undefined;

    const model = modelId || config.model;
    if (!model) return undefined;

    return fetchModelSpec(config.id, model);
  }

  /**
   * 获取当前模型的上下文窗口
   */
  async getContextWindow(): Promise<number> {
    const config = this.active;
    if (!config || !config.model) return 4096;

    const spec = await this.getModelSpec(config.model);
    return spec?.contextWindow || 4096;
  }

  /**
   * 检查功能支持
   */
  async checkSupport(
    feature: 'vision' | 'tools' | 'streaming',
    providerId?: string,
    modelId?: string
  ): Promise<boolean> {
    const config = providerId
      ? this.providers.get(providerId)?.config
      : this.active;

    if (!config) return false;

    const model = modelId || config.model;
    if (!model) return false;

    const spec = await fetchModelSpec(config.id, model);
    if (!spec) return false;

    switch (feature) {
      case 'vision':
        return spec.supportsVision ?? false;
      case 'tools':
        return spec.supportsTools ?? true;
      case 'streaming':
        return spec.supportsStreaming ?? true;
      default:
        return false;
    }
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
    const config = providerId
      ? this.providers.get(providerId)?.config
      : this.active;

    if (!config) return null;

    const model = modelId || config.model;
    if (!model) return null;

    const spec = await fetchModelSpec(config.id, model);
    if (!spec?.pricing) return null;

    const inputCost = (inputTokens / 1_000_000) * spec.pricing.input;
    const outputCost = (outputTokens / 1_000_000) * spec.pricing.output;

    return {
      cost: inputCost + outputCost,
      currency: spec.pricing.currency,
    };
  }

  // ============================================
  // 工具方法
  // ============================================

  /**
   * 重新加载配置
   */
  reload(): void {
    this.providers.clear();
    this.activeId = null;
    adapterRegistry.clear();
    getModelsDevClient().clearCache();
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

  /**
   * 获取 Provider 类型
   */
  getProviderType(providerId?: string): ProviderType {
    const config = providerId
      ? this.providers.get(providerId)?.config
      : this.active;

    if (!config) return 'openai-compatible';
    return config.type || getProviderType(config.id);
  }

  // ============================================
  // 兼容性方法（向后兼容）
  // ============================================

  /**
   * 获取当前活跃的 Provider 配置
   */
  getActiveProvider(): ProviderConfig | null {
    return this.active;
  }

  /**
   * 获取所有 Provider 配置
   */
  getAllProviders(): ProviderConfig[] {
    return this.all;
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

  /**
   * 应用配置到环境变量（兼容旧代码）
   *
   * @deprecated 不再需要，AI SDK 直接使用配置
   */
  applyToEnv(): void {
    const config = this.active;
    if (!config) return;

    process.env.ANTHROPIC_BASE_URL = config.baseUrl;

    if (config.apiKey) {
      process.env.ANTHROPIC_API_KEY = config.apiKey;
    }

    if (config.model) {
      process.env.ANTHROPIC_MODEL = config.model;
    }
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

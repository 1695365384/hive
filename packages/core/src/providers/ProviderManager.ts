/**
 * Provider 管理器
 *
 * 统一管理所有 Provider 配置和状态
 * 使用 AI SDK 适配器和 Models.dev 元数据
 */

import type { LanguageModelV3 } from '@ai-sdk/provider';
import type { ProviderConfig, McpServerConfig, ModelSpec, ConfigSource, ProviderType, ExternalConfig } from './types.js';
import type { ILogger } from '../plugins/types.js';
import { noopLogger } from '../plugins/types.js';
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
 * Provider 管理器配置选项
 */
export interface ProviderManagerOptions {
  /** 外部配置（优先级最高） */
  externalConfig?: ExternalConfig;
  /** 是否使用环境变量作为 fallback */
  useEnvFallback?: boolean;
  /** Logger instance (defaults to no-op) */
  logger?: ILogger;
}

/**
 * Provider 管理器
 */
export class ProviderManager {
  private providers: Map<string, ProviderInfo> = new Map();
  private activeId: string | null = null;
  private sources: ConfigSource[];
  private externalConfig: ExternalConfig | null;
  private readonly logger: ILogger;
  private readonly CACHE_TTL = 3600000; // 1 小时

  constructor(options: ProviderManagerOptions = {}) {
    this.externalConfig = options.externalConfig ?? null;
    this.logger = options.logger ?? noopLogger;

    // 如果提供了外部配置，优先使用
    if (this.externalConfig) {
      this.loadExternalConfig();
    }

    // 如果允许环境变量 fallback，加载环境变量配置
    if (options.useEnvFallback !== false) {
      this.sources = createConfigChain();
      this.loadFromSources();
    } else {
      this.sources = [];
    }

    // 设置默认 Provider
    if (!this.activeId && this.providers.size > 0) {
      this.activeId = this.externalConfig?.activeProvider
        ?? this.providers.keys().next().value
        ?? null;
    }
  }

  /**
   * 加载外部配置
   */
  private loadExternalConfig(): void {
    if (!this.externalConfig?.providers) return;

    for (const config of this.externalConfig.providers) {
      // 解析 API Key
      const resolvedConfig = this.resolveApiKey(config);
      this.providers.set(resolvedConfig.id, {
        config: resolvedConfig,
        modelCache: null,
        cacheTime: 0,
      });
    }
  }

  /**
   * 解析 API Key（支持环境变量）
   */
  private resolveApiKey(config: ProviderConfig): ProviderConfig {
    // 如果已有 apiKey，直接返回
    if (config.apiKey) return config;

    // 尝试从环境变量读取
    const envKey = config.extra?.apiKeyEnv as string ?? `${config.id.toUpperCase()}_API_KEY`;
    const apiKey = process.env[envKey];

    if (apiKey) {
      return { ...config, apiKey };
    }

    return config;
  }

  /**
   * 从配置源加载（环境变量 fallback）
   */
  private loadFromSources(): void {
    for (const source of this.sources) {
      if (!source.isAvailable()) continue;

      const configs = source.getAllProviders();
      for (const config of configs) {
        // 外部配置优先，不覆盖
        if (!this.providers.has(config.id)) {
          this.providers.set(config.id, {
            config,
            modelCache: null,
            cacheTime: 0,
          });
        }
      }
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
      this.logger.error(`未找到 Provider: ${id}`);
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
      this.logger.warn(`不能注销当前活跃的 Provider: ${id}`);
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

    // 重新加载配置
    if (this.externalConfig) {
      this.loadExternalConfig();
    }
    this.loadFromSources();

    // 重新设置默认 Provider
    if (!this.activeId && this.providers.size > 0) {
      this.activeId = this.externalConfig?.activeProvider
        ?? this.providers.keys().next().value
        ?? null;
    }
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

}

// ============================================
// 工厂函数
// ============================================

/**
 * 创建新的 Provider 管理器实例
 *
 * @param options 配置选项
 */
export function createProviderManager(options?: ProviderManagerOptions): ProviderManager {
  return new ProviderManager(options);
}

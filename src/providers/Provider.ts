/**
 * Provider 类
 *
 * 代表一个 LLM 提供商
 */

import type { ProviderConfig, ModelSpec, IProvider } from './types.js';
import { fetchModels, fetchModelDetail } from './models/fetcher.js';
import { getModelSpec as getStaticModelSpec, getProviderModels } from './models/registry.js';

/**
 * Provider 实现
 */
export class Provider implements IProvider {
  readonly id: string;
  readonly name: string;
  readonly baseUrl: string;
  readonly apiKey: string | undefined;
  readonly defaultModel: string | undefined;

  /** 模型缓存 */
  private modelCache: ModelSpec[] | null = null;
  private cacheTime: number = 0;
  private readonly CACHE_TTL = 3600000; // 1 小时

  constructor(config: ProviderConfig) {
    this.id = config.id;
    this.name = config.name;
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
    this.defaultModel = config.model;
  }

  /**
   * 从配置创建 Provider
   */
  static fromConfig(config: ProviderConfig): Provider {
    return new Provider(config);
  }

  /**
   * 应用配置到环境变量
   */
  apply(): void {
    process.env.ANTHROPIC_BASE_URL = this.baseUrl;

    if (this.apiKey) {
      process.env.ANTHROPIC_API_KEY = this.apiKey;
    }

    if (this.defaultModel) {
      process.env.ANTHROPIC_MODEL = this.defaultModel;
    }
  }

  /**
   * 获取模型列表
   *
   * 优先从 API 动态获取，失败时回退到静态注册表
   */
  async getModels(): Promise<ModelSpec[]> {
    // 检查缓存
    if (this.modelCache && Date.now() - this.cacheTime < this.CACHE_TTL) {
      return this.modelCache;
    }

    // 尝试动态获取
    if (this.apiKey) {
      try {
        const models = await fetchModels(this.id, this.baseUrl, this.apiKey);
        if (models.length > 0) {
          this.modelCache = models;
          this.cacheTime = Date.now();
          return models;
        }
      } catch (error) {
        console.warn(`动态获取模型失败 (${this.id}):`, error);
      }
    }

    // 回退到静态注册表
    const staticModels = getProviderModels(this.id);
    this.modelCache = staticModels;
    this.cacheTime = Date.now();
    return staticModels;
  }

  /**
   * 获取模型规格
   */
  async getModelSpec(modelId: string): Promise<ModelSpec | undefined> {
    // 尝试动态获取
    if (this.apiKey) {
      try {
        const spec = await fetchModelDetail(this.id, modelId, this.baseUrl, this.apiKey);
        if (spec) return spec;
      } catch {
        // 忽略错误，使用静态配置
      }
    }

    // 回退到静态注册表
    return getStaticModelSpec(this.id, modelId);
  }

  /**
   * 获取上下文窗口大小
   */
  async getContextWindow(modelId?: string): Promise<number> {
    const model = modelId || this.defaultModel;
    if (!model) return 4096;

    const spec = await this.getModelSpec(model);
    return spec?.contextWindow || 4096;
  }

  /**
   * 检查模型是否支持某功能
   */
  async checkSupport(
    modelId: string,
    feature: 'vision' | 'tools' | 'streaming'
  ): Promise<boolean> {
    const spec = await this.getModelSpec(modelId);
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
    modelId: string,
    inputTokens: number,
    outputTokens: number
  ): Promise<{ cost: number; currency: 'USD' | 'CNY' } | null> {
    const spec = await this.getModelSpec(modelId);
    if (!spec?.pricing) return null;

    const inputCost = (inputTokens / 1_000_000) * spec.pricing.input;
    const outputCost = (outputTokens / 1_000_000) * spec.pricing.output;

    return {
      cost: inputCost + outputCost,
      currency: spec.pricing.currency,
    };
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.modelCache = null;
    this.cacheTime = 0;
  }

  /**
   * 转换为 JSON
   */
  toJSON(): ProviderConfig {
    return {
      id: this.id,
      name: this.name,
      baseUrl: this.baseUrl,
      apiKey: this.apiKey,
      model: this.defaultModel,
    };
  }

  /**
   * 转换为配置对象（别名）
   */
  toConfig(): ProviderConfig {
    return this.toJSON();
  }
}

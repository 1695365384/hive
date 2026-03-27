/**
 * Models.dev 元数据客户端
 *
 * 从 models.dev 获取提供商和模型元数据
 * API 格式: https://models.dev/api.json
 */

import type {
  ModelSpec,
  ProviderType,
  ModelsDevProviderRaw,
  ModelsDevModelRaw,
  ModelsDevProvider,
  ModelsDevResponse,
} from '../types.js';
import type { ModelsDevCache, CachedProviderInfo, CachedModelInfo } from './types.js';
import type { ILogger } from '../../plugins/types.js';
import { noopLogger } from '../../plugins/types.js';

/**
 * 持久化接口
 *
 * 用于将缓存数据持久化到外部存储（如文件系统）
 */
export interface ModelsDevPersistence {
  /** 从持久化存储加载缓存 */
  load(): Promise<ModelsDevCache | null>;
  /** 保存缓存到持久化存储 */
  save(cache: ModelsDevCache): Promise<void>;
}

/**
 * Models.dev 客户端
 *
 * 获取提供商和模型元数据，带缓存和持久化支持
 */
export class ModelsDevClient {
  private static readonly API_URL = 'https://models.dev/api.json';
  private static readonly MEMORY_CACHE_TTL = 3600000; // 内存缓存 1 小时
  private static readonly FILE_CACHE_TTL = 86400000; // 文件缓存 24 小时
  private static readonly CACHE_VERSION = '1.0.0';

  private readonly logger: ILogger;
  private providersCache: Map<string, ModelsDevProvider> = new Map();
  private allProvidersCache: ModelsDevProvider[] | null = null;
  private cacheTime: number = 0;
  private fetchPromise: Promise<ModelsDevResponse> | null = null;
  private persistence: ModelsDevPersistence | null = null;

  constructor(logger?: ILogger) {
    this.logger = logger ?? noopLogger;
  }

  /**
   * 从 API 获取数据
   */
  private async fetch(): Promise<ModelsDevResponse> {
    // 防止并发请求
    if (this.fetchPromise) {
      return this.fetchPromise;
    }

    this.fetchPromise = fetch(ModelsDevClient.API_URL)
      .then(res => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return res.json();
      })
      .finally(() => {
        this.fetchPromise = null;
      });

    return this.fetchPromise;
  }

  /**
   * 推断提供商类型
   *
   * 基于 npm 包名推断
   */
  private inferProviderType(id: string, raw: ModelsDevProviderRaw): ProviderType {
    const npm = raw.npm?.toLowerCase() || '';
    const providerId = id.toLowerCase();

    // 基于 npm 包名推断
    if (npm.includes('@ai-sdk/anthropic') || providerId === 'anthropic') {
      return 'anthropic';
    }
    if (npm.includes('@ai-sdk/google') || providerId === 'google' || providerId === 'gemini') {
      return 'google';
    }
    if (npm.includes('@ai-sdk/openai') && !npm.includes('compatible')) {
      return 'openai';
    }

    // 默认为 OpenAI 兼容
    return 'openai-compatible';
  }

  /**
   * 转换 Models.dev 模型格式到内部格式
   */
  private convertModel(modelId: string, raw: ModelsDevModelRaw): ModelSpec {
    return {
      id: modelId,
      name: raw.name || modelId,
      family: raw.family,
      contextWindow: raw.limit?.context || 4096,
      maxOutputTokens: raw.limit?.output,
      supportsVision: raw.modalities?.input?.includes('image') || raw.attachment === true,
      supportsTools: raw.tool_call !== false,
      supportsStreaming: true, // 大多数模型支持流式
      supportsReasoning: raw.reasoning === true,
      inputModalities: raw.modalities?.input,
      outputModalities: raw.modalities?.output,
      pricing: raw.cost ? {
        input: raw.cost.input || 0,
        output: raw.cost.output || 0,
        cacheRead: raw.cost.cache_read,
        currency: 'USD',
      } : undefined,
    };
  }

  /**
   * 转换 Models.dev 提供商格式到内部格式
   */
  private convertProvider(providerId: string, raw: ModelsDevProviderRaw): ModelsDevProvider {
    const models: ModelSpec[] = [];

    for (const [modelId, modelRaw] of Object.entries(raw.models || {})) {
      models.push(this.convertModel(modelId, modelRaw));
    }

    return {
      id: providerId,
      name: raw.name || providerId,
      baseUrl: raw.api || '',
      envKeys: raw.env || [],
      npmPackage: raw.npm || '@ai-sdk/openai-compatible',
      docUrl: raw.doc,
      type: this.inferProviderType(providerId, raw),
      models,
    };
  }

  /**
   * 检查缓存是否有效
   */
  private isCacheValid(): boolean {
    return this.allProvidersCache !== null && Date.now() - this.cacheTime < ModelsDevClient.MEMORY_CACHE_TTL;
  }

  /**
   * 设置持久化层
   */
  setPersistence(persistence: ModelsDevPersistence): void {
    this.persistence = persistence;
  }

  /**
   * 从本地缓存加载（如果有效）
   * @param allowExpired 是否允许使用过期缓存（用于 fallback）
   */
  async loadFromCache(allowExpired = false): Promise<boolean> {
    if (!this.persistence) return false;

    try {
      const cache = await this.persistence.load();
      if (!cache) return false;

      // 检查版本
      if (cache.version !== ModelsDevClient.CACHE_VERSION) {
        return false;
      }

      // 检查是否过期（除非允许过期缓存）
      if (!allowExpired && new Date(cache.expiresAt) <= new Date()) {
        return false;
      }

      // 加载到内存缓存
      this.providersCache.clear();
      this.allProvidersCache = [];

      for (const provider of cache.providers) {
        const models: ModelSpec[] = provider.models.map(m => ({
          id: m.id,
          name: m.name,
          contextWindow: m.contextWindow,
          maxOutputTokens: m.maxOutputTokens,
          supportsVision: m.supportsVision ?? false,
          supportsTools: m.supportsTools ?? true,
          supportsStreaming: true,
        }));

        const fullProvider: ModelsDevProvider = {
          id: provider.id,
          name: provider.name,
          baseUrl: provider.baseUrl,
          type: provider.type as ProviderType,
          envKeys: provider.envKeys,
          npmPackage: provider.npmPackage || '',
          models,
        };

        this.providersCache.set(provider.id.toLowerCase(), fullProvider);
        this.allProvidersCache.push(fullProvider);
      }

      this.cacheTime = new Date(cache.fetchedAt).getTime();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 保存到本地缓存
   */
  async saveToCache(): Promise<void> {
    if (!this.persistence || !this.allProvidersCache) return;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + ModelsDevClient.FILE_CACHE_TTL);

    const cache: ModelsDevCache = {
      version: ModelsDevClient.CACHE_VERSION,
      fetchedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      providers: this.allProvidersCache.map(p => ({
        id: p.id,
        name: p.name,
        baseUrl: p.baseUrl,
        type: p.type,
        envKeys: p.envKeys,
        npmPackage: p.npmPackage,
        models: p.models.map(m => ({
          id: m.id,
          name: m.name ?? m.id,
          contextWindow: m.contextWindow,
          maxOutputTokens: m.maxOutputTokens,
          supportsVision: m.supportsVision,
          supportsTools: m.supportsTools,
        })),
      })),
    };

    try {
      await this.persistence.save(cache);
    } catch (error) {
      this.logger.warn('保存 models.dev 缓存失败:', error);
    }
  }

  /**
   * 确保数据已加载
   *
   * 优先级：内存缓存 > 本地文件缓存 > API
   */
  private async ensureLoaded(): Promise<void> {
    // 1. 检查内存缓存
    if (this.isCacheValid()) return;

    // 2. 尝试从本地缓存加载
    if (await this.loadFromCache()) return;

    // 3. 从 API 获取
    try {
      const data = await this.fetch();
      const providers: ModelsDevProvider[] = [];

      // 清除旧缓存
      this.providersCache.clear();

      // 解析提供商数据
      for (const [providerId, providerRaw] of Object.entries(data.providers || {})) {
        const provider = this.convertProvider(providerId, providerRaw);
        this.providersCache.set(providerId.toLowerCase(), provider);
        providers.push(provider);
      }

      this.allProvidersCache = providers;
      this.cacheTime = Date.now();

      // 4. 保存到本地缓存
      await this.saveToCache();
    } catch (error) {
      this.logger.warn('从 Models.dev 获取数据失败:', error);
      // 尝试使用过期的本地缓存作为 fallback
      if (await this.loadFromCache(true)) {
        this.logger.warn('使用过期的本地缓存作为 fallback');
      }
    }
  }

  /**
   * 获取所有提供商
   */
  async getAllProviders(): Promise<ModelsDevProvider[]> {
    await this.ensureLoaded();
    return this.allProvidersCache || [];
  }

  /**
   * 获取指定提供商
   */
  async getProvider(providerId: string): Promise<ModelsDevProvider | undefined> {
    await this.ensureLoaded();
    return this.providersCache.get(providerId.toLowerCase());
  }

  /**
   * 获取指定提供商的模型列表
   */
  async getProviderModels(providerId: string): Promise<ModelSpec[]> {
    const provider = await this.getProvider(providerId);
    return provider?.models || [];
  }

  /**
   * 获取模型详情
   */
  async getModel(modelId: string): Promise<ModelSpec | undefined> {
    await this.ensureLoaded();

    // 模型 ID 可能包含提供商前缀，如 "anthropic/claude-sonnet-4"
    const [providerPrefix, ...rest] = modelId.split('/');

    // 尝试直接匹配（带前缀）
    if (rest.length > 0) {
      const actualModelId = rest.join('/');
      const provider = await this.getProvider(providerPrefix);
      return provider?.models.find(m => m.id === actualModelId);
    }

    // 遍历所有提供商查找
    for (const provider of this.allProvidersCache || []) {
      const model = provider.models.find(m => m.id === modelId);
      if (model) return model;
    }

    return undefined;
  }

  /**
   * 获取已知提供商 ID 列表
   */
  async getKnownProviderIds(): Promise<string[]> {
    await this.ensureLoaded();
    return Array.from(this.providersCache.keys());
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.providersCache.clear();
    this.allProvidersCache = null;
    this.cacheTime = 0;
  }
}

// 单例实例
let _instance: ModelsDevClient | null = null;

/**
 * 获取全局 Models.dev 客户端实例
 */
export function getModelsDevClient(): ModelsDevClient {
  if (!_instance) {
    _instance = new ModelsDevClient();
  }
  return _instance;
}

/**
 * 创建新的 Models.dev 客户端实例
 */
export function createModelsDevClient(): ModelsDevClient {
  return new ModelsDevClient();
}

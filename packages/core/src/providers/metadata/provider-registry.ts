/**
 * 提供商注册表
 *
 * 从 models.dev 动态获取提供商信息，替代硬编码的 KNOWN_PROVIDERS
 */

import type { ProviderType } from '../types.js';
import type { ILogger } from '../../plugins/types.js';
import { noopLogger } from '../../plugins/types.js';
import { getModelsDevClient, type ModelsDevPersistence } from './models-dev.js';
import type { SqlitePersistence } from './sqlite-persistence.js';

/**
 * 提供商信息（用于适配器）
 */
export interface ProviderInfo {
  /** 提供商 ID */
  providerId: string;
  /** 显示名称 */
  name: string;
  /** API 基础 URL */
  baseUrl: string;
  /** 默认模型 */
  defaultModel: string;
  /** 提供商类型 */
  type: ProviderType;
  /** 环境变量 Key 列表 */
  envKeys: string[];
  /** npm 包名 */
  npmPackage: string;
  /** Logo URL */
  logo?: string;
}

/**
 * 静态 fallback 数据
 *
 * 当 models.dev 不可用时使用
 */
const STATIC_PROVIDERS: Record<string, ProviderInfo> = {
  deepseek: {
    providerId: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
    type: 'openai-compatible',
    envKeys: ['DEEPSEEK_API_KEY'],
    npmPackage: '@ai-sdk/openai-compatible',
  },
  glm: {
    providerId: 'glm',
    name: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-flash',
    type: 'openai-compatible',
    envKeys: ['GLM_API_KEY'],
    npmPackage: '@ai-sdk/openai-compatible',
  },
  qwen: {
    providerId: 'qwen',
    name: '阿里云 Qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-plus',
    type: 'openai-compatible',
    envKeys: ['QWEN_API_KEY'],
    npmPackage: '@ai-sdk/openai-compatible',
  },
  kimi: {
    providerId: 'kimi',
    name: 'Moonshot Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-8k',
    type: 'openai-compatible',
    envKeys: ['MOONSHOT_API_KEY', 'KIMI_API_KEY'],
    npmPackage: '@ai-sdk/openai-compatible',
  },
  ernie: {
    providerId: 'ernie',
    name: 'ERNIE (文心一言)',
    baseUrl: 'https://aip.baidubce.com',
    defaultModel: 'ernie-4.0-8k',
    type: 'openai-compatible',
    envKeys: ['ERNIE_API_KEY'],
    npmPackage: '@ai-sdk/openai-compatible',
  },
  openrouter: {
    providerId: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'anthropic/claude-sonnet-4',
    type: 'openai-compatible',
    envKeys: ['OPENROUTER_API_KEY'],
    npmPackage: '@ai-sdk/openai-compatible',
  },
  litellm: {
    providerId: 'litellm',
    name: 'LiteLLM',
    baseUrl: '',
    defaultModel: 'gpt-4o',
    type: 'openai-compatible',
    envKeys: ['LITELLM_API_KEY'],
    npmPackage: '@ai-sdk/openai-compatible',
  },
  groq: {
    providerId: 'groq',
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    type: 'openai-compatible',
    envKeys: ['GROQ_API_KEY'],
    npmPackage: '@ai-sdk/openai-compatible',
  },
  anthropic: {
    providerId: 'anthropic',
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-6',
    type: 'anthropic',
    envKeys: ['ANTHROPIC_API_KEY'],
    npmPackage: '@ai-sdk/anthropic',
  },
  openai: {
    providerId: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    type: 'openai',
    envKeys: ['OPENAI_API_KEY'],
    npmPackage: '@ai-sdk/openai',
  },
  google: {
    providerId: 'google',
    name: 'Google AI',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.0-flash',
    type: 'google',
    envKeys: ['GOOGLE_API_KEY', 'GEMINI_API_KEY'],
    npmPackage: '@ai-sdk/google',
  },
};

/**
 * 提供商注册表
 *
 * 动态获取提供商信息，支持缓存和 fallback
 */
class ProviderRegistryImpl {
  private readonly logger: ILogger;
  private cache: Map<string, ProviderInfo> = new Map();
  private loaded = false;
  private loadPromise: Promise<void> | null = null;
  private persistenceConfigured = false;
  private sqlitePersistence: SqlitePersistence | null = null;

  constructor(logger?: ILogger) {
    this.logger = logger ?? noopLogger;
  }

  /**
   * 设置持久化层
   *
   * 将 models.dev 数据持久化到工作空间
   */
  setPersistence(persistence: ModelsDevPersistence): void {
    const client = getModelsDevClient();
    client.setPersistence(persistence);
    this.persistenceConfigured = true;
  }

  /**
   * 设置 SQLite 持久化层（优先于 JSON 文件持久化）
   *
   * 同时将 SqlitePersistence 传递给 ModelsDevClient，
   * 并缓存引用供 getProviderInfoSync() 快速查询
   */
  setSqlitePersistence(sqlitePersistence: SqlitePersistence): void {
    this.sqlitePersistence = sqlitePersistence;
    // 同时作为 ModelsDevPersistence 传递给 ModelsDevClient
    getModelsDevClient().setPersistence(sqlitePersistence);
    this.persistenceConfigured = true;
  }

  /**
   * 获取 SQLite 持久化实例（如果有）
   */
  getSqlitePersistence(): SqlitePersistence | null {
    return this.sqlitePersistence;
  }

  /**
   * 获取第一个非 chat 模型的模型作为默认模型
   */
  private pickDefaultModel(models: { id: string }[]): string {
    if (models.length === 0) return 'gpt-4o';

    // 优先选择非 reasoning 模型
    const nonReasoning = models.find(m => !m.id.includes('reasoner'));
    if (nonReasoning) return nonReasoning.id;

    return models[0].id;
  }

  /**
   * 加载提供商数据
   */
  private async load(): Promise<void> {
    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = this.doLoad();
    return this.loadPromise;
  }

  private async doLoad(): Promise<void> {
    try {
      const client = getModelsDevClient();
      const providers = await client.getAllProviders();

      for (const provider of providers) {
        const info: ProviderInfo = {
          providerId: provider.id,
          name: provider.name,
          baseUrl: provider.baseUrl,
          defaultModel: this.pickDefaultModel(provider.models),
          type: provider.type,
          envKeys: provider.envKeys,
          npmPackage: provider.npmPackage,
          logo: provider.logo,
        };

        this.cache.set(provider.id.toLowerCase(), info);
      }

      // 将完整数据写入 SQLite（含 family、cost、modalities、reasoning 等字段）
      if (this.sqlitePersistence) {
        this.sqlitePersistence.saveFullData(providers, new Date().toISOString());
      }

      this.loaded = true;
    } catch (error) {
      this.logger.warn('从 models.dev 加载提供商失败，使用静态数据:', error);
      // 使用静态 fallback
      for (const [id, info] of Object.entries(STATIC_PROVIDERS)) {
        this.cache.set(id, info);
      }
      this.loaded = true;
    }
  }

  /**
   * 获取提供商信息（异步）
   */
  async getProviderInfo(providerId: string): Promise<ProviderInfo | null> {
    const lower = providerId.toLowerCase();

    // 先检查缓存
    if (this.cache.has(lower)) {
      return this.cache.get(lower) || null;
    }

    // 加载数据
    await this.load();

    return this.cache.get(lower) || null;
  }

  /**
   * 获取提供商信息（同步，使用缓存、SQLite 或静态数据）
   */
  getProviderInfoSync(providerId: string): ProviderInfo | null {
    const lower = providerId.toLowerCase();

    // 检查内存缓存
    if (this.cache.has(lower)) {
      return this.cache.get(lower) || null;
    }

    // 尝试从 SQLite 查询
    if (this.sqlitePersistence && this.sqlitePersistence.hasValidData()) {
      const info = this.sqlitePersistence.getProviderInfo(lower);
      if (info) {
        this.cache.set(lower, info);
        return info;
      }
    }

    // 使用静态 fallback
    return STATIC_PROVIDERS[lower] || null;
  }

  /**
   * 预热缓存
   */
  async preload(): Promise<void> {
    await this.load();
  }

  /**
   * 获取所有已知提供商 ID
   */
  async getKnownProviderIds(): Promise<string[]> {
    await this.load();
    return Array.from(this.cache.keys());
  }

  /**
   * 获取所有提供商信息
   */
  async getAllProviders(): Promise<ProviderInfo[]> {
    await this.load();
    return Array.from(this.cache.values());
  }

  /**
   * 检查是否是已知的提供商
   */
  isKnownProvider(providerId: string): boolean {
    const lower = providerId.toLowerCase();
    return this.cache.has(lower) || lower in STATIC_PROVIDERS;
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
    this.loaded = false;
    this.loadPromise = null;
  }
}

// 单例实例
const providerRegistry = new ProviderRegistryImpl();

/**
 * 获取提供商注册表实例
 */
export function getProviderRegistry(): ProviderRegistryImpl {
  return providerRegistry;
}

/**
 * 获取提供商信息（便捷函数）
 */
export async function getProviderInfo(providerId: string): Promise<ProviderInfo | null> {
  return providerRegistry.getProviderInfo(providerId);
}

/**
 * 获取提供商信息（同步版本）
 */
export function getProviderInfoSync(providerId: string): ProviderInfo | null {
  return providerRegistry.getProviderInfoSync(providerId);
}

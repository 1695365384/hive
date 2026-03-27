/**
 * Models.dev 配置来源
 *
 * 从 models.dev API 动态获取提供商配置
 * 注意：不提供 API Key，需要从其他来源（环境变量、本地配置）获取
 */

import type { ConfigSource, ProviderConfig, McpServerConfig, ModelsDevProvider } from '../types.js';
import type { ILogger } from '../../plugins/types.js';
import { noopLogger } from '../../plugins/types.js';
import { getModelsDevClient } from '../metadata/models-dev.js';

/**
 * Models.dev 配置来源
 *
 * 实现 ConfigSource 接口，从 models.dev 获取提供商信息
 */
export class ModelsDevSource implements ConfigSource {
  readonly name = 'models-dev';

  private readonly logger: ILogger;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private providers: Map<string, ProviderConfig> = new Map();

  constructor(logger?: ILogger) {
    this.logger = logger ?? noopLogger;
  }

  /**
   * 初始化 - 预加载提供商信息
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.doInitialize();
    return this.initPromise;
  }

  private async doInitialize(): Promise<void> {
    try {
      const client = getModelsDevClient();
      const allProviders = await client.getAllProviders();

      this.providers.clear();

      for (const provider of allProviders) {
        // 只添加有 baseUrl 的提供商
        if (provider.baseUrl) {
          const config: ProviderConfig = {
            id: provider.id,
            name: provider.name,
            type: provider.type,
            baseUrl: provider.baseUrl,
            model: this.pickDefaultModel(provider),
            // 不设置 apiKey，需要从其他来源获取
            enabled: true,
            description: `来自 models.dev 的 ${provider.name} 提供商`,
          };

          this.providers.set(provider.id.toLowerCase(), config);
        }
      }

      this.initialized = true;
    } catch (error) {
      this.logger.warn('Models.dev 初始化失败:', error);
      this.initialized = true; // 仍然标记为已初始化，避免重复尝试
    }
  }

  /**
   * 选择默认模型
   */
  private pickDefaultModel(provider: ModelsDevProvider): string {
    const models = provider.models;
    if (models.length === 0) return '';

    // 优先选择非 reasoning 模型
    const nonReasoning = models.find(m => !m.id.includes('reasoner') && !m.supportsReasoning);
    if (nonReasoning) return nonReasoning.id;

    return models[0].id;
  }

  /**
   * 获取单个 Provider 配置
   *
   * 同步版本，需要在初始化后调用
   */
  getProvider(id: string): ProviderConfig | null {
    const lower = id.toLowerCase();
    return this.providers.get(lower) || null;
  }

  /**
   * 获取单个 Provider 配置（异步）
   *
   * 自动初始化
   */
  async getProviderAsync(id: string): Promise<ProviderConfig | null> {
    await this.initialize();
    return this.getProvider(id);
  }

  /**
   * 获取所有 Provider 配置
   */
  getAllProviders(): ProviderConfig[] {
    return Array.from(this.providers.values());
  }

  /**
   * 获取所有 Provider 配置（异步）
   */
  async getAllProvidersAsync(): Promise<ProviderConfig[]> {
    await this.initialize();
    return this.getAllProviders();
  }

  /**
   * 获取 MCP 服务器配置
   *
   * Models.dev 不提供 MCP 配置
   */
  getMcpServers(): Record<string, McpServerConfig> {
    return {};
  }

  /**
   * 获取默认 Provider ID
   *
   * Models.dev 不指定默认
   */
  getDefaultProviderId(): string | null {
    return null;
  }

  /**
   * 检查是否可用
   */
  isAvailable(): boolean {
    return this.initialized && this.providers.size > 0;
  }

  /**
   * 获取已知提供商 ID 列表
   */
  async getKnownProviderIds(): Promise<string[]> {
    await this.initialize();
    return Array.from(this.providers.keys());
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.providers.clear();
    this.initialized = false;
    this.initPromise = null;
  }
}

/**
 * 创建 Models.dev 配置来源实例
 */
export function createModelsDevSource(): ModelsDevSource {
  return new ModelsDevSource();
}

// 单例实例
let _instance: ModelsDevSource | null = null;

/**
 * 获取全局 Models.dev 配置来源实例
 */
export function getModelsDevSource(): ModelsDevSource {
  if (!_instance) {
    _instance = new ModelsDevSource();
  }
  return _instance;
}

/**
 * Provider 管理器
 *
 * 统一管理所有 Provider 配置和状态
 * 使用 AI SDK 适配器和 Models.dev 元数据
 */

import type { LanguageModelV3 } from '@ai-sdk/provider';
import type { ProviderConfig, ConfigSource, ExternalConfig } from './types.js';
import type { ModelSpec } from './types.js';
import type { ILogger } from '../plugins/types.js';
import { noopLogger } from '../plugins/types.js';
import { adapterRegistry } from './adapters/index.js';
import { createConfigChain } from './sources/index.js';
import { getProviderInfoSync } from './metadata/provider-registry.js';
import { fetchModelSpec } from './metadata/index.js';

/**
 * Provider 信息
 */
interface ProviderInfo {
  config: ProviderConfig;
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
      // 从 Registry 补全缺失的 baseUrl、type、apiKey
      const resolvedConfig = this.resolveFromRegistry(config);
      this.providers.set(resolvedConfig.id, {
        config: resolvedConfig,
      });
    }
  }

  /**
   * 从 providers 表补全缺失配置
   *
   * providers 表是 baseUrl 和 npmPackage 的唯一来源：
   * - baseUrl: providers 表 → 适配器
   * - npmPackage: providers 表 → 适配器工厂匹配
   * - defaultModel: providers 表
   * - apiKey: 用户配置 > 环境变量(由 providers 表 envKeys 指定)
   *
   * models 表仅用于：校验模型合法性 + 获取 context window 等元数据
   */
  private resolveFromRegistry(config: ProviderConfig): ProviderConfig {
    const info = getProviderInfoSync(config.id);
    const resolved = { ...config };

    // 1. baseUrl 始终来自 providers 表（用户配置中不应包含 baseUrl）
    if (info?.baseUrl) {
      resolved.baseUrl = info.baseUrl;
    }

    // 2. npmPackage 来自 providers 表（用于适配器匹配）
    if (info?.npmPackage) {
      resolved.npmPackage = info.npmPackage;
    }

    // 3. type 来自 providers 表
    if (info?.type) {
      resolved.type = info.type;
    }

    // 4. defaultModel 来自 providers 表
    if (!resolved.model && info?.defaultModel) {
      resolved.model = info.defaultModel;
    }

    // 5. apiKey: 用户配置 > 环境变量
    if (!resolved.apiKey && info?.envKeys?.length) {
      for (const envKey of info.envKeys) {
        const apiKey = process.env[envKey];
        if (apiKey) {
          resolved.apiKey = apiKey;
          break;
        }
      }
    }

    // fallback: ${PROVIDER_ID}_API_KEY
    if (!resolved.apiKey) {
      const fallbackEnvKey = `${config.id.toUpperCase()}_API_KEY`;
      const apiKey = process.env[fallbackEnvKey];
      if (apiKey) {
        resolved.apiKey = apiKey;
      }
    }

    return resolved;
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
          const resolved = this.resolveFromRegistry(config);
          this.providers.set(resolved.id, {
            config: resolved,
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
   * 重新从 providers 表补全所有已注册的 Provider 配置
   *
   * 在 SQLite 持久化初始化后调用，确保 baseUrl、npmPackage 等
   * 从数据库获取而非使用构造时的空值。
   */
  reResolveAll(): void {
    for (const [id, info] of this.providers) {
      info.config = this.resolveFromRegistry(info.config);
    }
  }

  // ============================================
  // AI SDK 集成方法
  // ============================================

  /**
   * 获取 AI SDK 模型实例及 ModelSpec
   *
   * @param modelId 可选的模型 ID，不提供则使用默认
   * @returns 模型实例和 ModelSpec，若 Provider 不可用则返回 null
   */
  async getModelWithSpec(modelId?: string): Promise<{ model: LanguageModelV3; spec: ModelSpec | null } | null> {
    const config = this.active;
    if (!config) return null;

    const adapter = adapterRegistry.getOrCreate(config);
    const model = adapter.createModel(config, modelId);
    if (!model) return null;

    // 异步获取 ModelSpec
    let spec: ModelSpec | null = null;
    try {
      const effectiveModelId = modelId ?? config.model;
      if (effectiveModelId) {
        spec = await fetchModelSpec(config.id, effectiveModelId) ?? null;
      }
    } catch {
      // ModelSpec 获取失败不影响正常运行
    }

    return { model, spec };
  }

  /**
   * 获取 AI SDK 模型实例（同步，向后兼容）
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

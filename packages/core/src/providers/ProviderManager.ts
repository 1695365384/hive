/**
 * Provider 管理器
 *
 * 统一管理所有 Provider 配置和状态。
 * 元数据唯一来源：oh-my-pi catalog（via pi-catalog-bridge）。
 */

import type { ProviderConfig, ConfigSource, ExternalConfig } from './types.js';
import type { ModelSpec } from './types.js';
import type { ILogger } from '../plugins/types.js';
import { noopLogger } from '../plugins/types.js';
import { createConfigChain } from './sources/index.js';
import {
  getPiProviderDescriptorSync,
  getPiProviderMetaSync,
  listPiProviderModels,
  normalizeProviderId,
} from './pi-catalog-bridge.js';

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

    if (this.externalConfig) {
      this.loadExternalConfig();
    }

    if (options.useEnvFallback !== false) {
      this.sources = createConfigChain();
      this.loadFromSources();
    } else {
      this.sources = [];
    }

    if (!this.activeId && this.providers.size > 0) {
      this.activeId = this.externalConfig?.activeProvider
        ?? this.providers.keys().next().value
        ?? null;
    }
  }

  private loadExternalConfig(): void {
    if (!this.externalConfig?.providers) return;

    for (const config of this.externalConfig.providers) {
      const resolvedConfig = this.resolveFromCatalog(config);
      this.providers.set(resolvedConfig.id, {
        config: resolvedConfig,
      });
    }
  }

  /**
   * 从 pi catalog 补全缺失配置（baseUrl / type / defaultModel / apiKey）。
   */
  private resolveFromCatalog(config: ProviderConfig): ProviderConfig {
    const canonical = normalizeProviderId(config.id);
    const warmed = getPiProviderMetaSync(canonical);
    const descriptor = getPiProviderDescriptorSync(canonical);
    const resolved: ProviderConfig = {
      ...config,
      id: canonical,
      name: config.name || descriptor?.name || canonical,
    };

    const catalogBaseUrl = warmed?.baseUrl ?? descriptor?.baseUrl;
    if (catalogBaseUrl) {
      resolved.baseUrl = catalogBaseUrl;
    }

    if (warmed?.type || descriptor?.type) {
      resolved.type = warmed?.type ?? descriptor?.type;
    }

    if (!resolved.model && (warmed?.models?.[0]?.id || descriptor?.defaultModel)) {
      resolved.model = warmed?.models?.[0]?.id ?? descriptor?.defaultModel;
    }

    const envKeys = descriptor?.envKeys ?? warmed?.envKeys ?? [];
    if (!resolved.apiKey && envKeys.length) {
      for (const envKey of envKeys) {
        const apiKey = process.env[envKey];
        if (apiKey) {
          resolved.apiKey = apiKey;
          break;
        }
      }
    }

    if (!resolved.apiKey) {
      const fallbackEnvKey = `${canonical.toUpperCase().replace(/-/g, '_')}_API_KEY`;
      const apiKey = process.env[fallbackEnvKey];
      if (apiKey) {
        resolved.apiKey = apiKey;
      }
    }

    return resolved;
  }

  private loadFromSources(): void {
    for (const source of this.sources) {
      if (!source.isAvailable()) continue;

      const configs = source.getAllProviders();
      for (const config of configs) {
        if (!this.providers.has(config.id)) {
          const resolved = this.resolveFromCatalog(config);
          this.providers.set(resolved.id, {
            config: resolved,
          });
        }
      }
    }
  }

  get active(): ProviderConfig | null {
    if (!this.activeId) return null;
    return this.providers.get(this.activeId)?.config ?? null;
  }

  get all(): ProviderConfig[] {
    return Array.from(this.providers.values()).map(p => p.config);
  }

  get ids(): string[] {
    return Array.from(this.providers.keys());
  }

  get(id: string): ProviderConfig | undefined {
    return this.providers.get(id)?.config;
  }

  switch(id: string, apiKey?: string): boolean {
    const canonical = normalizeProviderId(id);
    if (!this.providers.has(canonical)) {
      this.logger.error(`未找到 Provider: ${id} (canonical: ${canonical})`);
      return false;
    }

    if (apiKey) {
      const info = this.providers.get(canonical)!;
      info.config = { ...info.config, apiKey };
    }

    this.activeId = canonical;
    return true;
  }

  register(config: ProviderConfig): ProviderConfig {
    const resolvedConfig = this.resolveFromCatalog(config);
    if (config.id !== resolvedConfig.id) {
      this.providers.delete(config.id);
    }
    this.providers.set(resolvedConfig.id, {
      config: resolvedConfig,
    });
    return resolvedConfig;
  }

  unregister(id: string): boolean {
    if (this.activeId === id) {
      this.logger.warn(`不能注销当前活跃的 Provider: ${id}`);
      return false;
    }
    return this.providers.delete(id);
  }

  /** 重新从 pi catalog 补全所有已注册 Provider（warm 后调用）。 */
  reResolveAll(): void {
    for (const [, info] of this.providers) {
      info.config = this.resolveFromCatalog(info.config);
    }
  }

  /**
   * 从 pi catalog 解析 ModelSpec（主会话 LLM 经 pi-auth-bridge，此处供元数据查询）。
   */
  async getModelSpec(providerId?: string, modelId?: string): Promise<ModelSpec | null> {
    const config = providerId
      ? this.providers.get(normalizeProviderId(providerId))?.config
      : this.active;
    if (!config) return null;

    const effectiveModelId = modelId ?? config.model;
    if (!effectiveModelId) return null;

    try {
      const models = await listPiProviderModels(config.id);
      const exact = models.find((m) => m.id === effectiveModelId);
      if (exact) return exact;
      return this.resolveProviderDefaultSpec(models);
    } catch {
      return null;
    }
  }

  private resolveProviderDefaultSpec(models: ModelSpec[]): ModelSpec | null {
    if (models.length === 0) return null;
    return {
      id: '__default__',
      contextWindow: Math.max(...models.map(p => p.contextWindow || 4096)),
      supportsTools: models.some(p => p.supportsTools),
      supportsSystemMessages: models.every(p => p.supportsSystemMessages !== false),
      supportsStreaming: models.some(p => p.supportsStreaming),
    };
  }
}

export function createProviderManager(options?: ProviderManagerOptions): ProviderManager {
  return new ProviderManager(options);
}

/**
 * OpenAI 兼容适配器
 *
 * 使用 @ai-sdk/openai 创建兼容 OpenAI API 的模型实例
 * 适用于 DeepSeek、GLM、Qwen、Kimi 等国产模型
 */

import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import type { ProviderConfig } from '../types.js';
import type { ProviderAdapter, ProviderType } from './base.js';
import { getProviderRegistry, getProviderInfoSync, type ProviderInfo } from '../metadata/provider-registry.js';

/**
 * OpenAI 兼容适配器实现
 */
export class OpenAICompatibleAdapter implements ProviderAdapter {
  readonly type: ProviderType = 'openai-compatible';

  private readonly providerKey: string;
  private cachedProviderInfo: ProviderInfo | null | undefined = undefined;

  constructor(providerKey?: string) {
    this.providerKey = providerKey?.toLowerCase() || '';
  }

  /**
   * 获取提供商信息（延迟加载）
   */
  private getProviderInfo(): ProviderInfo | null {
    if (this.cachedProviderInfo !== undefined) {
      return this.cachedProviderInfo;
    }

    // 使用同步方法获取（先从静态 fallback，可能从动态数据）
    this.cachedProviderInfo = getProviderInfoSync(this.providerKey);
    return this.cachedProviderInfo;
  }

  /**
   * 异步获取提供商信息（从 models.dev 动态加载）
   */
  private async getProviderInfoAsync(): Promise<ProviderInfo | null> {
    if (this.cachedProviderInfo !== undefined) {
      return this.cachedProviderInfo;
    }

    const registry = getProviderRegistry();
    this.cachedProviderInfo = await registry.getProviderInfo(this.providerKey);
    return this.cachedProviderInfo;
  }

  createModel(config: ProviderConfig, modelId?: string): LanguageModelV3 {
    const providerInfo = this.getProviderInfo();

    // 确定使用的模型
    const model = modelId || config.model || this.getDefaultModel();

    // 优先级：config.baseUrl > providerInfo.baseUrl
    const baseUrl = config.baseUrl || providerInfo?.baseUrl;

    if (!baseUrl) {
      throw new Error(`OpenAI 兼容适配器需要配置 baseUrl: ${config.id}`);
    }

    const openai = createOpenAI({
      baseURL: baseUrl,
      apiKey: config.apiKey,
    });

    return openai(model);
  }

  getDefaultModel(): string {
    const providerInfo = this.getProviderInfo();
    return providerInfo?.defaultModel || 'gpt-4o';
  }

  getProviderId(): string {
    const providerInfo = this.getProviderInfo();
    return providerInfo?.providerId || this.providerKey || 'unknown';
  }

  validateConfig(config: ProviderConfig): boolean {
    const providerInfo = this.getProviderInfo();
    // 需要 baseUrl（来自配置或已知提供商）和 apiKey
    return !!(config.baseUrl || providerInfo?.baseUrl) && !!config.apiKey;
  }

  /**
   * 获取提供商的 API 基础 URL
   */
  getBaseUrl(): string | undefined {
    return this.getProviderInfo()?.baseUrl;
  }

  /**
   * 获取提供商的环境变量 Key
   */
  getEnvKeys(): string[] {
    return this.getProviderInfo()?.envKeys || [];
  }
}

/**
 * 创建 OpenAI 兼容适配器实例
 */
export function createOpenAICompatibleAdapter(providerKey?: string): OpenAICompatibleAdapter {
  return new OpenAICompatibleAdapter(providerKey);
}

/**
 * 获取已知提供商列表（异步版本）
 */
export async function getKnownProviders(): Promise<string[]> {
  const registry = getProviderRegistry();
  return registry.getKnownProviderIds();
}

/**
 * 获取已知提供商列表（同步版本，使用静态数据）
 */
export function getKnownProvidersSync(): string[] {
  const registry = getProviderRegistry();
  // 返回静态 fallback 中的提供商
  return [
    'deepseek', 'glm', 'qwen', 'kimi', 'openrouter',
    'litellm', 'groq', 'anthropic', 'openai', 'google',
  ];
}

/**
 * 检查是否是已知的 OpenAI 兼容提供商
 */
export function isKnownProvider(providerId: string): boolean {
  const registry = getProviderRegistry();
  return registry.isKnownProvider(providerId);
}

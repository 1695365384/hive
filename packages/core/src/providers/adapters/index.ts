/**
 * AI SDK 适配器模块
 *
 * 提供统一的适配器工厂和类型导出
 */

import type { ProviderConfig } from '../types.js';
import type { ProviderAdapter, ProviderType, AdapterConfig } from './base.js';
import { OpenAIAdapter, createOpenAIAdapter } from './openai.js';
import { AnthropicAdapter, createAnthropicAdapter } from './anthropic.js';
import { GoogleAdapter, createGoogleAdapter } from './google.js';
import {
  OpenAICompatibleAdapter,
  createOpenAICompatibleAdapter,
  getKnownProviders,
  isKnownProvider,
} from './openai-compatible.js';

// 导出类型
export type { ProviderAdapter, ProviderType, AdapterConfig } from './base.js';

// 导出适配器类
export { OpenAIAdapter } from './openai.js';
export { AnthropicAdapter } from './anthropic.js';
export { GoogleAdapter } from './google.js';
export { OpenAICompatibleAdapter, getKnownProviders, getKnownProvidersSync, isKnownProvider } from './openai-compatible.js';

// 导出工厂函数
export { createOpenAIAdapter } from './openai.js';
export { createAnthropicAdapter } from './anthropic.js';
export { createGoogleAdapter } from './google.js';
export { createOpenAICompatibleAdapter } from './openai-compatible.js';

/**
 * 已知 Provider 类型映射
 */
const PROVIDER_TYPE_MAP: Record<string, ProviderType> = {
  anthropic: 'anthropic',
  openai: 'openai',
  google: 'google',
  gemini: 'google',
  // OpenAI 兼容的提供商
  deepseek: 'openai-compatible',
  glm: 'openai-compatible',
  qwen: 'openai-compatible',
  kimi: 'openai-compatible',
  moonshot: 'openai-compatible',
  openrouter: 'openai-compatible',
  litellm: 'openai-compatible',
  groq: 'openai-compatible',
};

/**
 * 获取 Provider 类型
 */
export function getProviderType(providerId: string): ProviderType {
  const lower = providerId.toLowerCase();
  return PROVIDER_TYPE_MAP[lower] || 'openai-compatible';
}

/**
 * 适配器工厂
 *
 * 根据 Provider ID 或类型创建相应的适配器
 */
export function createAdapter(config: ProviderConfig & { type?: ProviderType }): ProviderAdapter {
  const providerType = config.type || getProviderType(config.id);

  switch (providerType) {
    case 'openai':
      return createOpenAIAdapter();

    case 'anthropic':
      return createAnthropicAdapter();

    case 'google':
      return createGoogleAdapter();

    case 'openai-compatible':
    default:
      return createOpenAICompatibleAdapter(config.id);
  }
}

/**
 * 适配器注册表
 *
 * 缓存已创建的适配器实例
 */
class AdapterRegistry {
  private adapters: Map<string, ProviderAdapter> = new Map();

  /**
   * 获取或创建适配器
   */
  getOrCreate(config: ProviderConfig & { type?: ProviderType }): ProviderAdapter {
    const key = `${config.id}:${config.type || 'auto'}`;

    if (!this.adapters.has(key)) {
      this.adapters.set(key, createAdapter(config));
    }

    return this.adapters.get(key)!;
  }

  /**
   * 清除缓存
   */
  clear(): void {
    this.adapters.clear();
  }
}

/**
 * 全局适配器注册表
 */
export const adapterRegistry = new AdapterRegistry();

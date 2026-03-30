/**
 * AI SDK 适配器模块
 *
 * 提供统一的适配器工厂和类型导出。
 * 根据 provider 的 npm_package 匹配正确的 AI SDK 适配器。
 */

import type { ProviderConfig } from '../types.js';
import type { ProviderAdapter, ProviderType, AdapterConfig } from './base.js';
import { OpenAIAdapter, createOpenAIAdapter } from './openai.js';
import { AnthropicAdapter, createAnthropicAdapter } from './anthropic.js';
import { GoogleAdapter, createGoogleAdapter } from './google.js';
import { DeepSeekAdapter, createDeepSeekAdapter } from './deepseek.js';
import { MistralAdapter, createMistralAdapter } from './mistral.js';
import { XaiAdapter, createXaiAdapter } from './xai.js';
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
export { DeepSeekAdapter } from './deepseek.js';
export { MistralAdapter } from './mistral.js';
export { XaiAdapter } from './xai.js';
export { OpenAICompatibleAdapter, getKnownProviders, getKnownProvidersSync, isKnownProvider } from './openai-compatible.js';

// 导出工厂函数
export { createOpenAIAdapter } from './openai.js';
export { createAnthropicAdapter } from './anthropic.js';
export { createGoogleAdapter } from './google.js';
export { createDeepSeekAdapter } from './deepseek.js';
export { createMistralAdapter } from './mistral.js';
export { createXaiAdapter } from './xai.js';
export { createOpenAICompatibleAdapter } from './openai-compatible.js';

/**
 * npm 包 → 适配器工厂映射
 *
 * 优先根据 npm_package 精确匹配，找不到时走 fallback。
 */
const NPM_ADAPTER_MAP: Record<string, () => ProviderAdapter> = {
  '@ai-sdk/openai': createOpenAIAdapter,
  '@ai-sdk/anthropic': createAnthropicAdapter,
  '@ai-sdk/google': createGoogleAdapter,
  '@ai-sdk/google-vertex': createGoogleAdapter,
  '@ai-sdk/google-vertex/anthropic': createAnthropicAdapter,
  '@ai-sdk/deepseek': createDeepSeekAdapter,
  '@ai-sdk/mistral': createMistralAdapter,
  '@ai-sdk/xai': createXaiAdapter,
  '@ai-sdk/openai-compatible': createOpenAICompatibleAdapter,
};

/**
 * Provider ID → npm 包映射（用于没有 npm_package 信息的场景）
 */
const PROVIDER_NPM_MAP: Record<string, string> = {
  openai: '@ai-sdk/openai',
  anthropic: '@ai-sdk/anthropic',
  google: '@ai-sdk/google',
  gemini: '@ai-sdk/google',
  deepseek: '@ai-sdk/deepseek',
  mistral: '@ai-sdk/mistral',
  xai: '@ai-sdk/xai',
};

/**
 * 已知 Provider 类型映射（用于 getProviderType 兜底）
 */
const PROVIDER_TYPE_MAP: Record<string, ProviderType> = {
  anthropic: 'anthropic',
  openai: 'openai',
  google: 'google',
  gemini: 'google',
  deepseek: 'openai-compatible',
  mistral: 'openai-compatible',
  xai: 'openai-compatible',
  glm: 'openai-compatible',
  qwen: 'openai-compatible',
  kimi: 'openai-compatible',
  ernie: 'openai-compatible',
  moonshot: 'openai-compatible',
  openrouter: 'openai-compatible',
  litellm: 'openai-compatible',
  groq: 'openai-compatible',
};

/**
 * 获取 Provider 类型（同步兜底）
 */
export function getProviderType(providerId: string): ProviderType {
  const lower = providerId.toLowerCase();
  return PROVIDER_TYPE_MAP[lower] || 'openai-compatible';
}

/**
 * 适配器工厂
 *
 * 匹配优先级：
 * 1. npm_package → NPM_ADAPTER_MAP 精确匹配
 * 2. providerId → PROVIDER_NPM_MAP 映射
 * 3. type → switch 分支
 * 4. 兜底 → OpenAI 兼容适配器
 */
export function createAdapter(
  config: ProviderConfig & { type?: ProviderType; npmPackage?: string },
): ProviderAdapter {
  const { id, type, npmPackage } = config;
  const lower = id.toLowerCase();

  // 1. 优先按 npm_package 匹配
  if (npmPackage && NPM_ADAPTER_MAP[npmPackage]) {
    const factory = NPM_ADAPTER_MAP[npmPackage];
    // 对于 OpenAICompatibleAdapter，传入 providerKey 以便查找 baseUrl
    if (npmPackage === '@ai-sdk/openai-compatible') {
      return createOpenAICompatibleAdapter(lower);
    }
    return factory();
  }

  // 2. 按 providerId 查找 npm 包
  const mappedNpm = PROVIDER_NPM_MAP[lower];
  if (mappedNpm && NPM_ADAPTER_MAP[mappedNpm]) {
    return NPM_ADAPTER_MAP[mappedNpm]();
  }

  // 3. 按 type 分支
  const providerType = type || getProviderType(lower);
  switch (providerType) {
    case 'openai':
      return createOpenAIAdapter();
    case 'anthropic':
      return createAnthropicAdapter();
    case 'google':
      return createGoogleAdapter();
    case 'openai-compatible':
    default:
      return createOpenAICompatibleAdapter(lower);
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
  getOrCreate(config: ProviderConfig & { type?: ProviderType; npmPackage?: string }): ProviderAdapter {
    const key = `${config.id}:${config.npmPackage || config.type || 'auto'}`;

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

/**
 * Anthropic 适配器
 *
 * 使用 @ai-sdk/anthropic 创建 Anthropic 模型实例
 */

import { createAnthropic } from '@ai-sdk/anthropic';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import type { ProviderConfig } from '../types.js';
import type { ProviderAdapter, ProviderType } from './base.js';

/**
 * Anthropic 适配器实现
 */
export class AnthropicAdapter implements ProviderAdapter {
  readonly type: ProviderType = 'anthropic';

  createModel(config: ProviderConfig, modelId?: string): LanguageModelV3 {
    const model = modelId || config.model || this.getDefaultModel();

    const anthropic = createAnthropic({
      baseURL: config.baseUrl,
      apiKey: config.apiKey,
    });

    return anthropic(model);
  }

  getDefaultModel(): string {
    return 'claude-sonnet-4-6';
  }

  getProviderId(): string {
    return 'anthropic';
  }

  validateConfig(config: ProviderConfig): boolean {
    // Anthropic 需要 apiKey
    return !!config.apiKey;
  }
}

/**
 * 创建 Anthropic 适配器实例
 */
export function createAnthropicAdapter(): AnthropicAdapter {
  return new AnthropicAdapter();
}

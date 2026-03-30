/**
 * Mistral 适配器
 *
 * 使用 @ai-sdk/mistral 创建 Mistral 模型实例
 */

import { createMistral } from '@ai-sdk/mistral';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import type { ProviderConfig } from '../types.js';
import type { ProviderAdapter, ProviderType } from './base.js';

/**
 * Mistral 适配器实现
 */
export class MistralAdapter implements ProviderAdapter {
  readonly type: ProviderType = 'openai-compatible';

  createModel(config: ProviderConfig, modelId?: string): LanguageModelV3 {
    const model = modelId || config.model || this.getDefaultModel();

    const mistral = createMistral({
      baseURL: config.baseUrl,
      apiKey: config.apiKey,
    });

    return mistral(model);
  }

  getDefaultModel(): string {
    return 'mistral-large-latest';
  }

  getProviderId(): string {
    return 'mistral';
  }

  validateConfig(config: ProviderConfig): boolean {
    return !!config.apiKey;
  }
}

/**
 * 创建 Mistral 适配器实例
 */
export function createMistralAdapter(): MistralAdapter {
  return new MistralAdapter();
}

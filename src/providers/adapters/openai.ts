/**
 * OpenAI 适配器
 *
 * 使用 @ai-sdk/openai 创建 OpenAI 模型实例
 */

import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import type { ProviderConfig } from '../types.js';
import type { ProviderAdapter, ProviderType } from './base.js';

/**
 * OpenAI 适配器实现
 */
export class OpenAIAdapter implements ProviderAdapter {
  readonly type: ProviderType = 'openai';

  createModel(config: ProviderConfig, modelId?: string): LanguageModelV3 {
    const model = modelId || config.model || this.getDefaultModel();

    const openai = createOpenAI({
      baseURL: config.baseUrl,
      apiKey: config.apiKey,
    });

    return openai(model);
  }

  getDefaultModel(): string {
    return 'gpt-4o';
  }

  getProviderId(): string {
    return 'openai';
  }

  validateConfig(config: ProviderConfig): boolean {
    // OpenAI 需要 apiKey
    return !!config.apiKey;
  }
}

/**
 * 创建 OpenAI 适配器实例
 */
export function createOpenAIAdapter(): OpenAIAdapter {
  return new OpenAIAdapter();
}

/**
 * Google 适配器
 *
 * 使用 @ai-sdk/google 创建 Google Generative AI 模型实例
 */

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import type { ProviderConfig } from '../types.js';
import type { ProviderAdapter, ProviderType } from './base.js';

/**
 * Google 适配器实现
 */
export class GoogleAdapter implements ProviderAdapter {
  readonly type: ProviderType = 'google';

  createModel(config: ProviderConfig, modelId?: string): LanguageModelV3 {
    const model = modelId || config.model || this.getDefaultModel();

    const google = createGoogleGenerativeAI({
      baseURL: config.baseUrl,
      apiKey: config.apiKey,
    });

    return google(model);
  }

  getDefaultModel(): string {
    return 'gemini-2.0-flash';
  }

  getProviderId(): string {
    return 'google';
  }

  validateConfig(config: ProviderConfig): boolean {
    // Google 需要 apiKey
    return !!config.apiKey;
  }
}

/**
 * 创建 Google 适配器实例
 */
export function createGoogleAdapter(): GoogleAdapter {
  return new GoogleAdapter();
}

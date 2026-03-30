/**
 * DeepSeek 适配器
 *
 * 使用 @ai-sdk/deepseek 创建 DeepSeek 模型实例
 */

import { createDeepSeek } from '@ai-sdk/deepseek';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import type { ProviderConfig } from '../types.js';
import type { ProviderAdapter, ProviderType } from './base.js';

/**
 * DeepSeek 适配器实现
 */
export class DeepSeekAdapter implements ProviderAdapter {
  readonly type: ProviderType = 'openai-compatible';

  createModel(config: ProviderConfig, modelId?: string): LanguageModelV3 {
    const model = modelId || config.model || this.getDefaultModel();

    const deepseek = createDeepSeek({
      baseURL: config.baseUrl,
      apiKey: config.apiKey,
    });

    return deepseek(model);
  }

  getDefaultModel(): string {
    return 'deepseek-chat';
  }

  getProviderId(): string {
    return 'deepseek';
  }

  validateConfig(config: ProviderConfig): boolean {
    return !!config.apiKey;
  }
}

/**
 * 创建 DeepSeek 适配器实例
 */
export function createDeepSeekAdapter(): DeepSeekAdapter {
  return new DeepSeekAdapter();
}

/**
 * xAI 适配器
 *
 * 使用 @ai-sdk/xai 创建 xAI (Grok) 模型实例
 */

import { createXai } from '@ai-sdk/xai';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import type { ProviderConfig } from '../types.js';
import type { ProviderAdapter, ProviderType } from './base.js';

/**
 * xAI 适配器实现
 */
export class XaiAdapter implements ProviderAdapter {
  readonly type: ProviderType = 'openai-compatible';

  createModel(config: ProviderConfig, modelId?: string): LanguageModelV3 {
    const model = modelId || config.model || this.getDefaultModel();

    const xai = createXai({
      baseURL: config.baseUrl,
      apiKey: config.apiKey,
    });

    return xai(model);
  }

  getDefaultModel(): string {
    return 'grok-3';
  }

  getProviderId(): string {
    return 'xai';
  }

  validateConfig(config: ProviderConfig): boolean {
    return !!config.apiKey;
  }
}

/**
 * 创建 xAI 适配器实例
 */
export function createXaiAdapter(): XaiAdapter {
  return new XaiAdapter();
}

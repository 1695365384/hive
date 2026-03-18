/**
 * 模型信息动态获取
 *
 * 通过 API 动态获取各厂商的模型列表和规格
 */

import type { ModelSpec } from './spec.js';

/**
 * 模型获取器接口
 */
export interface ModelFetcher {
  /** 提供商 ID */
  providerId: string;
  /** 获取模型列表 */
  fetchModels(baseUrl: string, apiKey: string): Promise<ModelSpec[]>;
  /** 获取单个模型详情 */
  fetchModelDetail?(modelId: string, baseUrl: string, apiKey: string): Promise<ModelSpec | undefined>;
}

/**
 * OpenAI 兼容模型获取器
 */
class OpenAICompatibleFetcher implements ModelFetcher {
  constructor(public readonly providerId: string) {}

  async fetchModels(baseUrl: string, apiKey: string): Promise<ModelSpec[]> {
    try {
      const url = `${baseUrl}/v1/models`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      // OpenAI 格式
      if (data.data && Array.isArray(data.data)) {
        return data.data.map((m: OpenAIModel) => this.parseOpenAIModel(m));
      }

      // OpenRouter 格式
      if (Array.isArray(data)) {
        return data.map((m: OpenRouterModel) => this.parseOpenRouterModel(m));
      }

      return [];
    } catch (error) {
      console.warn(`获取模型列表失败 (${this.providerId}):`, error);
      return [];
    }
  }

  private parseOpenAIModel(model: OpenAIModel): ModelSpec {
    return {
      id: model.id,
      contextWindow: this.inferContextWindow(model.id),
      supportsVision: this.inferVision(model.id),
      supportsTools: true,
      supportsStreaming: true,
    };
  }

  private parseOpenRouterModel(model: OpenRouterModel): ModelSpec {
    return {
      id: model.id,
      name: model.name,
      contextWindow: model.context_length || this.inferContextWindow(model.id),
      maxOutputTokens: model.max_completion_tokens,
      supportsVision: !!model.top_provider?.max_image_size,
      supportsTools: true,
      supportsStreaming: true,
      pricing: model.pricing ? {
        input: model.pricing.prompt,
        output: model.pricing.completion,
        currency: 'USD',
      } : undefined,
    };
  }

  private inferContextWindow(modelId: string): number {
    const lower = modelId.toLowerCase();

    if (lower.includes('128k')) return 128000;
    if (lower.includes('32k')) return 32768;
    if (lower.includes('claude')) return 200000;
    if (lower.includes('gpt-4') || lower.includes('o1')) return 128000;
    if (lower.includes('gemini-1.5-pro')) return 2000000;
    if (lower.includes('gemini')) return 1000000;
    if (lower.includes('llama-3.1') || lower.includes('llama-3.3')) return 131072;

    return 8192;
  }

  private inferVision(modelId: string): boolean {
    const lower = modelId.toLowerCase();
    return lower.includes('vision') ||
           lower.includes('gpt-4o') ||
           lower.includes('gpt-4-turbo') ||
           lower.includes('claude') ||
           lower.includes('gemini');
  }
}

/**
 * Anthropic 获取器
 *
 * Anthropic 没有公开的模型列表 API
 */
class AnthropicFetcher implements ModelFetcher {
  readonly providerId = 'anthropic';

  async fetchModels(_baseUrl: string, _apiKey: string): Promise<ModelSpec[]> {
    // Anthropic 没有模型列表 API
    return [];
  }
}

// ============================================
// 获取器注册表
// ============================================

const FETCHERS: Record<string, ModelFetcher> = {
  anthropic: new AnthropicFetcher(),
  openai: new OpenAICompatibleFetcher('openai'),
  openrouter: new OpenAICompatibleFetcher('openrouter'),
  litellm: new OpenAICompatibleFetcher('litellm'),
  glm: new OpenAICompatibleFetcher('glm'),
  qwen: new OpenAICompatibleFetcher('qwen'),
  deepseek: new OpenAICompatibleFetcher('deepseek'),
  kimi: new OpenAICompatibleFetcher('kimi'),
  groq: new OpenAICompatibleFetcher('groq'),
};

// ============================================
// 导出函数
// ============================================

/**
 * 动态获取模型列表
 */
export async function fetchModels(
  providerId: string,
  baseUrl: string,
  apiKey: string
): Promise<ModelSpec[]> {
  const fetcher = FETCHERS[providerId.toLowerCase()];

  if (fetcher) {
    return fetcher.fetchModels(baseUrl, apiKey);
  }

  // 尝试 OpenAI 兼容方式
  const genericFetcher = new OpenAICompatibleFetcher(providerId);
  return genericFetcher.fetchModels(baseUrl, apiKey);
}

/**
 * 动态获取模型详情
 */
export async function fetchModelDetail(
  providerId: string,
  modelId: string,
  baseUrl: string,
  apiKey: string
): Promise<ModelSpec | undefined> {
  const fetcher = FETCHERS[providerId.toLowerCase()];

  if (fetcher?.fetchModelDetail) {
    return fetcher.fetchModelDetail(modelId, baseUrl, apiKey);
  }

  // 从列表中查找
  const models = await fetchModels(providerId, baseUrl, apiKey);
  return models.find(m => m.id === modelId || m.aliases?.includes(modelId));
}

/**
 * 获取模型获取器
 */
export function getModelFetcher(providerId: string): ModelFetcher | undefined {
  return FETCHERS[providerId.toLowerCase()];
}

// ============================================
// 类型定义
// ============================================

interface OpenAIModel {
  id: string;
  object: string;
  created?: number;
  owned_by?: string;
}

interface OpenRouterModel {
  id: string;
  name?: string;
  context_length?: number;
  max_completion_tokens?: number;
  pricing?: {
    prompt: number;
    completion: number;
  };
  top_provider?: {
    max_image_size?: number;
  };
}

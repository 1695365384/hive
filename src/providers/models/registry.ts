/**
 * 模型规格静态注册表
 *
 * 作为动态获取失败时的 fallback
 */

import type { ModelSpec } from './spec.js';

// ============================================
// 各厂商模型规格
// ============================================

const ANTHROPIC_MODELS: ModelSpec[] = [
  {
    id: 'claude-opus-4-6',
    name: 'Claude Opus 4.6',
    contextWindow: 200000,
    maxOutputTokens: 32000,
    supportsVision: true,
    supportsTools: true,
    supportsStreaming: true,
    pricing: { input: 15, output: 75, currency: 'USD' },
  },
  {
    id: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    contextWindow: 200000,
    maxOutputTokens: 16000,
    supportsVision: true,
    supportsTools: true,
    supportsStreaming: true,
    pricing: { input: 3, output: 15, currency: 'USD' },
  },
  {
    id: 'claude-haiku-4-5',
    name: 'Claude Haiku 4.5',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    supportsVision: true,
    supportsTools: true,
    supportsStreaming: true,
    pricing: { input: 0.8, output: 4, currency: 'USD' },
    aliases: ['claude-3-5-haiku'],
  },
];

const OPENAI_MODELS: ModelSpec[] = [
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    supportsVision: true,
    supportsTools: true,
    supportsStreaming: true,
    pricing: { input: 5, output: 15, currency: 'USD' },
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    supportsVision: true,
    supportsTools: true,
    supportsStreaming: true,
    pricing: { input: 0.15, output: 0.6, currency: 'USD' },
  },
  {
    id: 'o1',
    name: 'o1',
    contextWindow: 200000,
    maxOutputTokens: 100000,
    supportsVision: true,
    supportsTools: false,
    supportsStreaming: false,
    pricing: { input: 15, output: 60, currency: 'USD' },
  },
  {
    id: 'o1-mini',
    name: 'o1 Mini',
    contextWindow: 128000,
    maxOutputTokens: 65536,
    supportsVision: false,
    supportsTools: false,
    supportsStreaming: false,
    pricing: { input: 3, output: 12, currency: 'USD' },
  },
];

const GLM_MODELS: ModelSpec[] = [
  {
    id: 'glm-4-plus',
    name: 'GLM-4 Plus',
    contextWindow: 128000,
    maxOutputTokens: 4096,
    supportsTools: true,
    pricing: { input: 50, output: 50, currency: 'CNY' },
  },
  {
    id: 'glm-4-air',
    name: 'GLM-4 Air',
    contextWindow: 128000,
    maxOutputTokens: 4096,
    supportsTools: true,
    pricing: { input: 1, output: 1, currency: 'CNY' },
  },
  {
    id: 'glm-4-flash',
    name: 'GLM-4 Flash',
    contextWindow: 128000,
    maxOutputTokens: 4096,
    supportsTools: true,
    pricing: { input: 0.1, output: 0.1, currency: 'CNY' },
  },
];

const QWEN_MODELS: ModelSpec[] = [
  {
    id: 'qwen-max',
    name: '通义千问 Max',
    contextWindow: 32768,
    maxOutputTokens: 8192,
    supportsTools: true,
    pricing: { input: 40, output: 120, currency: 'CNY' },
  },
  {
    id: 'qwen-plus',
    name: '通义千问 Plus',
    contextWindow: 128000,
    maxOutputTokens: 6144,
    supportsTools: true,
    pricing: { input: 4, output: 12, currency: 'CNY' },
  },
  {
    id: 'qwen-turbo',
    name: '通义千问 Turbo',
    contextWindow: 128000,
    maxOutputTokens: 6144,
    supportsTools: true,
    pricing: { input: 2, output: 6, currency: 'CNY' },
  },
];

const DEEPSEEK_MODELS: ModelSpec[] = [
  {
    id: 'deepseek-chat',
    name: 'DeepSeek Chat',
    contextWindow: 64000,
    maxOutputTokens: 4096,
    supportsTools: true,
    pricing: { input: 1, output: 2, currency: 'CNY' },
    aliases: ['deepseek-v3'],
  },
  {
    id: 'deepseek-reasoner',
    name: 'DeepSeek Reasoner',
    contextWindow: 64000,
    maxOutputTokens: 8192,
    supportsTools: false,
    pricing: { input: 4, output: 16, currency: 'CNY' },
    aliases: ['deepseek-r1'],
  },
];

const KIMI_MODELS: ModelSpec[] = [
  {
    id: 'moonshot-v1-8k',
    name: 'Moonshot V1 8K',
    contextWindow: 8192,
    maxOutputTokens: 4096,
    supportsTools: true,
    pricing: { input: 12, output: 12, currency: 'CNY' },
  },
  {
    id: 'moonshot-v1-32k',
    name: 'Moonshot V1 32K',
    contextWindow: 32768,
    maxOutputTokens: 4096,
    supportsTools: true,
    pricing: { input: 24, output: 24, currency: 'CNY' },
  },
  {
    id: 'moonshot-v1-128k',
    name: 'Moonshot V1 128K',
    contextWindow: 131072,
    maxOutputTokens: 4096,
    supportsTools: true,
    pricing: { input: 60, output: 60, currency: 'CNY' },
  },
];

// ============================================
// 注册表
// ============================================

const REGISTRY: Record<string, ModelSpec[]> = {
  anthropic: ANTHROPIC_MODELS,
  openai: OPENAI_MODELS,
  glm: GLM_MODELS,
  qwen: QWEN_MODELS,
  deepseek: DEEPSEEK_MODELS,
  kimi: KIMI_MODELS,
};

// ============================================
// 导出函数
// ============================================

/**
 * 获取提供商的模型列表
 */
export function getProviderModels(providerId: string): ModelSpec[] {
  return REGISTRY[providerId.toLowerCase()] || [];
}

/**
 * 获取模型规格
 */
export function getModelSpec(providerId: string, modelId: string): ModelSpec | undefined {
  const models = getProviderModels(providerId);
  return models.find(m =>
    m.id === modelId ||
    m.aliases?.includes(modelId)
  );
}

/**
 * 获取上下文窗口大小
 */
export function getContextWindow(providerId: string, modelId: string): number {
  const spec = getModelSpec(providerId, modelId);
  return spec?.contextWindow || 4096;
}

/**
 * 检查模型功能支持
 */
export function checkModelSupport(
  providerId: string,
  modelId: string,
  feature: 'vision' | 'tools' | 'streaming'
): boolean {
  const spec = getModelSpec(providerId, modelId);
  if (!spec) return false;

  switch (feature) {
    case 'vision':
      return spec.supportsVision ?? false;
    case 'tools':
      return spec.supportsTools ?? true;
    case 'streaming':
      return spec.supportsStreaming ?? true;
    default:
      return false;
  }
}

/**
 * 预估费用
 */
export function estimateCost(
  providerId: string,
  modelId: string,
  inputTokens: number,
  outputTokens: number
): { cost: number; currency: 'USD' | 'CNY' } | null {
  const spec = getModelSpec(providerId, modelId);
  if (!spec?.pricing) return null;

  const inputCost = (inputTokens / 1_000_000) * spec.pricing.input;
  const outputCost = (outputTokens / 1_000_000) * spec.pricing.output;

  return {
    cost: inputCost + outputCost,
    currency: spec.pricing.currency,
  };
}

/**
 * 获取所有模型
 */
export function getAllModels(): Array<{ providerId: string; model: ModelSpec }> {
  const result: Array<{ providerId: string; model: ModelSpec }> = [];

  for (const [providerId, models] of Object.entries(REGISTRY)) {
    for (const model of models) {
      result.push({ providerId, model });
    }
  }

  return result;
}

/**
 * 搜索模型
 */
export function searchModels(query: string): Array<{ providerId: string; model: ModelSpec }> {
  const lower = query.toLowerCase();

  return getAllModels().filter(({ model }) =>
    model.id.toLowerCase().includes(lower) ||
    model.name?.toLowerCase().includes(lower) ||
    model.aliases?.some(a => a.toLowerCase().includes(lower))
  );
}

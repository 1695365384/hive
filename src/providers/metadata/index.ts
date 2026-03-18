/**
 * 模型元数据模块
 *
 * 提供模型元数据获取功能
 */

import type { ModelSpec } from '../types.js';
import {
  ModelsDevClient,
  getModelsDevClient,
  createModelsDevClient,
} from './models-dev.js';
import type { ModelsDevPersistence } from './models-dev.js';
import {
  getProviderRegistry,
  getProviderInfo,
  getProviderInfoSync,
} from './provider-registry.js';
import type { ProviderInfo } from './provider-registry.js';

// 导出 ModelsDevClient
export { ModelsDevClient, getModelsDevClient, createModelsDevClient } from './models-dev.js';
export type { ModelsDevPersistence } from './models-dev.js';

// 导出工作空间持久化
export { WorkspacePersistence, createWorkspacePersistence } from './workspace-persistence.js';

// 导出 ProviderRegistry
export {
  getProviderRegistry,
  getProviderInfo,
  getProviderInfoSync,
} from './provider-registry.js';
export type { ProviderInfo } from './provider-registry.js';

/**
 * 静态模型元数据（作为 fallback）
 *
 * 当 Models.dev 不可用时使用
 */
const STATIC_MODELS: Record<string, ModelSpec[]> = {
  anthropic: [
    {
      id: 'claude-opus-4-6',
      name: 'Claude Opus 4.6',
      contextWindow: 200000,
      maxOutputTokens: 32000,
      supportsVision: true,
      supportsTools: true,
      pricing: { input: 15, output: 75, currency: 'USD' },
    },
    {
      id: 'claude-sonnet-4-6',
      name: 'Claude Sonnet 4.6',
      contextWindow: 200000,
      maxOutputTokens: 16000,
      supportsVision: true,
      supportsTools: true,
      pricing: { input: 3, output: 15, currency: 'USD' },
    },
    {
      id: 'claude-haiku-4-5',
      name: 'Claude Haiku 4.5',
      contextWindow: 200000,
      maxOutputTokens: 8192,
      supportsVision: true,
      supportsTools: true,
      pricing: { input: 0.8, output: 4, currency: 'USD' },
      aliases: ['claude-3-5-haiku'],
    },
  ],
  openai: [
    {
      id: 'gpt-4o',
      name: 'GPT-4o',
      contextWindow: 128000,
      maxOutputTokens: 16384,
      supportsVision: true,
      supportsTools: true,
      pricing: { input: 5, output: 15, currency: 'USD' },
    },
    {
      id: 'gpt-4o-mini',
      name: 'GPT-4o Mini',
      contextWindow: 128000,
      maxOutputTokens: 16384,
      supportsVision: true,
      supportsTools: true,
      pricing: { input: 0.15, output: 0.6, currency: 'USD' },
    },
  ],
  deepseek: [
    {
      id: 'deepseek-chat',
      name: 'DeepSeek Chat',
      contextWindow: 64000,
      maxOutputTokens: 4096,
      supportsTools: true,
      pricing: { input: 1, output: 2, currency: 'CNY' },
    },
    {
      id: 'deepseek-reasoner',
      name: 'DeepSeek Reasoner',
      contextWindow: 64000,
      maxOutputTokens: 8192,
      supportsTools: false,
      pricing: { input: 4, output: 16, currency: 'CNY' },
    },
  ],
  glm: [
    {
      id: 'glm-4-flash',
      name: 'GLM-4 Flash',
      contextWindow: 128000,
      maxOutputTokens: 4096,
      supportsTools: true,
      pricing: { input: 0.1, output: 0.1, currency: 'CNY' },
    },
  ],
};

/**
 * 获取静态模型列表（fallback）
 */
export function getStaticModels(providerId: string): ModelSpec[] {
  return STATIC_MODELS[providerId.toLowerCase()] || [];
}

/**
 * 获取模型元数据
 *
 * 优先从 Models.dev 获取，失败时回退到静态数据
 */
export async function fetchModelSpec(providerId: string, modelId: string): Promise<ModelSpec | undefined> {
  // 尝试从 Models.dev 获取
  try {
    const client = getModelsDevClient();
    const model = await client.getModel(modelId);
    if (model) return model;
  } catch {
    // 忽略错误，使用静态数据
  }

  // 回退到静态数据
  const staticModels = getStaticModels(providerId);
  return staticModels.find(m => m.id === modelId || m.aliases?.includes(modelId));
}

/**
 * 获取 Provider 的模型列表
 *
 * 优先从 Models.dev 获取，失败时回退到静态数据
 */
export async function fetchProviderModels(providerId: string): Promise<ModelSpec[]> {
  // 尝试从 Models.dev 获取
  try {
    const client = getModelsDevClient();
    const models = await client.getProviderModels(providerId);
    if (models.length > 0) return models;
  } catch {
    // 忽略错误，使用静态数据
  }

  // 回退到静态数据
  return getStaticModels(providerId);
}

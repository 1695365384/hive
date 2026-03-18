/**
 * 聚合网关预设配置
 */

import type { ProviderPreset } from '../types.js';

export const GATEWAY_PRESETS: ProviderPreset[] = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    envKey: 'OPENROUTER_API_KEY',
    defaultModel: 'anthropic/claude-sonnet-4',
    category: 'gateway',
    description: 'OpenRouter 聚合网关 - 支持 100+ 模型',
    models: [
      {
        id: 'anthropic/claude-opus-4',
        contextWindow: 200000,
        maxOutputTokens: 32000,
        supportsVision: true,
        supportsTools: true,
      },
      {
        id: 'anthropic/claude-sonnet-4',
        contextWindow: 200000,
        maxOutputTokens: 16000,
        supportsVision: true,
        supportsTools: true,
      },
      {
        id: 'openai/gpt-4o',
        contextWindow: 128000,
        maxOutputTokens: 16384,
        supportsVision: true,
        supportsTools: true,
      },
      {
        id: 'google/gemini-pro-1.5',
        contextWindow: 2800000,
        maxOutputTokens: 8192,
        supportsVision: true,
        supportsTools: true,
      },
      {
        id: 'meta-llama/llama-3.1-405b',
        contextWindow: 131072,
        maxOutputTokens: 4096,
        supportsTools: true,
      },
    ],
  },
  {
    id: 'litellm',
    name: 'LiteLLM',
    baseUrl: 'http://localhost:4000', // 默认本地
    envKey: 'LITELLM_API_KEY',
    defaultModel: 'gpt-4o',
    category: 'gateway',
    description: 'LiteLLM 本地代理网关',
  },
  {
    id: 'together',
    name: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    envKey: 'TOGETHER_API_KEY',
    defaultModel: 'meta-llama/Llama-3-70b-chat-hf',
    category: 'gateway',
    description: 'Together AI 开源模型托管',
  },
  {
    id: 'groq',
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    envKey: 'GROQ_API_KEY',
    defaultModel: 'llama-3.3-70b-versatile',
    category: 'gateway',
    description: 'Groq 超快推理平台',
    models: [
      {
        id: 'llama-3.3-70b-versatile',
        contextWindow: 131072,
        maxOutputTokens: 8192,
        supportsTools: true,
      },
      {
        id: 'llama-3.1-8b-instant',
        contextWindow: 131072,
        maxOutputTokens: 8192,
        supportsTools: true,
      },
      {
        id: 'mixtral-8x7b-32768',
        contextWindow: 32768,
        maxOutputTokens: 4096,
        supportsTools: true,
      },
    ],
  },
  {
    id: 'cerebras',
    name: 'Cerebras',
    baseUrl: 'https://api.cerebras.ai/v1',
    envKey: 'CEREBRAS_API_KEY',
    defaultModel: 'llama3.1-70b',
    category: 'gateway',
    description: 'Cerebras 极速推理',
  },
];

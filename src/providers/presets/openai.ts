/**
 * OpenAI 系列预设配置
 */

import type { ProviderPreset } from '../types.js';

export const OPENAI_PRESETS: ProviderPreset[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    envKey: 'OPENAI_API_KEY',
    defaultModel: 'gpt-4o',
    category: 'openai',
    description: 'OpenAI 官方 API',
    models: [
      {
        id: 'gpt-4o',
        contextWindow: 128000,
        maxOutputTokens: 16384,
        supportsVision: true,
        supportsTools: true,
        pricing: { input: 5, output: 15, currency: 'USD' },
      },
      {
        id: 'gpt-4o-mini',
        contextWindow: 128000,
        maxOutputTokens: 16384,
        supportsVision: true,
        supportsTools: true,
        pricing: { input: 0.15, output: 0.6, currency: 'USD' },
      },
      {
        id: 'o1',
        contextWindow: 200000,
        maxOutputTokens: 100000,
        supportsVision: true,
        supportsTools: false,
        pricing: { input: 15, output: 60, currency: 'USD' },
      },
      {
        id: 'o1-mini',
        contextWindow: 128000,
        maxOutputTokens: 65536,
        supportsVision: false,
        supportsTools: false,
        pricing: { input: 3, output: 12, currency: 'USD' },
      },
    ],
  },
  {
    id: 'azure-openai',
    name: 'Azure OpenAI',
    baseUrl: '', // 需要用户配置
    envKey: 'AZURE_OPENAI_API_KEY',
    defaultModel: 'gpt-4o',
    category: 'openai',
    description: 'Azure OpenAI 服务',
  },
];

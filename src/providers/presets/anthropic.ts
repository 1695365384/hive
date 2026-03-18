/**
 * Anthropic 预设配置
 */

import type { ProviderPreset } from '../types.js';

export const ANTHROPIC_PRESETS: ProviderPreset[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    envKey: 'ANTHROPIC_API_KEY',
    defaultModel: 'claude-sonnet-4-6',
    category: 'anthropic',
    description: 'Anthropic 官方 API',
    models: [
      {
        id: 'claude-opus-4-6',
        contextWindow: 200000,
        maxOutputTokens: 32000,
        supportsVision: true,
        supportsTools: true,
        pricing: { input: 15, output: 75, currency: 'USD' },
      },
      {
        id: 'claude-sonnet-4-6',
        contextWindow: 200000,
        maxOutputTokens: 16000,
        supportsVision: true,
        supportsTools: true,
        pricing: { input: 3, output: 15, currency: 'USD' },
      },
      {
        id: 'claude-haiku-4-5',
        contextWindow: 200000,
        maxOutputTokens: 8192,
        supportsVision: true,
        supportsTools: true,
        pricing: { input: 0.8, output: 4, currency: 'USD' },
        aliases: ['claude-3-5-haiku'],
      },
    ],
  },
];

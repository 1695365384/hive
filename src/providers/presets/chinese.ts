/**
 * 国产模型预设配置
 */

import type { ProviderPreset } from '../types.js';

export const CHINESE_PRESETS: ProviderPreset[] = [
  {
    id: 'glm',
    name: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    envKey: 'GLM_API_KEY',
    defaultModel: 'glm-4-plus',
    category: 'chinese',
    description: '智谱清言 GLM 系列模型',
    models: [
      {
        id: 'glm-4-plus',
        contextWindow: 128000,
        maxOutputTokens: 4096,
        supportsTools: true,
        pricing: { input: 50, output: 50, currency: 'CNY' },
      },
      {
        id: 'glm-4-air',
        contextWindow: 128000,
        maxOutputTokens: 4096,
        supportsTools: true,
        pricing: { input: 1, output: 1, currency: 'CNY' },
      },
      {
        id: 'glm-4-flash',
        contextWindow: 128000,
        maxOutputTokens: 4096,
        supportsTools: true,
        pricing: { input: 0.1, output: 0.1, currency: 'CNY' },
      },
    ],
  },
  {
    id: 'qwen',
    name: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    envKey: 'QWEN_API_KEY',
    defaultModel: 'qwen-max',
    category: 'chinese',
    description: '阿里通义千问系列模型',
    models: [
      {
        id: 'qwen-max',
        contextWindow: 32768,
        maxOutputTokens: 8192,
        supportsTools: true,
        pricing: { input: 40, output: 120, currency: 'CNY' },
      },
      {
        id: 'qwen-plus',
        contextWindow: 128000,
        maxOutputTokens: 6144,
        supportsTools: true,
        pricing: { input: 4, output: 12, currency: 'CNY' },
      },
      {
        id: 'qwen-turbo',
        contextWindow: 128000,
        maxOutputTokens: 6144,
        supportsTools: true,
        pricing: { input: 2, output: 6, currency: 'CNY' },
      },
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    envKey: 'DEEPSEEK_API_KEY',
    defaultModel: 'deepseek-chat',
    category: 'chinese',
    description: 'DeepSeek 深度求索',
    models: [
      {
        id: 'deepseek-chat',
        contextWindow: 64000,
        maxOutputTokens: 4096,
        supportsTools: true,
        pricing: { input: 1, output: 2, currency: 'CNY' },
        aliases: ['deepseek-v3'],
      },
      {
        id: 'deepseek-reasoner',
        contextWindow: 64000,
        maxOutputTokens: 8192,
        supportsTools: false,
        pricing: { input: 4, output: 16, currency: 'CNY' },
        aliases: ['deepseek-r1'],
      },
    ],
  },
  {
    id: 'kimi',
    name: 'Kimi (月之暗面)',
    baseUrl: 'https://api.moonshot.cn/v1',
    envKey: 'KIMI_API_KEY',
    defaultModel: 'moonshot-v1-8k',
    category: 'chinese',
    description: 'Kimi 月之暗面 Moonshot',
    models: [
      {
        id: 'moonshot-v1-8k',
        contextWindow: 8192,
        maxOutputTokens: 4096,
        supportsTools: true,
        pricing: { input: 12, output: 12, currency: 'CNY' },
      },
      {
        id: 'moonshot-v1-32k',
        contextWindow: 32768,
        maxOutputTokens: 4096,
        supportsTools: true,
        pricing: { input: 24, output: 24, currency: 'CNY' },
      },
      {
        id: 'moonshot-v1-128k',
        contextWindow: 131072,
        maxOutputTokens: 4096,
        supportsTools: true,
        pricing: { input: 60, output: 60, currency: 'CNY' },
      },
    ],
  },
  {
    id: 'ernie',
    name: '文心一言',
    baseUrl: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat',
    envKey: 'ERNIE_API_KEY',
    defaultModel: 'ernie-4.0-8k',
    category: 'chinese',
    description: '百度文心一言',
  },
  {
    id: 'spark',
    name: '讯飞星火',
    baseUrl: 'https://spark-api-open.xf-yun.com/v1',
    envKey: 'SPARK_API_KEY',
    defaultModel: 'generalv3.5',
    category: 'chinese',
    description: '讯飞星火认知大模型',
  },
];

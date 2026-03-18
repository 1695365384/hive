/**
 * 提供商预设配置
 *
 * 内置主流 LLM 提供商的 API 配置，遵循 Anthropic 兼容端点规范。
 * 这些配置与 CC-Switch 兼容，可直接导入或作为参考。
 */

import { CCProvider } from './cc-switch-provider.js';

// ============================================
// 提供商预设定义
// ============================================

/**
 * 国产 LLM 提供商
 */
export const CHINESE_PROVIDERS: Record<string, Partial<CCProvider>> = {
  // 智谱 GLM
  glm: {
    id: 'glm',
    app_id: 'claude-code',
    name: 'GLM (智谱)',
    base_url: 'https://open.bigmodel.cn/api/anthropic',
    config: {
      models: ['glm-5', 'glm-4.7', 'glm-4-plus', 'glm-4-flash'],
      defaultModel: 'glm-5',
      description: '智谱清言大模型，支持长文本、多模态',
      features: ['streaming', 'tools', 'vision'],
    },
  },

  // 阿里云通义千问
  qwen: {
    id: 'qwen',
    app_id: 'claude-code',
    name: 'Qwen (通义千问)',
    base_url: 'https://dashscope.aliyuncs.com/apps/anthropic',
    config: {
      models: ['qwen3-max', 'qwen3-72b', 'qwen3-32b', 'qwen-plus', 'qwen-turbo'],
      defaultModel: 'qwen3-max',
      description: '阿里云通义千问大模型',
      features: ['streaming', 'tools', 'vision', 'long-context'],
    },
  },

  // DeepSeek
  deepseek: {
    id: 'deepseek',
    app_id: 'claude-code',
    name: 'DeepSeek',
    base_url: 'https://api.deepseek.com/anthropic',
    config: {
      models: ['deepseek-chat', 'deepseek-reasoner'],
      defaultModel: 'deepseek-chat',
      description: 'DeepSeek 大模型，性价比高',
      features: ['streaming', 'tools'],
    },
  },

  // 月之暗面 Kimi
  kimi: {
    id: 'kimi',
    app_id: 'claude-code',
    name: 'Kimi (月之暗面)',
    base_url: 'https://api.moonshot.cn/anthropic',
    config: {
      models: ['moonshot-v1-128k', 'moonshot-v1-32k', 'moonshot-v1-8k'],
      defaultModel: 'moonshot-v1-128k',
      description: 'Kimi 大模型，超长上下文支持',
      features: ['streaming', 'tools', 'long-context'],
    },
  },

  // 百度文心一言
  ernie: {
    id: 'ernie',
    app_id: 'claude-code',
    name: 'ERNIE (文心一言)',
    base_url: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/anthropic',
    config: {
      models: ['ernie-4.0-8k', 'ernie-4.0-turbo-8k', 'ernie-3.5-8k'],
      defaultModel: 'ernie-4.0-8k',
      description: '百度文心一言大模型',
      features: ['streaming', 'tools'],
    },
  },

  // 讯飞星火
  spark: {
    id: 'spark',
    app_id: 'claude-code',
    name: 'Spark (讯飞星火)',
    base_url: 'https://spark-api-open.xf-yun.com/v1/anthropic',
    config: {
      models: ['spark-v4.0', 'spark-v3.5', 'spark-v3.0'],
      defaultModel: 'spark-v4.0',
      description: '讯飞星火认知大模型',
      features: ['streaming', 'tools'],
    },
  },
};

/**
 * OpenAI 系列提供商
 */
export const OPENAI_SERIES_PROVIDERS: Record<string, Partial<CCProvider>> = {
  // OpenAI 官方
  openai: {
    id: 'openai',
    app_id: 'claude-code',
    name: 'OpenAI',
    base_url: 'https://api.openai.com/v1',
    config: {
      models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
      defaultModel: 'gpt-4o',
      description: 'OpenAI GPT 系列模型',
      features: ['streaming', 'tools', 'vision'],
      note: '需要使用兼容层如 LiteLLM 或 OpenRouter 转换为 Anthropic 格式',
    },
  },

  // Azure OpenAI
  azure_openai: {
    id: 'azure_openai',
    app_id: 'claude-code',
    name: 'Azure OpenAI',
    base_url: '', // 用户需要填入自己的 Azure endpoint
    config: {
      models: ['gpt-4o', 'gpt-4-turbo', 'gpt-35-turbo'],
      defaultModel: 'gpt-4o',
      description: 'Azure OpenAI 服务',
      features: ['streaming', 'tools', 'vision'],
      note: 'base_url 需要设置为你的 Azure endpoint',
    },
  },
};

/**
 * 聚合/网关提供商
 */
export const GATEWAY_PROVIDERS: Record<string, Partial<CCProvider>> = {
  // OpenRouter
  openrouter: {
    id: 'openrouter',
    app_id: 'claude-code',
    name: 'OpenRouter',
    base_url: 'https://openrouter.ai/api/v1',
    config: {
      models: [
        'anthropic/claude-opus-4',
        'anthropic/claude-sonnet-4',
        'openai/gpt-4o',
        'google/gemini-pro-1.5',
        'meta-llama/llama-3.1-405b-instruct',
        'deepseek/deepseek-chat',
        'qwen/qwen-2.5-72b-instruct',
      ],
      defaultModel: 'anthropic/claude-sonnet-4',
      description: 'OpenRouter 聚合网关，支持 100+ 模型',
      features: ['streaming', 'tools', 'multi-provider'],
    },
  },

  // LiteLLM
  litellm: {
    id: 'litellm',
    app_id: 'claude-code',
    name: 'LiteLLM',
    base_url: 'http://localhost:4000', // 默认本地部署
    config: {
      models: ['*'], // LiteLLM 支持动态模型
      defaultModel: 'gpt-4o',
      description: 'LiteLLM 统一网关，需要自行部署',
      features: ['streaming', 'tools', 'multi-provider', 'self-hosted'],
      note: '需要自行部署 LiteLLM 服务',
    },
  },

  // Together AI
  together: {
    id: 'together',
    app_id: 'claude-code',
    name: 'Together AI',
    base_url: 'https://api.together.xyz/v1',
    config: {
      models: [
        'meta-llama/Llama-3.3-70B-Instruct-Turbo',
        'meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo',
        'Qwen/Qwen2.5-72B-Instruct-Turbo',
      ],
      defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
      description: 'Together AI 开源模型推理平台',
      features: ['streaming', 'tools'],
    },
  },
};

/**
 * Anthropic 官方
 */
export const ANTHROPIC_PROVIDERS: Record<string, Partial<CCProvider>> = {
  anthropic: {
    id: 'anthropic',
    app_id: 'claude-code',
    name: 'Anthropic (官方)',
    base_url: 'https://api.anthropic.com',
    config: {
      models: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5'],
      defaultModel: 'claude-sonnet-4-6',
      description: 'Anthropic Claude 官方 API',
      features: ['streaming', 'tools', 'vision', 'thinking'],
    },
  },
};

// ============================================
// 全部预设聚合
// ============================================

/**
 * 所有提供商预设
 */
export const ALL_PRESETS: Record<string, Partial<CCProvider>> = {
  ...ANTHROPIC_PROVIDERS,
  ...CHINESE_PROVIDERS,
  ...OPENAI_SERIES_PROVIDERS,
  ...GATEWAY_PROVIDERS,
};

// ============================================
// 工具函数
// ============================================

/**
 * 获取提供商预设
 */
export function getProviderPreset(name: string): Partial<CCProvider> | undefined {
  const normalizedName = name.toLowerCase().replace(/[-_\s]/g, '');

  // 支持模糊匹配
  for (const [key, preset] of Object.entries(ALL_PRESETS)) {
    const normalizedKey = key.toLowerCase().replace(/[-_\s]/g, '');
    if (normalizedKey === normalizedName || normalizedKey.includes(normalizedName)) {
      return preset;
    }
  }

  return undefined;
}

/**
 * 列出所有预设
 */
export function listAllPresets(): Array<{ id: string; name: string; description?: string }> {
  return Object.entries(ALL_PRESETS).map(([id, preset]) => ({
    id,
    name: preset.name || id,
    description: preset.config?.description as string | undefined,
  }));
}

/**
 * 按类别列出预设
 */
export function listPresetsByCategory(): Record<string, Array<{ id: string; name: string }>> {
  return {
    anthropic: Object.entries(ANTHROPIC_PROVIDERS).map(([id, p]) => ({ id, name: p.name || id })),
    chinese: Object.entries(CHINESE_PROVIDERS).map(([id, p]) => ({ id, name: p.name || id })),
    openai_series: Object.entries(OPENAI_SERIES_PROVIDERS).map(([id, p]) => ({ id, name: p.name || id })),
    gateway: Object.entries(GATEWAY_PROVIDERS).map(([id, p]) => ({ id, name: p.name || id })),
  };
}

/**
 * 创建完整提供商配置（需要用户填入 API Key）
 */
export function createProviderConfig(
  presetName: string,
  apiKey: string,
  overrides?: Partial<CCProvider>
): CCProvider | null {
  const preset = getProviderPreset(presetName);
  if (!preset) return null;

  return {
    id: preset.id || presetName,
    app_id: preset.app_id || 'claude-code',
    name: preset.name || presetName,
    base_url: preset.base_url || '',
    api_key: apiKey,
    model: overrides?.model || (preset.config?.defaultModel as string),
    is_active: true,
    config: preset.config,
    ...overrides,
  };
}

/**
 * 应用预设到环境变量
 */
export function applyPreset(presetName: string, apiKey: string, model?: string): boolean {
  const config = createProviderConfig(presetName, apiKey, model ? { model } : undefined);
  if (!config) {
    console.error(`❌ 未找到预设: ${presetName}`);
    return false;
  }

  process.env.ANTHROPIC_BASE_URL = config.base_url;
  process.env.ANTHROPIC_API_KEY = config.api_key;

  if (config.model) {
    process.env.ANTHROPIC_MODEL = config.model;
  }

  console.log(`✅ 已应用预设: ${config.name} (模型: ${config.model || 'default'})`);
  return true;
}

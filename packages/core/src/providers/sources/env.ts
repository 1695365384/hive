/**
 * 环境变量配置来源
 *
 * 从环境变量读取配置（作为 fallback）
 * 支持自动检测已知 Provider
 */

import type { ConfigSource, ProviderConfig, McpServerConfig, ProviderType } from '../types.js';

/**
 * 已知 Provider 预设
 */
interface ProviderPreset {
  id: string;
  name: string;
  envKey: string;
  baseUrl: string;
  type: ProviderType;
  defaultModel?: string;
}

/**
 * 内置 Provider 预设
 */
const BUILTIN_PRESETS: ProviderPreset[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    envKey: 'ANTHROPIC_API_KEY',
    baseUrl: 'https://api.anthropic.com',
    type: 'anthropic',
    defaultModel: 'claude-sonnet-4-6',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    envKey: 'OPENAI_API_KEY',
    baseUrl: 'https://api.openai.com/v1',
    type: 'openai',
    defaultModel: 'gpt-4o',
  },
  {
    id: 'glm',
    name: 'GLM (智谱)',
    envKey: 'GLM_API_KEY',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    type: 'openai-compatible',
    defaultModel: 'glm-5',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    envKey: 'DEEPSEEK_API_KEY',
    baseUrl: 'https://api.deepseek.com',
    type: 'openai-compatible',
    defaultModel: 'deepseek-chat',
  },
  {
    id: 'qwen',
    name: '通义千问',
    envKey: 'QWEN_API_KEY',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    type: 'openai-compatible',
    defaultModel: 'qwen-plus',
  },
  {
    id: 'kimi',
    name: 'Kimi (月之暗面)',
    envKey: 'KIMI_API_KEY',
    baseUrl: 'https://api.moonshot.cn/v1',
    type: 'openai-compatible',
    defaultModel: 'moonshot-v1-8k',
  },
  {
    id: 'google',
    name: 'Google AI',
    envKey: 'GOOGLE_API_KEY',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    type: 'google',
    defaultModel: 'gemini-2.0-flash',
  },
  {
    id: 'groq',
    name: 'Groq',
    envKey: 'GROQ_API_KEY',
    baseUrl: 'https://api.groq.com/openai/v1',
    type: 'openai-compatible',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    envKey: 'OPENROUTER_API_KEY',
    baseUrl: 'https://openrouter.ai/api/v1',
    type: 'openai-compatible',
  },
];

/**
 * 环境变量配置来源
 */
export class EnvSource implements ConfigSource {
  readonly name = 'environment';
  private detectedProviders: Map<string, ProviderPreset> = new Map();
  private scanned: boolean = false;

  isAvailable(): boolean {
    return this.scanProviders().length > 0;
  }

  getProvider(id: string): ProviderConfig | null {
    this.ensureScanned();

    const preset = this.detectedProviders.get(id);
    if (!preset) return null;

    return this.buildConfigFromPreset(preset);
  }

  getAllProviders(): ProviderConfig[] {
    this.ensureScanned();
    return Array.from(this.detectedProviders.values())
      .map(p => this.buildConfigFromPreset(p));
  }

  getMcpServers(): Record<string, McpServerConfig> {
    // 环境变量不支持 MCP 服务器配置
    return {};
  }

  getDefaultProviderId(): string | null {
    const providers = this.scanProviders();
    return providers.length > 0 ? providers[0].id : null;
  }

  /**
   * 获取所有可用的 Provider 预设
   */
  getAvailablePresets(): ProviderPreset[] {
    return this.scanProviders();
  }

  /**
   * 获取内置预设列表（无论是否配置）
   */
  getBuiltinPresets(): ProviderPreset[] {
    return BUILTIN_PRESETS;
  }

  /**
   * 扫描环境变量中的 Provider
   */
  private scanProviders(): ProviderPreset[] {
    const available: ProviderPreset[] = [];

    for (const preset of BUILTIN_PRESETS) {
      if (process.env[preset.envKey]) {
        available.push(preset);
      }
    }

    return available;
  }

  /**
   * 确保已扫描
   */
  private ensureScanned(): void {
    if (this.scanned) return;

    const available = this.scanProviders();
    for (const preset of available) {
      this.detectedProviders.set(preset.id, preset);
    }

    this.scanned = true;
  }

  /**
   * 从预设构建配置
   */
  private buildConfigFromPreset(preset: ProviderPreset): ProviderConfig {
    const apiKey = process.env[preset.envKey];

    // 允许通过环境变量覆盖 baseUrl
    const baseUrlEnv = `${preset.id.toUpperCase()}_BASE_URL`;
    const baseUrl = process.env[baseUrlEnv] || preset.baseUrl;

    // 允许通过环境变量覆盖 model
    const modelEnv = `${preset.id.toUpperCase()}_MODEL`;
    const model = process.env[modelEnv] || preset.defaultModel;

    return {
      id: preset.id,
      name: preset.name,
      type: preset.type,
      baseUrl,
      apiKey,
      model,
      enabled: true,
    };
  }
}

/**
 * 创建环境变量来源
 */
export function createEnvSource(): EnvSource {
  return new EnvSource();
}

/**
 * CC-Switch 集成层 + 内置预设
 *
 * 设计理念：
 * 1. 优先使用 CC-Switch 的配置（如果已安装）
 * 2. 其次从本地配置文件 (providers.json) 加载
 * 3. 最后回退到内置预设
 *
 * 支持的提供商：
 * - 国产: GLM, Qwen, DeepSeek, Kimi, ERNIE, Spark
 * - OpenAI 系列: OpenAI, Azure OpenAI
 * - 聚合网关: OpenRouter, LiteLLM, Together AI
 * - 官方: Anthropic
 */

import Database from 'better-sqlite3';
import { homedir } from 'os';
import { join } from 'path';
import { existsSync } from 'fs';
import {
  ALL_PRESETS,
  getProviderPreset,
  applyPreset,
  listAllPresets,
  listPresetsByCategory,
} from './presets.js';
import {
  loadConfig,
  getProvider as getLocalProvider,
  getProviders as getAllLocalProviders,
  getDefaultProvider as getLocalDefaultProvider,
  toCCProvider,
} from './config-loader.js';
import type { CCProvider, CCMcpServer } from './types.js';

// 重新导出类型
export type { CCProvider, CCMcpServer };

/**
 * CC-Switch 配置读取器
 *
 * 直接读取 CC-Switch 的 SQLite 数据库
 */
export class CCSwitchReader {
  private dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || join(homedir(), '.cc-switch', 'cc-switch.db');
  }

  /**
   * 获取当前激活的提供商
   */
  getActiveProvider(appId: string = 'claude-code'): CCProvider | null {
    try {
      if (!existsSync(this.dbPath)) {
        return null;
      }

      const db = new Database(this.dbPath, { readonly: true });

      const provider = db.prepare(`
        SELECT * FROM providers
        WHERE app_id = ? AND is_active = 1
        LIMIT 1
      `).get(appId) as CCProvider | undefined;

      db.close();
      return provider || null;
    } catch (error) {
      console.warn('CC-Switch 数据库读取失败:', error);
      return null;
    }
  }

  /**
   * 获取所有提供商
   */
  getAllProviders(appId: string = 'claude-code'): CCProvider[] {
    try {
      if (!existsSync(this.dbPath)) {
        return [];
      }

      const db = new Database(this.dbPath, { readonly: true });

      const providers = db.prepare(`
        SELECT * FROM providers
        WHERE app_id = ?
        ORDER BY sort_order ASC
      `).all(appId) as CCProvider[];

      db.close();
      return providers;
    } catch (error) {
      console.warn('CC-Switch 数据库读取失败:', error);
      return [];
    }
  }

  /**
   * 获取 MCP 服务器配置
   */
  getMcpServers(appId: string = 'claude-code'): CCMcpServer[] {
    try {
      if (!existsSync(this.dbPath)) {
        return [];
      }

      const db = new Database(this.dbPath, { readonly: true });

      const servers = db.prepare(`
        SELECT * FROM mcp_servers
        WHERE app_id = ? AND enabled = 1
      `).all(appId) as CCMcpServer[];

      db.close();
      return servers;
    } catch (error) {
      console.warn('CC-Switch MCP 读取失败:', error);
      return [];
    }
  }

  /**
   * 应用提供商配置到环境变量
   */
  applyProvider(provider: CCProvider): void {
    process.env.ANTHROPIC_BASE_URL = provider.base_url;
    process.env.ANTHROPIC_API_KEY = provider.api_key;

    if (provider.model) {
      process.env.ANTHROPIC_MODEL = provider.model;
    }

    console.log(`✅ 已应用提供商: ${provider.name}`);
  }

  /**
   * 获取 MCP 服务器配置（Agent SDK 格式）
   */
  getMcpServersForAgent(): Record<string, { command: string; args?: string[]; env?: Record<string, string> }> {
    const servers = this.getMcpServers();
    const result: Record<string, { command: string; args?: string[]; env?: Record<string, string> }> = {};

    for (const server of servers) {
      result[server.name] = {
        command: server.command,
        args: server.args,
        env: server.env,
      };
    }

    return result;
  }
}

/**
 * 快速切换提供商
 */
export function switchProvider(providerName: string): boolean {
  const reader = new CCSwitchReader();
  const providers = reader.getAllProviders();

  const provider = providers.find(p =>
    p.name.toLowerCase().includes(providerName.toLowerCase())
  );

  if (!provider) {
    console.error(`❌ 未找到提供商: ${providerName}`);
    return false;
  }

  reader.applyProvider(provider);
  return true;
}

/**
 * 获取当前提供商信息
 */
export function getCurrentProvider(): CCProvider | null {
  const reader = new CCSwitchReader();
  return reader.getActiveProvider();
}

// ============================================
// 统一提供商管理器
// ============================================

/**
 * 统一提供商管理器
 *
 * 整合 CC-Switch、本地配置文件和内置预设，提供统一的接口
 */
export class UnifiedProviderManager {
  private ccSwitch: CCSwitchReader;
  private ccSwitchAvailable: boolean;

  constructor() {
    this.ccSwitch = new CCSwitchReader();
    this.ccSwitchAvailable = this.checkCCSwitchAvailable();
  }

  /**
   * 检查 CC-Switch 是否可用
   */
  private checkCCSwitchAvailable(): boolean {
    const dbPath = join(homedir(), '.cc-switch', 'cc-switch.db');
    return existsSync(dbPath);
  }

  /**
   * 获取当前激活的提供商
   * 优先级: CC-Switch > 本地配置文件 > 环境变量
   */
  getActiveProvider(): CCProvider | null {
    // 1. 尝试从 CC-Switch 获取
    if (this.ccSwitchAvailable) {
      const provider = this.ccSwitch.getActiveProvider();
      if (provider) return provider;
    }

    // 2. 尝试从本地配置文件获取默认提供商
    const localDefault = getLocalDefaultProvider();
    if (localDefault && localDefault.api_key) {
      return toCCProvider('local-default', localDefault);
    }

    // 3. 从环境变量构建
    if (process.env.ANTHROPIC_API_KEY) {
      return {
        id: 'env',
        app_id: 'claude-code',
        name: 'Environment Provider',
        base_url: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
        api_key: process.env.ANTHROPIC_API_KEY,
        model: process.env.ANTHROPIC_MODEL,
        is_active: true,
      };
    }

    return null;
  }

  /**
   * 获取所有可用提供商
   * 合并 CC-Switch 配置、本地配置文件和内置预设
   */
  getAllProviders(): CCProvider[] {
    const providers: CCProvider[] = [];
    const addedIds = new Set<string>();

    // 1. 从 CC-Switch 获取已配置的提供商
    if (this.ccSwitchAvailable) {
      const ccProviders = this.ccSwitch.getAllProviders();
      for (const p of ccProviders) {
        providers.push(p);
        addedIds.add(p.id);
      }
    }

    // 2. 从本地配置文件获取提供商
    const localProviders = getAllLocalProviders();
    if (localProviders && typeof localProviders === 'object') {
      for (const [id, config] of Object.entries(localProviders)) {
        if (!addedIds.has(id) && config && typeof config === 'object') {
          providers.push(toCCProvider(id, config as any));
          addedIds.add(id);
        }
      }
    }

    // 3. 添加内置预设（标记为预设）
    for (const [id, preset] of Object.entries(ALL_PRESETS)) {
      if (!addedIds.has(id)) {
        providers.push({
          id,
          app_id: preset.app_id || 'claude-code',
          name: preset.name || id,
          base_url: preset.base_url || '',
          api_key: '', // 预设需要用户填入 API Key
          model: preset.config?.defaultModel as string | undefined,
          is_active: false,
          config: { ...preset.config, isPreset: true },
        });
      }
    }

    return providers;
  }

  /**
   * 切换提供商
   *
   * @param name 提供商名称或预设名称
   * @param apiKey 如果是预设，需要提供 API Key（可选，本地配置文件中可能已有）
   */
  switchProvider(name: string, apiKey?: string): boolean {
    // 1. 尝试从 CC-Switch 切换
    if (this.ccSwitchAvailable) {
      const providers = this.ccSwitch.getAllProviders();
      const provider = providers.find(p =>
        p.name.toLowerCase().includes(name.toLowerCase()) ||
        p.id.toLowerCase().includes(name.toLowerCase())
      );

      if (provider) {
        this.ccSwitch.applyProvider(provider);
        return true;
      }
    }

    // 2. 尝试从本地配置文件切换
    const localProvider = getLocalProvider(name);
    if (localProvider) {
      const key = apiKey || localProvider.api_key;
      if (!key) {
        console.error(`❌ 本地配置中的 "${name}" 未设置 API Key`);
        console.log(`💡 请在 providers.json 中设置 api_key 或传入 apiKey 参数`);
        return false;
      }

      process.env.ANTHROPIC_BASE_URL = localProvider.base_url;
      process.env.ANTHROPIC_API_KEY = key;
      if (localProvider.model) {
        process.env.ANTHROPIC_MODEL = localProvider.model;
      }

      console.log(`✅ 已应用本地配置: ${localProvider.name} (模型: ${localProvider.model || 'default'})`);
      return true;
    }

    // 3. 尝试使用内置预设
    const preset = getProviderPreset(name);
    if (preset) {
      if (!apiKey) {
        // 尝试从环境变量获取
        const envKey = this.getApiKeyForProvider(name);
        if (envKey) {
          apiKey = envKey;
        } else {
          console.error(`❌ 使用预设 "${name}" 需要提供 API Key`);
          console.log(`💡 提示: 设置环境变量 ${this.getEnvKeyName(name)} 或在 providers.json 中配置`);
          return false;
        }
      }

      return applyPreset(name, apiKey);
    }

    console.error(`❌ 未找到提供商: ${name}`);
    console.log(`💡 可用预设: ${Object.keys(ALL_PRESETS).join(', ')}`);
    return false;
  }

  /**
   * 获取提供商的环境变量 Key 名称
   */
  private getEnvKeyName(providerName: string): string {
    const mapping: Record<string, string> = {
      glm: 'GLM_API_KEY',
      qwen: 'QWEN_API_KEY',
      deepseek: 'DEEPSEEK_API_KEY',
      kimi: 'KIMI_API_KEY',
      openai: 'OPENAI_API_KEY',
      openrouter: 'OPENROUTER_API_KEY',
      anthropic: 'ANTHROPIC_API_KEY',
    };
    return mapping[providerName.toLowerCase()] || `${providerName.toUpperCase()}_API_KEY`;
  }

  /**
   * 从环境变量获取提供商的 API Key
   */
  private getApiKeyForProvider(providerName: string): string | undefined {
    return process.env[this.getEnvKeyName(providerName)];
  }

  /**
   * 列出所有预设
   */
  listPresets() {
    return listAllPresets();
  }

  /**
   * 按类别列出预设
   */
  listPresetsByCategory() {
    return listPresetsByCategory();
  }

  /**
   * 获取 MCP 服务器配置
   */
  getMcpServersForAgent(): Record<string, { command: string; args?: string[]; env?: Record<string, string> }> {
    if (this.ccSwitchAvailable) {
      return this.ccSwitch.getMcpServersForAgent();
    }
    return {};
  }

  /**
   * 检查是否安装了 CC-Switch
   */
  isCCSwitchInstalled(): boolean {
    return this.ccSwitchAvailable;
  }
}

// 导出便捷实例
export const providerManager = new UnifiedProviderManager();

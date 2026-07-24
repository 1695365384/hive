/**
 * 提供商能力
 *
 * 管理提供商切换和配置。供应商/模型目录唯一来源：oh-my-pi catalog。
 */

import type { AgentCapability, AgentContext } from '../core/types.js';
import type { ProviderConfig, ProviderType, ModelSpec, PiCatalogProvider } from '../../providers/types.js';
import {
  getPiCatalogDescriptors,
  getPiProviderDescriptorSync,
  listPiProviderModels,
  listPiProviders,
  normalizeProviderId,
  testPiProviderConnection,
  warmPiCatalog,
  type ProviderConnectionTestResult,
} from '../../providers/pi-catalog-bridge.js';

export type { ProviderConnectionTestResult };

/**
 * Provider 预设信息（用于 UI 展示）
 */
export interface ProviderPresetInfo {
  id: string;
  name: string;
  type: ProviderType;
}

/**
 * 提供商能力实现
 */
export class ProviderCapability implements AgentCapability {
  readonly name = 'provider';
  private context!: AgentContext;

  initialize(context: AgentContext): void {
    this.context = context;
  }

  /**
   * 预热 pi catalog，并用 catalog 元数据补全已注册 Provider。
   */
  async initializeAsync(_context: AgentContext): Promise<void> {
    await warmPiCatalog();
    this.context.providerManager.reResolveAll();
  }

  /**
   * 获取当前提供商
   */
  get current(): ProviderConfig | null {
    return this.context.providerManager.active;
  }

  /**
   * 列出所有提供商
   */
  listAll(): ProviderConfig[] {
    return this.context.providerManager.all;
  }

  /**
   * 列出已知提供商预设（pi catalog）
   */
  listPresets(): ProviderPresetInfo[] {
    return getPiCatalogDescriptors().map((d) => {
      const meta = getPiProviderDescriptorSync(d.id);
      return {
        id: d.id,
        name: meta?.name ?? d.id,
        type: meta?.type ?? 'openai-compatible',
      };
    });
  }

  /**
   * 切换提供商（带 Hook 触发）
   */
  async use(name: string, apiKey?: string, sessionId?: string): Promise<boolean> {
    const previousProvider = this.current?.name || 'unknown';
    const canonical = normalizeProviderId(name);

    const shouldProceed = await this.context.hookRegistry.emit('provider:beforeChange', {
      sessionId: sessionId || 'system',
      previousProvider,
      newProviderId: canonical,
      timestamp: new Date(),
    });

    if (!shouldProceed) {
      return false;
    }

    const success = this.ensureAndSwitch(canonical, apiKey);

    await this.context.hookRegistry.emit('provider:afterChange', {
      sessionId: sessionId || 'system',
      previousProvider,
      newProvider: canonical,
      success,
      timestamp: new Date(),
    });

    return success;
  }

  /**
   * 同步切换提供商
   */
  useSync(name: string, apiKey?: string): boolean {
    return this.ensureAndSwitch(normalizeProviderId(name), apiKey);
  }

  /**
   * Register from pi catalog if needed, then switch.
   * Unknown ids (not in manager and not in catalog) fail closed.
   */
  private ensureAndSwitch(canonical: string, apiKey?: string): boolean {
    if (!canonical) return false;

    const manager = this.context.providerManager;
    const hasGet = typeof manager.get === 'function';
    const existing = hasGet ? manager.get(canonical) : undefined;

    if (!existing) {
      const meta = getPiProviderDescriptorSync(canonical);
      if (!meta) {
        return typeof manager.switch === 'function'
          ? manager.switch(canonical, apiKey)
          : false;
      }
      if (typeof manager.register === 'function') {
        manager.register({
          id: canonical,
          name: meta.name,
          apiKey,
          model: meta.defaultModel,
          baseUrl: meta.baseUrl,
          type: meta.type,
        });
      }
    }

    return manager.switch(canonical, apiKey);
  }

  /**
   * 列出所有已知提供商（含 logo、baseUrl、defaultModel）
   */
  async listAllProviders(): Promise<PiCatalogProvider[]> {
    return listPiProviders();
  }

  /**
   * 列出指定提供商的模型列表
   */
  async listProviderModels(providerId: string): Promise<ModelSpec[]> {
    return listPiProviderModels(providerId);
  }

  /**
   * 测试 API key 是否有效（pi-ai 同栈探测，不修改当前配置）
   */
  async testProviderConnection(
    providerId: string,
    apiKey: string,
    model?: string,
  ): Promise<ProviderConnectionTestResult> {
    return testPiProviderConnection(providerId, apiKey, model);
  }
}

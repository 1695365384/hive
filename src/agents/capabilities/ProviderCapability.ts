/**
 * 提供商能力
 *
 * 管理提供商切换和配置
 */

import type { AgentCapability, AgentContext } from '../core/types.js';
import type { ProviderConfig } from '../../providers/types.js';

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
   * 获取当前提供商
   */
  get current(): ProviderConfig | null {
    return this.context.providerManager.getActiveProvider();
  }

  /**
   * 列出所有提供商
   */
  listAll(): ProviderConfig[] {
    return this.context.providerManager.getAllProviders();
  }

  /**
   * 列出预设
   */
  listPresets() {
    return this.context.providerManager.listPresets();
  }

  /**
   * 切换提供商（带 Hook 触发）
   */
  async use(name: string, apiKey?: string, sessionId?: string): Promise<boolean> {
    const previousProvider = this.current?.name || 'unknown';

    // 触发 provider:beforeChange hook
    const shouldProceed = await this.context.hookRegistry.emit('provider:beforeChange', {
      sessionId: sessionId || 'system',
      previousProvider,
      newProviderId: name,
      timestamp: new Date(),
    });

    if (!shouldProceed) {
      return false;
    }

    // 执行切换
    const success = this.context.providerManager.switchProvider(name, apiKey);

    // 触发 provider:afterChange hook
    await this.context.hookRegistry.emit('provider:afterChange', {
      sessionId: sessionId || 'system',
      previousProvider,
      newProvider: name,
      success,
      timestamp: new Date(),
    });

    return success;
  }

  /**
   * 同步切换提供商（向后兼容）
   */
  useSync(name: string, apiKey?: string): boolean {
    return this.context.providerManager.switchProvider(name, apiKey);
  }

  /**
   * 检查是否安装了 CC-Switch
   */
  isCCSwitchInstalled(): boolean {
    return this.context.providerManager.isCCSwitchInstalled();
  }
}

/**
 * 提供商能力
 *
 * 管理提供商切换和配置
 */

import type { AgentCapability, AgentContext } from '../core/types.js';
import type { ProviderConfig, ProviderType } from '../../providers/types.js';
import type { WorkspaceManager } from '../../workspace/index.js';
import { getKnownProvidersSync, getProviderType } from '../../providers/adapters/index.js';
import { getProviderRegistry } from '../../providers/metadata/provider-registry.js';
import { createSqlitePersistence } from '../../providers/metadata/sqlite-persistence.js';
import { createWorkspacePersistence } from '../../providers/metadata/workspace-persistence.js';
import type { SessionCapability } from './SessionCapability.js';

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
  private persistenceConfigured = false;

  initialize(context: AgentContext): void {
    this.context = context;
  }

  /**
   * 配置持久化（如果工作空间可用）
   *
   * 优先使用 SQLite 持久化，失败时降级到 JSON 文件。
   * 应在 SessionCapability.initializeAsync() 之后调用
   */
  private configurePersistenceIfNeeded(): void {
    if (this.persistenceConfigured) return;

    try {
      const sessionCap = this.context.getSessionCap?.();
      if (!sessionCap) return;

      const workspaceManager = sessionCap.getWorkspaceManager();
      if (!workspaceManager?.isInitialized()) return;

      const paths = workspaceManager.getPaths();

      // 优先尝试 SQLite 持久化
      try {
        const sqlitePersistence = createSqlitePersistence(paths.modelsDevDbFile);
        getProviderRegistry().setSqlitePersistence(sqlitePersistence);
        this.persistenceConfigured = true;
        return;
      } catch (error) {
        // SQLite 不可用，降级到 JSON 文件
        console.warn('[ProviderCapability] SQLite 持久化初始化失败，降级到 JSON 文件:', error);
      }

      // 降级到 WorkspacePersistence
      const persistence = createWorkspacePersistence(paths.modelsDevCacheFile);
      getProviderRegistry().setPersistence(persistence);
      this.persistenceConfigured = true;
    } catch (error) {
      // SessionCapability 可能尚未初始化或不可用
      console.warn('[ProviderCapability] 持久化配置失败:', error);
    }
  }

  /**
   * 异步初始化（通过 AgentCapability 接口调用）
   *
   * 配置持久化 + 预加载提供商数据。
   * 在所有能力的 initialize() 完成后由 AgentContextImpl.initializeAll() 自动调用。
   */
  async initializeAsync(_context: AgentContext): Promise<void> {
    this.configurePersistenceIfNeeded();
    // 预加载提供商数据（从 API 拉取 → 写入 SQLite）
    await getProviderRegistry().preload();
    // SQLite 就绪后，重新补全所有 Provider 配置（baseUrl、npmPackage）
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
   * 列出已知提供商预设
   *
   * 返回支持通过适配器连接的提供商列表
   */
  listPresets(): ProviderPresetInfo[] {
    // 尝试配置持久化（如果工作空间已初始化）
    this.configurePersistenceIfNeeded();

    const knownProviders = getKnownProvidersSync();
    return knownProviders.map((id: string) => ({
      id,
      name: this.getProviderDisplayName(id),
      type: getProviderType(id),
    }));
  }

  /**
   * 获取提供商显示名称
   */
  private getProviderDisplayName(id: string): string {
    const names: Record<string, string> = {
      anthropic: 'Anthropic',
      openai: 'OpenAI',
      google: 'Google',
      deepseek: 'DeepSeek',
      glm: 'GLM (智谱)',
      qwen: '通义千问',
      kimi: 'Kimi (月之暗面)',
      moonshot: 'Moonshot',
      openrouter: 'OpenRouter',
      litellm: 'LiteLLM',
      groq: 'Groq',
    };
    return names[id.toLowerCase()] || id;
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
    const success = this.context.providerManager.switch(name, apiKey);

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
   * 同步切换提供商
   */
  useSync(name: string, apiKey?: string): boolean {
    return this.context.providerManager.switch(name, apiKey);
  }

}

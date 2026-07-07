/**
 * 提供商能力
 *
 * 管理提供商切换和配置
 */

import type { AgentCapability, AgentContext } from '../core/types.js';
import type { ProviderConfig, ProviderType, ModelSpec, ModelsDevProvider } from '../../providers/types.js';
import type { WorkspaceManager } from '../../workspace/index.js';
import { generateText } from 'ai';
import { getKnownProvidersSync, getProviderType, createAdapter } from '../../providers/adapters/index.js';
import { getProviderRegistry } from '../../providers/metadata/provider-registry.js';
import { getModelsDevClient } from '../../providers/metadata/models-dev.js';
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
 * API key 验证结果
 */
export interface ProviderConnectionTestResult {
  /** 是否验证通过 */
  valid: boolean;
  /** 错误信息（验证失败时） */
  error?: string;
  /** 错误类型分类 */
  errorKind?: 'auth' | 'network' | 'model' | 'unknown';
  /** 响应延迟（毫秒） */
  latencyMs?: number;
  /** 测试时使用的模型 */
  modelUsed?: string;
}

/** API key 验证超时（毫秒） */
const TEST_CONNECTION_TIMEOUT_MS = 15_000;

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

  /**
   * 列出所有已知提供商（含 logo、baseUrl、defaultModel）
   */
  async listAllProviders(): Promise<ModelsDevProvider[]> {
    this.configurePersistenceIfNeeded();
    return getModelsDevClient().getAllProviders();
  }

  /**
   * 列出指定提供商的模型列表
   */
  async listProviderModels(providerId: string): Promise<ModelSpec[]> {
    this.configurePersistenceIfNeeded();
    return getModelsDevClient().getProviderModels(providerId);
  }

  /**
   * 测试 API key 是否有效（不修改当前配置）
   *
   * 通过构造临时 ProviderConfig 并发起一次最小化 LLM 调用来验证。
   * 失败时根据错误信息分类（auth/network/model/unknown），便于 UI 给出针对性提示。
   *
   * @param providerId  厂商 ID（如 'glm'、'deepseek'、'anthropic'）
   * @param apiKey      待验证的 API key
   * @param model       可选模型 ID，不提供则使用厂商默认模型
   */
  async testProviderConnection(
    providerId: string,
    apiKey: string,
    model?: string,
  ): Promise<ProviderConnectionTestResult> {
    const startTime = Date.now();

    if (!apiKey || apiKey.trim().length === 0) {
      return { valid: false, error: 'API key is empty', errorKind: 'auth' };
    }

    // 1. 从注册表解析厂商预设（baseUrl、type、npmPackage、defaultModel）
    const registry = getProviderRegistry();
    const info = registry.getProviderInfoSync(providerId);
    if (!info) {
      return {
        valid: false,
        error: `Unknown provider: ${providerId}`,
        errorKind: 'unknown',
      };
    }

    // 2. 构造临时配置（不影响 ProviderManager 全局状态）
    const tempConfig: ProviderConfig & { type: ProviderType; npmPackage?: string } = {
      id: providerId,
      name: info.name,
      apiKey,
      baseUrl: info.baseUrl,
      type: info.type,
      npmPackage: info.npmPackage,
      model: model || info.defaultModel,
    };

    const modelUsed = tempConfig.model!;

    // 3. 创建适配器 + 模型实例
    let adapter;
    try {
      adapter = createAdapter(tempConfig);
    } catch (error) {
      return {
        valid: false,
        error: `Adapter creation failed: ${error instanceof Error ? error.message : String(error)}`,
        errorKind: 'unknown',
      };
    }

    // 4. 发起最小化 LLM 调用（maxOutputTokens: 1，prompt: 'ping'）
    try {
      const languageModel = adapter.createModel(tempConfig, modelUsed);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TEST_CONNECTION_TIMEOUT_MS);

      try {
        await generateText({
          model: languageModel,
          prompt: 'ping',
          maxOutputTokens: 1,
          abortSignal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      return {
        valid: true,
        latencyMs: Date.now() - startTime,
        modelUsed,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        valid: false,
        error: errorMsg,
        errorKind: classifyError(errorMsg),
        latencyMs: Date.now() - startTime,
        modelUsed,
      };
    }
  }

}

/**
 * 根据错误信息分类错误类型
 */
function classifyError(msg: string): ProviderConnectionTestResult['errorKind'] {
  const lower = msg.toLowerCase();
  // 认证类：401、invalid api key、unauthorized、incorrect api key
  if (
    lower.includes('401') ||
    lower.includes('unauthorized') ||
    lower.includes('invalid api key') ||
    lower.includes('incorrect api key') ||
    lower.includes('authentication') ||
    lower.includes('permission denied')
  ) {
    return 'auth';
  }
  // 网络类：timeout、econnrefused、fetch failed、network
  if (
    lower.includes('timeout') ||
    lower.includes('timed out') ||
    lower.includes('econnrefused') ||
    lower.includes('fetch failed') ||
    lower.includes('network') ||
    lower.includes('enotfound') ||
    lower.includes('abort')
  ) {
    return 'network';
  }
  // 模型类：model not found、does not exist
  if (
    lower.includes('model') &&
    (lower.includes('not found') || lower.includes('does not exist') || lower.includes('unavailable'))
  ) {
    return 'model';
  }
  return 'unknown';
}

/**
 * Agent 管理器
 *
 * 负责 Agent 实例的生命周期管理：
 * - 单例模式管理 Agent 实例
 * - 初始化时加载配置
 * - 提供 Hook 事件回调接口
 */

import {
  Agent,
  createAgent,
  type HookRegistry,
  type SessionStartHookContext,
  type SessionEndHookContext,
  type SessionErrorHookContext,
  type HookResult,
} from '@aiclaw/core';
import type { ServiceConfig } from './config.js';
import { getConfig } from './config.js';
import type {
  AgentThinkingHookContext,
  TaskProgressHookContext,
  NotificationPushHookContext,
  ToolBeforeHookContext,
} from './types.js';

/**
 * Hook 事件回调接口
 */
export interface HookCallbacks {
  /** 思考事件回调 */
  onThinking?: (thought: string, type: string) => void;
  /** 工具使用回调 */
  onToolUse?: (toolName: string, input: unknown) => void;
  /** 进度更新回调 */
  onProgress?: (current: number, total: number, message: string) => void;
  /** 通知回调 */
  onNotification?: (type: string, title: string, message: string) => void;
  /** 会话开始回调 */
  onSessionStart?: (sessionId: string, prompt: string) => void;
  /** 会话结束回调 */
  onSessionEnd?: (sessionId: string, success: boolean, reason?: string) => void;
  /** 会话错误回调 */
  onSessionError?: (sessionId: string, error: Error) => void;
}

/**
 * Agent 管理器配置
 */
export interface AgentManagerConfig {
  /** 服务配置 */
  serviceConfig?: ServiceConfig;
  /** Hook 回调 */
  hooks?: HookCallbacks;
}

/**
 * Agent 管理器类
 *
 * 单例模式管理 Agent 实例
 */
export class AgentManager {
  private agent: Agent | null = null;
  private hooks: HookCallbacks = {};
  private initialized: boolean = false;
  private hookIds: string[] = [];

  constructor() {
    // 私有构造函数，使用 getInstance 获取实例
  }

  /**
   * 初始化 Agent
   */
  async initialize(config?: AgentManagerConfig): Promise<void> {
    if (this.initialized) {
      return;
    }

    // 保存 hooks
    if (config?.hooks) {
      this.hooks = config.hooks;
    }

    // 获取服务配置
    const serviceConfig = config?.serviceConfig || getConfig();

    // 创建 Agent
    this.agent = createAgent(
      undefined, // skillConfig
      {
        // SessionCapabilityConfig
        autoResume: serviceConfig.autoResume,
        workspace: serviceConfig.workspace ? { path: serviceConfig.workspace } : undefined,
        sessionManager: {
          storage: {
            storageDir: serviceConfig.sessionDir,
          },
        },
      },
      serviceConfig.workspace,
      {
        apiTimeout: serviceConfig.apiTimeout,
        executionTimeout: serviceConfig.executionTimeout,
        heartbeatInterval: serviceConfig.heartbeatInterval,
        stallTimeout: serviceConfig.stallTimeout,
      }
    );

    // 初始化 Agent
    await this.agent.initialize();

    // 注册 Hooks
    this.registerHooks();

    // 配置默认提供商
    if (serviceConfig.defaultProvider && serviceConfig.defaultApiKey) {
      this.agent.useProvider(serviceConfig.defaultProvider, serviceConfig.defaultApiKey);
    } else if (serviceConfig.defaultProvider) {
      // 尝试使用 providers.json 中的配置
      this.agent.useProvider(serviceConfig.defaultProvider);
    }

    this.initialized = true;

    console.error('[AgentManager] Agent initialized successfully');
  }

  /**
   * 注册 Hook 监听器
   */
  private registerHooks(): void {
    if (!this.agent) return;

    const hookRegistry = this.agent.context.hookRegistry;

    // 思考事件
    this.hookIds.push(
      hookRegistry.on('agent:thinking', async (ctx: AgentThinkingHookContext): Promise<HookResult> => {
        if (this.hooks.onThinking) {
          this.hooks.onThinking(ctx.thought, ctx.type);
        }
        return { proceed: true };
      })
    );

    // 工具调用前
    this.hookIds.push(
      hookRegistry.on('tool:before', async (ctx: ToolBeforeHookContext): Promise<HookResult> => {
        if (this.hooks.onToolUse) {
          this.hooks.onToolUse(ctx.toolName, ctx.input);
        }
        return { proceed: true };
      })
    );

    // 任务进度
    this.hookIds.push(
      hookRegistry.on('task:progress', async (ctx: TaskProgressHookContext): Promise<HookResult> => {
        if (this.hooks.onProgress) {
          const total = ctx.totalSteps || 100;
          const current = Math.round((ctx.progress / 100) * total);
          this.hooks.onProgress(current, total, ctx.description);
        }
        return { proceed: true };
      })
    );

    // 通知
    this.hookIds.push(
      hookRegistry.on('notification:push', async (ctx: NotificationPushHookContext): Promise<HookResult> => {
        if (this.hooks.onNotification) {
          this.hooks.onNotification(ctx.type, ctx.title, ctx.message);
        }
        return { proceed: true };
      })
    );

    // 会话开始
    this.hookIds.push(
      hookRegistry.on('session:start', async (ctx: SessionStartHookContext): Promise<HookResult> => {
        if (this.hooks.onSessionStart) {
          this.hooks.onSessionStart(ctx.sessionId, ctx.prompt || '');
        }
        return { proceed: true };
      })
    );

    // 会话结束
    this.hookIds.push(
      hookRegistry.on('session:end', async (ctx: SessionEndHookContext): Promise<HookResult> => {
        if (this.hooks.onSessionEnd) {
          this.hooks.onSessionEnd(ctx.sessionId, ctx.success, ctx.reason);
        }
        return { proceed: true };
      })
    );

    // 会话错误
    this.hookIds.push(
      hookRegistry.on('session:error', async (ctx: SessionErrorHookContext): Promise<HookResult> => {
        if (this.hooks.onSessionError) {
          this.hooks.onSessionError(ctx.sessionId, ctx.error);
        }
        return { proceed: true };
      })
    );
  }

  /**
   * 获取 Agent 实例
   */
  async getAgent(): Promise<Agent> {
    if (!this.agent) {
      await this.initialize();
    }
    return this.agent!;
  }

  /**
   * 更新 Hook 回调
   */
  setHooks(hooks: HookCallbacks): void {
    this.hooks = { ...this.hooks, ...hooks };
  }

  /**
   * 销毁 Agent
   */
  async dispose(): Promise<void> {
    // 取消所有 Hook 监听
    if (this.agent) {
      const hookRegistry = this.agent.context.hookRegistry;
      for (const hookId of this.hookIds) {
        try {
          hookRegistry.off(hookId);
        } catch (error) {
          console.error('[AgentManager] Error disposing hook:', error);
        }
      }
    }
    this.hookIds = [];

    // 销毁 Agent
    if (this.agent) {
      await this.agent.dispose();
      this.agent = null;
    }

    this.initialized = false;
    console.error('[AgentManager] Agent disposed');
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

// 单例实例
let instance: AgentManager | null = null;

/**
 * 获取 AgentManager 单例
 */
export function getAgentManager(): AgentManager {
  if (!instance) {
    instance = new AgentManager();
  }
  return instance;
}

/**
 * 重置 AgentManager（用于测试）
 */
export function resetAgentManager(): void {
  if (instance) {
    instance.dispose().catch((error) => {
      console.error('[AgentManager] Error during reset:', error);
    });
  }
  instance = null;
}

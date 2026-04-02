/**
 * Agent 上下文 - 依赖注入容器
 *
 * 管理所有共享资源和能力模块
 */

import { ProviderManager } from '../../providers/index.js';
import type { ExternalConfig } from '../../providers/index.js';
import { AgentRunner } from './runner.js';
import { SkillRegistry, createSkillRegistry } from '../../skills/index.js';
import { AgentRegistryImpl } from '../registry/AgentRegistry.js';
import { HookRegistry } from '../../hooks/index.js';
import type { AgentCapability, AgentContext, SkillSystemConfig, TimeoutConfig } from './types.js';
import type { ProviderConfig } from '../../providers/index.js';
import type { Skill, SkillMatchResult } from '../../skills/index.js';
import type { EnvironmentContext } from '../../environment/types.js';
import { TimeoutCapability, createTimeoutCapability } from '../capabilities/TimeoutCapability.js';
import { CapabilityRegistry } from './CapabilityRegistry.js';

/**
 * Agent 上下文选项
 */
export interface AgentContextOptions {
  externalConfig?: ExternalConfig;
  skillConfig?: SkillSystemConfig;
  timeoutConfig?: TimeoutConfig;
  /** System environment info, injected into Agent system prompts */
  environmentContext?: EnvironmentContext;
}

/**
 * Agent 上下文实现
 */
export class AgentContextImpl implements AgentContext {
  readonly providerManager: ProviderManager;
  readonly runner: AgentRunner;
  readonly skillRegistry: SkillRegistry;
  readonly agentRegistry: AgentRegistryImpl;
  readonly hookRegistry: HookRegistry;
  readonly environmentContext?: EnvironmentContext;

  /** 内置超时能力 */
  readonly timeoutCap: TimeoutCapability;

  /** 能力注册表 */
  readonly capabilityRegistry: CapabilityRegistry;

  private initialized: boolean = false;

  constructor(options: AgentContextOptions = {}) {
    const { externalConfig, skillConfig, timeoutConfig, environmentContext } = options;
    this.environmentContext = environmentContext;

    this.providerManager = new ProviderManager({ externalConfig });
    this.runner = new AgentRunner(this.providerManager);
    if (environmentContext) {
      this.runner.setEnvironmentContext(environmentContext);
    }
    this.skillRegistry = createSkillRegistry(skillConfig);
    this.agentRegistry = new AgentRegistryImpl();
    this.hookRegistry = new HookRegistry();
    this.capabilityRegistry = new CapabilityRegistry();

    // 创建内置超时能力
    this.timeoutCap = createTimeoutCapability(timeoutConfig);
  }

  /**
   * 注册能力模块
   */
  registerCapability(capability: AgentCapability): void {
    this.capabilityRegistry.register(capability);
  }

  /**
   * 获取能力模块（类型安全）
   */
  getCapability<T extends AgentCapability>(name: string): T {
    return this.capabilityRegistry.get<T>(name);
  }

  /**
   * 初始化所有能力模块
   */
  async initializeAll(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // 初始化技能系统
    await this.skillRegistry.initialize();

    // 初始化内置超时能力（最先初始化，供其他能力使用）
    this.timeoutCap.initialize(this);

    // 初始化所有能力模块（同步）
    for (const capability of this.capabilityRegistry.getAll()) {
      // 触发 capability:init hook
      await this.hookRegistry.emit('capability:init', {
        capabilityName: capability.name,
        context: this,
        timestamp: new Date(),
      });

      const result = capability.initialize(this);
      if (result instanceof Promise) {
        await result;
      }
    }

    // 异步初始化：在所有 initialize() 完成后，按注册顺序调用 initializeAsync()
    for (const capability of this.capabilityRegistry.getAll()) {
      if (capability.initializeAsync) {
        await capability.initializeAsync(this);
      }
    }

    this.initialized = true;
  }

  /**
   * 销毁所有能力模块
   */
  async disposeAll(): Promise<void> {
    // 销毁所有能力模块
    for (const capability of this.capabilityRegistry.getAll()) {
      // 触发 capability:dispose hook
      await this.hookRegistry.emit('capability:dispose', {
        capabilityName: capability.name,
        timestamp: new Date(),
      });

      if (capability.dispose) {
        try {
          const result = capability.dispose();
          if (result instanceof Promise) {
            await result;
          }
        } catch (error) {
          console.error(`[AgentContext] Failed to dispose capability ${capability.name}:`, error);
        }
      }
    }

    this.capabilityRegistry.clear();

    // 销毁内置超时能力（最后销毁）
    if (this.timeoutCap.dispose) {
      this.timeoutCap.dispose();
    }

    this.initialized = false;
  }

  // ============================================
  // AgentContext 接口实现
  // ============================================

  getActiveProvider(): ProviderConfig | null {
    return this.providerManager.active;
  }

  getSkill(name: string): Skill | undefined {
    return this.skillRegistry.get(name);
  }

  matchSkill(input: string): SkillMatchResult | null {
    return this.skillRegistry.match(input);
  }

  getAgentConfig(name: string) {
    return this.agentRegistry.get(name);
  }

  // ============================================
  // 类型安全的能力访问器
  // ============================================

  getSessionCap(): import('../capabilities/SessionCapability.js').SessionCapability | null {
    try {
      return this.capabilityRegistry.get<import('../capabilities/SessionCapability.js').SessionCapability>('session');
    } catch {
      return null;
    }
  }

  getProviderCap(): import('../capabilities/ProviderCapability.js').ProviderCapability | null {
    try {
      return this.capabilityRegistry.get<import('../capabilities/ProviderCapability.js').ProviderCapability>('provider');
    } catch {
      return null;
    }
  }
}

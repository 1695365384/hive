/**
 * Agent 上下文 - 依赖注入容器
 *
 * 管理所有共享资源和能力模块
 */

import { ProviderManager } from '../../providers/index.js';
import { AgentRunner } from './runner.js';
import { SkillRegistry, createSkillRegistry } from '../../skills/index.js';
import { AgentRegistryImpl } from '../registry/AgentRegistry.js';
import type { AgentCapability, AgentContext, SkillSystemConfig } from './types.js';
import type { ProviderConfig } from '../../providers/index.js';
import type { Skill, SkillMatchResult } from '../../skills/index.js';

/**
 * Agent 上下文实现
 */
export class AgentContextImpl implements AgentContext {
  readonly providerManager: ProviderManager;
  readonly runner: AgentRunner;
  readonly skillRegistry: SkillRegistry;
  readonly agentRegistry: AgentRegistryImpl;

  private capabilities: Map<string, AgentCapability> = new Map();
  private initialized: boolean = false;

  constructor(skillConfig?: SkillSystemConfig) {
    this.providerManager = new ProviderManager();
    this.runner = new AgentRunner(this.providerManager);
    this.skillRegistry = createSkillRegistry(skillConfig);
    this.agentRegistry = new AgentRegistryImpl();
  }

  /**
   * 注册能力模块
   */
  registerCapability(capability: AgentCapability): void {
    this.capabilities.set(capability.name, capability);
  }

  /**
   * 获取能力模块
   */
  getCapability<T extends AgentCapability>(name: string): T {
    const capability = this.capabilities.get(name);
    if (!capability) {
      throw new Error(`Capability not found: ${name}`);
    }
    return capability as T;
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

    // 初始化所有能力模块
    for (const capability of this.capabilities.values()) {
      const result = capability.initialize(this);
      if (result instanceof Promise) {
        await result;
      }
    }

    this.initialized = true;
  }

  // ============================================
  // AgentContext 接口实现
  // ============================================

  getActiveProvider(): ProviderConfig | null {
    return this.providerManager.getActiveProvider();
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
}

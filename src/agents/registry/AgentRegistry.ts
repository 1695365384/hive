/**
 * Agent 注册表
 *
 * 管理所有 Agent 定义，支持动态注册
 */

import type { AgentConfig } from '../types.js';
import { BUILTIN_AGENTS, CORE_AGENTS, EXTENDED_AGENTS } from '../core/agents.js';

// 重新导出供外部使用
export { CORE_AGENTS, EXTENDED_AGENTS, BUILTIN_AGENTS };

/**
 * Agent 注册表实现
 */
export class AgentRegistryImpl {
  private agents: Map<string, AgentConfig> = new Map();

  constructor() {
    // 初始化内置 Agent
    this.loadBuiltinAgents();
  }

  /**
   * 加载内置 Agent
   */
  private loadBuiltinAgents(): void {
    for (const [name, config] of Object.entries(BUILTIN_AGENTS)) {
      this.agents.set(name, config);
    }
  }

  /**
   * 获取 Agent 配置
   */
  get(name: string): AgentConfig | undefined {
    return this.agents.get(name);
  }

  /**
   * 获取所有 Agent 名称
   */
  getAllNames(): string[] {
    return Array.from(this.agents.keys());
  }

  /**
   * 注册 Agent
   */
  register(name: string, config: AgentConfig): void {
    this.agents.set(name, config);
  }

  /**
   * 注销 Agent
   */
  unregister(name: string): boolean {
    return this.agents.delete(name);
  }

  /**
   * 检查 Agent 是否存在
   */
  has(name: string): boolean {
    return this.agents.has(name);
  }

  /**
   * 获取核心 Agent 名称
   */
  getCoreAgentNames(): string[] {
    return Object.keys(CORE_AGENTS);
  }

  /**
   * 获取扩展 Agent 名称
   */
  getExtendedAgentNames(): string[] {
    return Object.keys(EXTENDED_AGENTS);
  }

  /**
   * 获取所有 Agent
   */
  getAll(): Map<string, AgentConfig> {
    return new Map(this.agents);
  }
}

// 单例
let globalRegistry: AgentRegistryImpl | null = null;

/**
 * 获取全局 Agent 注册表
 */
export function getAgentRegistry(): AgentRegistryImpl {
  if (!globalRegistry) {
    globalRegistry = new AgentRegistryImpl();
  }
  return globalRegistry;
}

/**
 * 创建新的 Agent 注册表
 */
export function createAgentRegistry(): AgentRegistryImpl {
  return new AgentRegistryImpl();
}

// 类型导出
export type { AgentConfig };

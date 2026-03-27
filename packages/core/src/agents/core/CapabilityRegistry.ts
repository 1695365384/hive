/**
 * 能力注册表
 *
 * 管理能力模块的注册、查找和遍历
 */

import type { AgentCapability } from '../types.js';

/**
 * 能力注册表
 *
 * 提供类型安全的能力管理
 */
export class CapabilityRegistry {
  private capabilities: Map<string, AgentCapability> = new Map();
  private registrationOrder: string[] = [];

  /**
   * 注册能力模块
   */
  register(capability: AgentCapability): void {
    if (this.capabilities.has(capability.name)) {
      throw new Error(`Capability already registered: ${capability.name}`);
    }
    this.capabilities.set(capability.name, capability);
    this.registrationOrder.push(capability.name);
  }

  /**
   * 获取能力模块（类型安全）
   */
  get<T extends AgentCapability>(name: string): T {
    const capability = this.capabilities.get(name);
    if (!capability) {
      throw new Error(`Capability not found: ${name}`);
    }
    return capability as T;
  }

  /**
   * 检查能力是否存在
   */
  has(name: string): boolean {
    return this.capabilities.has(name);
  }

  /**
   * 获取所有已注册能力（按注册顺序）
   */
  getAll(): AgentCapability[] {
    return this.registrationOrder
      .map(name => this.capabilities.get(name)!)
      .filter(Boolean);
  }

  /**
   * 获取能力数量
   */
  get size(): number {
    return this.capabilities.size;
  }

  /**
   * 清空所有能力
   */
  clear(): void {
    this.capabilities.clear();
    this.registrationOrder = [];
  }
}

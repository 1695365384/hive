/**
 * PackManager — Vertical Pack 管理器
 *
 * 职责：
 * - 注册 pack（use()）
 * - 拓扑排序（按 dependencies 解析初始化顺序）
 * - 循环依赖检测
 * - apply：把所有 pack 的扩展点注册到 Agent
 * - 运行时隔离：冲突检测 + 命名空间前缀 + 资源归属追踪 + 单独卸载
 *
 * apply 时机：必须在 Agent.initialize() → initializeAll() 之前调用，
 * 这样 pack 带的 capability 能正常走 init 流程。
 *
 * 运行时隔离（Phase 3）保证多个 pack 互不干扰：
 * - 默认模式：注册资源时检测全局重名，冲突即抛 PackConflictError
 * - 命名空间模式（pack.namespaced=true）：所有资源加 `<id>::` 前缀，从源头避免冲突
 * - 卸载（unloadPack）：按归属追踪移除某 pack 注册的全部资源，运行时可切换垂直场景
 */

import type { VerticalPack, PackSetupContext, ToolDefinition } from './types.js';
import { PackError, PackCycleError, PackDependencyMissingError, PackConflictError } from './types.js';
import type { AgentCapability, AgentConfig } from '../agents/types/capabilities.js';
import type { Tool } from 'ai';
import type { HookType, HookOptions } from '../hooks/types.js';

/**
 * PackManager.apply() 需要的目标接口
 *
 * 只声明 PackManager 实际调用的方法，避免依赖完整的 AgentContext 接口。
 * AgentContextImpl 天然满足这个接口（结构化类型）。
 */
export interface PackApplyTarget {
  /** 注册 Capability（由 AgentContextImpl 提供） */
  registerCapability(capability: AgentCapability): void;
  /** 注销 Capability（unloadPack 时使用） */
  unregisterCapability(name: string): boolean;
  /** Agent 注册表 */
  agentRegistry: {
    register(name: string, config: AgentConfig): void;
    unregister(name: string): boolean;
  };
  /** AgentRunner（用于访问 ToolRegistry + 注册自定义 Agent 定义） */
  runner: {
    getToolRegistry(): {
      register(name: string, tool: Tool): void;
      unregister(name: string): boolean;
      registerAgentTools(agentType: string, toolNames: string[]): void;
      unregisterAgentTools(agentType: string): boolean;
    };
    /** 注册自定义 Agent 定义（Vertical Pack 使用，让 runner 能执行 pack 声明的 agent） */
    registerAgentDefinition(name: string, config: AgentConfig): void;
    /** 注销自定义 Agent 定义（unloadPack 时使用） */
    unregisterAgentDefinition(name: string): boolean;
  };
  /** Hook 注册表 */
  hookRegistry: {
    on(
      type: HookType,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      handler: (context: any) => any | Promise<any>,
      options?: HookOptions,
    ): string;
    /** 按 hook id 注销（unloadPack 时使用） */
    off(id: string): boolean;
  };
  /** Skill 注册表（用于追踪/卸载 pack 注册的 skill） */
  skillRegistry?: {
    /** 按 skill 名注销 */
    unregister(name: string): boolean;
  };
  /** Agent 实例上的 registerSkill（applyPack 时注册 skill 用） */
  registerSkill?: (skill: import('../skills/types.js').Skill) => void;
}

/**
 * 单个 pack 注册的资源归属记录（用于 unloadPack 时精确清理）
 */
interface PackResourceRecord {
  tools: string[];
  agentAgents: string[]; // 注册到 agentRegistry + runner 的自定义 agent 名
  capabilities: string[];
  skills: string[];
  hooks: string[]; // hook id 列表
}

// ============================================
// PackManager
// ============================================

export class PackManager {
  private packs: Map<string, VerticalPack> = new Map();
  private applied = false;
  /** 已注册资源的归属表：packId → 它注册了哪些资源 */
  private ownership = new Map<string, PackResourceRecord>();
  /** 全局资源占用表：资源名 → 拥有它的 packId（用于冲突检测和卸载反查） */
  private toolOwner = new Map<string, string>();
  private agentOwner = new Map<string, string>();
  private capabilityOwner = new Map<string, string>();

  /**
   * 注册一个 vertical pack
   *
   * 必须在 apply() 之前调用。重复注册同 id 会抛错。
   *
   * @returns this（支持链式调用）
   */
  use(pack: VerticalPack): this {
    if (!pack.id) {
      throw new PackError('Pack must have a non-empty id');
    }
    if (this.packs.has(pack.id)) {
      throw new PackError(`Pack "${pack.id}" is already registered`, pack.id);
    }
    if (this.applied) {
      throw new PackError(
        `Cannot register pack "${pack.id}" after apply() has been called. Call use() before agent.initialize().`,
        pack.id,
      );
    }
    this.packs.set(pack.id, pack);
    return this;
  }

  /**
   * 检查 pack 是否已注册
   */
  has(id: string): boolean {
    return this.packs.has(id);
  }

  /**
   * 获取已注册的 pack
   */
  get(id: string): VerticalPack | undefined {
    return this.packs.get(id);
  }

  /**
   * 列出所有已注册 pack 的 id
   */
  list(): string[] {
    return Array.from(this.packs.keys());
  }

  /**
   * 已注册 pack 数量
   */
  get size(): number {
    return this.packs.size;
  }

  /**
   * 是否已 apply
   */
  get isApplied(): boolean {
    return this.applied;
  }

  /**
   * 为资源名加 pack 前缀（仅 namespaced 模式）
   */
  private namespace(pack: VerticalPack, name: string): string {
    return pack.namespaced ? `${pack.id}::${name}` : name;
  }

  /**
   * 检测资源冲突（非 namespaced 模式）
   *
   * 若资源已被其他 pack 占用，抛 PackConflictError；
   * 若是同一 pack 重复声明（自己的记录里已有），则静默跳过（幂等）。
   */
  private assertNoConflict(
    packId: string,
    ownerMap: Map<string, string>,
    record: string[],
    type: PackConflictError['resourceType'],
    name: string,
  ): void {
    const existingOwner = ownerMap.get(name);
    if (existingOwner && existingOwner !== packId) {
      throw new PackConflictError(type, name, existingOwner);
    }
    // 同 pack 重复声明：不重复记录
    if (!record.includes(name)) record.push(name);
    ownerMap.set(name, packId);
  }

  /**
   * 拓扑排序：按 dependencies 解析初始化顺序
   *
   * 算法：Kahn 算法（BFS）
   * - 无依赖的 pack 排在最前
   * - 被依赖的 pack 先于依赖它的 pack
   * - 同层按注册顺序
   * - 检测到循环依赖抛 PackCycleError
   * - 依赖缺失抛 PackDependencyMissingError
   */
  topologicalSort(): VerticalPack[] {
    const inDegree = new Map<string, number>();
    const dependents = new Map<string, string[]>();

    for (const [id, pack] of this.packs) {
      if (!inDegree.has(id)) inDegree.set(id, 0);
      const deps = pack.dependencies ?? [];
      for (const dep of deps) {
        if (!this.packs.has(dep)) {
          throw new PackDependencyMissingError(id, dep);
        }
        if (!dependents.has(dep)) dependents.set(dep, []);
        dependents.get(dep)!.push(id);
        inDegree.set(id, (inDegree.get(id) ?? 0) + 1);
      }
    }

    const queue: string[] = [];
    for (const id of this.packs.keys()) {
      if ((inDegree.get(id) ?? 0) === 0) {
        queue.push(id);
      }
    }

    const sorted: VerticalPack[] = [];
    while (queue.length > 0) {
      const id = queue.shift()!;
      const pack = this.packs.get(id)!;
      sorted.push(pack);

      const dependentsOfId = dependents.get(id) ?? [];
      for (const depId of dependentsOfId) {
        const newDegree = (inDegree.get(depId) ?? 1) - 1;
        inDegree.set(depId, newDegree);
        if (newDegree === 0) {
          queue.push(depId);
        }
      }
    }

    if (sorted.length !== this.packs.size) {
      const cyclic = Array.from(this.packs.keys()).filter(
        id => (inDegree.get(id) ?? 0) > 0,
      );
      throw new PackCycleError(cyclic);
    }

    return sorted;
  }

  /**
   * 把所有 pack 的扩展点注册到 Agent
   *
   * 注册顺序（每个 pack 内部）：
   * 1. capability（最早，其他扩展点可能依赖它）
   * 2. subagent 定义
   * 3. tool
   * 4. skill
   * 5. hook
   * 6. pack.setup()
   *
   * Pack 之间：按拓扑排序（被依赖的先注册）
   *
   * @param agent  Agent 实例（需有 registerSkill 方法）
   * @param target  依赖注入容器（AgentContextImpl 满足 PackApplyTarget）
   * @param getConfig  获取每个 pack 配置的函数（可选，默认空对象）
   */
  async apply(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    agent: any,
    target: PackApplyTarget,
    getConfig: (packId: string) => Record<string, unknown> = () => ({}),
  ): Promise<void> {
    if (this.applied) {
      return; // 幂等
    }
    if (this.packs.size === 0) {
      this.applied = true;
      return;
    }

    const sorted = this.topologicalSort();

    for (const pack of sorted) {
      // 初始化归属记录
      const record: PackResourceRecord = {
        tools: [],
        agentAgents: [],
        capabilities: [],
        skills: [],
        hooks: [],
      };
      this.ownership.set(pack.id, record);
      await this.applyPack(pack, agent, target, getConfig(pack.id), record);
    }

    this.applied = true;
  }

  /**
   * 应用单个 pack 的所有扩展点
   */
  private async applyPack(
    pack: VerticalPack,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    agent: any,
    target: PackApplyTarget,
    config: Record<string, unknown>,
    record: PackResourceRecord,
  ): Promise<void> {
    // 1. Capability（最早注册，init 时会被 initializeAll() 调用）
    if (pack.capabilities) {
      for (const capability of pack.capabilities) {
        this.assertNoConflict(pack.id, this.capabilityOwner, record.capabilities, 'capability', capability.name);
        target.registerCapability(capability);
      }
    }

    // 2. SubAgent 定义（同时注册到 agentRegistry 和 runner，让 runner 能执行）
    if (pack.agents) {
      for (const { name, config: agentConfig } of pack.agents) {
        const nsName = this.namespace(pack, name);
        this.assertNoConflict(pack.id, this.agentOwner, record.agentAgents, 'agent', nsName);
        target.agentRegistry.register(nsName, agentConfig);
        target.runner.registerAgentDefinition(nsName, agentConfig);
      }
    }

    // 3. Tool
    if (pack.tools) {
      const registry = target.runner.getToolRegistry();
      for (const { name, tool } of pack.tools as ToolDefinition[]) {
        const nsName = this.namespace(pack, name);
        this.assertNoConflict(pack.id, this.toolOwner, record.tools, 'tool', nsName);
        registry.register(nsName, tool);
      }
    }

    // 4. Skill（通过 agent.registerSkill）
    if (pack.skills) {
      for (const { skill } of pack.skills) {
        this.assertNoConflict(pack.id, this.capabilityOwner /* 占位，skill 不追踪全局占用 */, record.skills, 'skill', skill.metadata.name);
        agent.registerSkill?.(skill);
      }
    }

    // 5. Hook
    if (pack.hooks) {
      for (const { event, handler, options } of pack.hooks) {
        const hookId = target.hookRegistry.on(event, handler, options);
        record.hooks.push(hookId);
      }
    }

    // 6. Pack 级 setup
    if (pack.setup) {
      const setupCtx: PackSetupContext = { agent, context: target as unknown as import('../agents/types/core.js').AgentContext, config };
      await pack.setup(setupCtx);
    }
  }

  /**
   * 卸载单个 pack，精确移除它注册的全部资源
   *
   * 用于运行时切换垂直场景（如从法务场景切到医疗场景），
   * 或修复命名冲突后重新加载。
   *
   * @param packId  要卸载的 pack id
   * @param target  依赖注入容器（需满足卸载接口）
   * @param agent   Agent 实例（用于调用 pack.dispose）
   * @returns 是否成功卸载
   */
  async unloadPack(
    packId: string,
    target: PackApplyTarget,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    agent?: any,
  ): Promise<boolean> {
    const pack = this.packs.get(packId);
    if (!pack) return false;
    const record = this.ownership.get(packId);
    if (!record) return false;

    // 1. Hook（先卸载，避免 dispose 期间触发）
    for (const hookId of record.hooks) {
      target.hookRegistry.off(hookId);
    }

    // 2. Skill（按名反查卸载）
    if (target.skillRegistry && agent?.skillRegistry) {
      for (const skillName of record.skills) {
        agent.skillRegistry.unregister(skillName);
      }
    }

    // 3. Tool
    const toolRegistry = target.runner.getToolRegistry();
    for (const toolName of record.tools) {
      toolRegistry.unregister(toolName);
      this.toolOwner.delete(toolName);
    }

    // 4. Capability
    for (const capName of record.capabilities) {
      target.unregisterCapability(capName);
      this.capabilityOwner.delete(capName);
    }

    // 5. SubAgent
    for (const agentName of record.agentAgents) {
      target.agentRegistry.unregister(agentName);
      target.runner.unregisterAgentDefinition(agentName);
      this.agentOwner.delete(agentName);
    }

    // 6. Pack 级 dispose
    if (pack.dispose) {
      try {
        await pack.dispose();
      } catch (error) {
        console.error(`[PackManager] Pack "${packId}" dispose failed:`, error);
      }
    }

    // 7. 清理追踪表
    this.ownership.delete(packId);
    this.packs.delete(packId);

    return true;
  }

  /**
   * 在未 apply 的情况下强制移除一个 pack 注册（unuse 的预处理分支）
   *
   * 仅当 pack 尚未 apply（资源未注册到 Agent）时调用，直接丢弃注册。
   * 若 pack 已 apply，请使用 unloadPack()。
   *
   * @returns 是否成功移除
   */
  forceRemove(packId: string): boolean {
    if (this.applied) return false;
    const pack = this.packs.get(packId);
    if (!pack) return false;
    this.packs.delete(packId);
    return true;
  }

  /**
   * 销毁所有 pack（调用每个 pack 的 dispose + 清理追踪）
   *
   * 在 Agent.dispose() 时调用。
   */
  async disposeAll(): Promise<void> {
    const packIds = Array.from(this.packs.keys()).reverse();
    for (const packId of packIds) {
      // disposeAll 时 target 可能已不可用，仅调用 pack.dispose
      const pack = this.packs.get(packId);
      if (pack?.dispose) {
        try {
          await pack.dispose();
        } catch (error) {
          console.error(`[PackManager] Pack "${packId}" dispose failed:`, error);
        }
      }
    }
    this.packs.clear();
    this.ownership.clear();
    this.toolOwner.clear();
    this.agentOwner.clear();
    this.capabilityOwner.clear();
    this.applied = false;
  }
}

/**
 * 创建 PackManager 实例
 */
export function createPackManager(): PackManager {
  return new PackManager();
}

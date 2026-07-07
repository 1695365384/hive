/**
 * Vertical Pack — 垂直场景扩展包类型定义
 *
 * 一个 VerticalPack 把一个垂直业务场景所需的所有扩展点（技能、工具、
 * Capability、SubAgent、Hook）打包成一个声明式清单，由 PackManager
 * 统一编排注册到 Agent。
 *
 * 设计目标：
 * - 声明式：pack 作者只描述「有什么」，不描述「怎么注册」
 * - 可组合：多个 pack 可挂到同一个 Agent，按依赖拓扑排序初始化
 * - 可分发：一个 pack = 一个 npm 包，`agent.use(new SomePack())`
 */

import type { Tool } from 'ai';
import type { AgentCapability } from '../agents/types/capabilities.js';
import type { AgentConfig } from '../agents/types/capabilities.js';
import type { Skill } from '../skills/types.js';
import type { HookType, HookOptions } from '../hooks/types.js';
import type { AgentContext } from '../agents/types/core.js';

// ============================================
// 扩展点定义
// ============================================

/** 工具定义（注册到 ToolRegistry） */
export interface ToolDefinition {
  /** 工具名（唯一，重复注册后者覆盖前者） */
  name: string;
  /** AI SDK Tool 实例 */
  tool: Tool;
}

/** Hook 注册项 */
export interface HookRegistration {
  /** Hook 事件类型（如 'tool:before', 'session:start'） */
  event: HookType;
  /** 处理器（pack 作者自行保证类型安全） */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (context: any) => any | Promise<any>;
  /** 注册选项（优先级、一次性等） */
  options?: HookOptions;
}

/** SubAgent 定义（注册到 AgentRegistry） */
export interface SubAgentDefinition {
  /** Agent 类型标识（如 'legal-reviewer'） */
  name: string;
  /** Agent 配置 */
  config: AgentConfig;
}

/** Skill 定义（直接传 Skill 对象，或从 markdown 加载后传入） */
export interface SkillDefinition {
  /** Skill 对象 */
  skill: Skill;
}

// ============================================
// Pack Setup Context
// ============================================

/**
 * Pack 初始化上下文
 *
 * 在 setup() 中注入，供 pack 执行 pack 级初始化逻辑
 * （如连接外部服务、预热缓存、校验配置）。
 */
export interface PackSetupContext {
  /** 当前 Agent 实例 */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  agent: any;
  /** Agent 上下文（依赖注入容器） */
  context: AgentContext;
  /** 当前 pack 的配置（构造函数传入的原始 config） */
  config: Record<string, unknown>;
}

// ============================================
// VerticalPack 主接口
// ============================================

/**
 * 垂直场景扩展包
 *
 * 一个 pack 可以包含任意组合的扩展点（至少一个，否则无意义）。
 * 所有字段都是可选的——pack 按需声明。
 *
 * @example
 * ```typescript
 * export class LegalPack implements VerticalPack {
 *   readonly id = 'legal';
 *   readonly name = '法务助手';
 *   readonly version = '1.0.0';
 *   readonly dependencies = [];
 *
 *   tools = [{ name: 'query-law', tool: createQueryLawTool() }];
 *   agents = [{ name: 'legal-reviewer', config: { type: 'custom', tools: ['file','query-law'], maxTurns: 15 } }];
 *   skills = [{ skill: legalContractReviewSkill }];
 *   capabilities = [new LegalKnowledgeCapability()];
 *   hooks = [{ event: 'tool:before', handler: auditHook, options: { priority: 'highest' } }];
 *
 *   async setup({ context }) {
 *     console.log('[LegalPack] 初始化完成');
 *   }
 * }
 * ```
 */
export interface VerticalPack {
  /** Pack 唯一标识（用于依赖引用和去重） */
  id: string;
  /** 人类可读名称 */
  name: string;
  /** SemVer 版本号 */
  version: string;
  /** 依赖的其他 pack id 列表（按拓扑排序初始化） */
  dependencies?: string[];

  /**
   * 命名空间模式（运行时隔离）
   *
   * 启用后，pack 声明的所有资源（工具、SubAgent）自动加 `<id>::` 前缀，
   * 从根本上避免多个 pack 之间的命名冲突——即使两个 pack 都注册了
   * `reviewer` agent 或 `query-db` 工具，也会变成 `legal::reviewer` 与
   * `medical::reviewer`，互不干扰。
   *
   * 不启用时，PackManager 在注册资源时会检测全局命名冲突，发现冲突立即
   * 抛出 PackConflictError，迫使开发者显式解决（或开启 namespaced）。
   *
   * @default false
   */
  namespaced?: boolean;

  /** 领域工具集 */
  tools?: ToolDefinition[];
  /** 领域 SubAgent 定义 */
  agents?: SubAgentDefinition[];
  /** 领域技能 */
  skills?: SkillDefinition[];
  /** 领域 Capability（有状态服务） */
  capabilities?: AgentCapability[];
  /** 生命周期 Hook */
  hooks?: HookRegistration[];

  /**
   * Pack 级初始化（所有扩展点注册后、Agent.initializeAll() 前）
   *
   * 用于连接外部服务、预热缓存、校验配置等。
   * 抛错会中断整个 Agent 初始化。
   */
  setup?: (ctx: PackSetupContext) => Promise<void> | void;

  /**
   * Pack 级销毁（Agent.dispose() 时调用）
   */
  dispose?: () => Promise<void> | void;
}

// ============================================
// 错误类型
// ============================================

/** Pack 相关错误 */
export class PackError extends Error {
  constructor(
    message: string,
    public readonly packId?: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'PackError';
  }
}

/** 循环依赖错误 */
export class PackCycleError extends PackError {
  /** 检测到的循环路径 */
  readonly cycle: string[];

  constructor(cycle: string[]) {
    super(`Circular dependency detected: ${cycle.join(' → ')}`);
    this.name = 'PackCycleError';
    this.cycle = cycle;
  }
}

/** 依赖缺失错误 */
export class PackDependencyMissingError extends PackError {
  constructor(packId: string, missingDep: string) {
    super(`Pack "${packId}" depends on "${missingDep}" which is not registered`);
    this.name = 'PackDependencyMissingError';
  }
}

/** 资源命名冲突错误（非 namespaced 模式下检测到全局重名） */
export class PackConflictError extends PackError {
  /** 冲突的资源类型 */
  readonly resourceType: 'tool' | 'agent' | 'capability' | 'skill';
  /** 冲突的资源名 */
  readonly resourceName: string;
  /** 已占用该名的 pack id（若有记录） */
  readonly ownerPackId?: string;

  constructor(
    resourceType: PackConflictError['resourceType'],
    resourceName: string,
    ownerPackId?: string,
  ) {
    const owner = ownerPackId ? ` (already owned by pack "${ownerPackId}")` : '';
    super(
      `Resource conflict: ${resourceType} "${resourceName}" is already registered${owner}. ` +
        `Either rename it, enable namespaced mode, or unuse the conflicting pack first.`,
      ownerPackId,
    );
    this.name = 'PackConflictError';
    this.resourceType = resourceType;
    this.resourceName = resourceName;
    this.ownerPackId = ownerPackId;
  }
}

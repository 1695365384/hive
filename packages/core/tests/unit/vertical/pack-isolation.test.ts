/**
 * PackManager Phase 3 — 运行时隔离测试
 *
 * 覆盖：
 * - 非 namespaced 模式下资源命名冲突检测（PackConflictError）
 * - namespaced 模式自动前缀，多 pack 互不干扰
 * - unloadPack 精确清理归属资源（tool/agent/capability/hook）
 * - 卸载后冲突的 pack 可重新注册
 * - forceRemove（apply 前 unuse）
 */

import { describe, it, expect, vi } from "vitest";
import { PackManager } from "../../../src/vertical/PackManager.js";
import {
  PackConflictError,
  type VerticalPack,
  type PackApplyTarget,
} from "../../../src/vertical/index.js";

// ============================================
// 支持隔离语义的 mock target
// ============================================

interface FullMockTarget extends PackApplyTarget {
  capabilities: Map<string, unknown>;
  agents: Map<string, unknown>;
  tools: Map<string, unknown>;
  agentTools: Map<string, string[]>;
  hooks: Map<string, { event: string; handler: unknown }>;
  hookSeq: number;
}

function createFullMockTarget(): FullMockTarget {
  const t: FullMockTarget = {
    capabilities: new Map(),
    agents: new Map(),
    tools: new Map(),
    agentTools: new Map(),
    hooks: new Map(),
    hookSeq: 0,
    registerCapability: (c: unknown) => {
      const cap = c as { name: string };
      t.capabilities.set(cap.name, c);
    },
    unregisterCapability: (name: string) => t.capabilities.delete(name),
    agentRegistry: {
      register: (name: string, config: unknown) => t.agents.set(name, config),
      unregister: (name: string) => t.agents.delete(name),
    },
    runner: {
      getToolRegistry: () => ({
        register: (name: string, tool: unknown) => t.tools.set(name, tool),
        unregister: (name: string) => t.tools.delete(name),
        registerAgentTools: (agentType: string, toolNames: string[]) =>
          t.agentTools.set(agentType, toolNames),
        unregisterAgentTools: (agentType: string) => t.agentTools.delete(agentType),
      }),
      registerAgentDefinition: (name: string, config: unknown) =>
        t.agents.set(name, config),
      unregisterAgentDefinition: (name: string) => t.agents.delete(name),
    },
    hookRegistry: {
      on: (event: never, handler: unknown) => {
        const id = `hook-${++t.hookSeq}`;
        t.hooks.set(id, { event, handler });
        return id;
      },
      off: (id: string) => t.hooks.delete(id),
    },
  };
  return t;
}

function createFullMockAgent() {
  const skills = new Map<string, unknown>();
  return {
    skillRegistry: {
      unregister: (name: string) => skills.delete(name),
      hasRegistered: (name: string) => skills.has(name),
      store: skills,
    },
    registerSkill: (skill: unknown) => {
      const s = skill as { name: string };
      skills.set(s.name, skill);
    },
  };
}

function makePack(overrides: Partial<VerticalPack> = {}): VerticalPack {
  return {
    id: "test-pack",
    name: "Test Pack",
    version: "1.0.0",
    ...overrides,
  };
}

// ============================================
// 冲突检测
// ============================================

describe("PackManager Phase 3 — 冲突检测", () => {
  it("非 namespaced 模式下 tool 重名抛 PackConflictError", async () => {
    const pm = new PackManager();
    const tool = { description: "x" } as never;
    pm.use(makePack({ id: "legal", tools: [{ name: "query", tool }] }));
    pm.use(makePack({ id: "medical", tools: [{ name: "query", tool }] }));

    const target = createFullMockTarget();
    await expect(pm.apply(createFullMockAgent(), target)).rejects.toThrow(
      PackConflictError,
    );
    // legal 先注册，medical 冲突
    expect(target.tools.has("query")).toBe(true);
    expect(target.tools.size).toBe(1);
  });

  it("非 namespaced 模式下 agent 重名抛 PackConflictError", async () => {
    const pm = new PackManager();
    pm.use(
      makePack({
        id: "legal",
        agents: [{ name: "reviewer", config: { type: "custom" } as never }],
      }),
    );
    pm.use(
      makePack({
        id: "medical",
        agents: [{ name: "reviewer", config: { type: "custom" } as never }],
      }),
    );

    const target = createFullMockTarget();
    await expect(pm.apply(createFullMockAgent(), target)).rejects.toThrow(
      PackConflictError,
    );
  });

  it("非 namespaced 模式下 capability 重名抛 PackConflictError", async () => {
    const pm = new PackManager();
    const cap = { name: "shared-cap", initialize: vi.fn() } as never;
    pm.use(makePack({ id: "a", capabilities: [cap] }));
    pm.use(makePack({ id: "b", capabilities: [cap] }));

    const target = createFullMockTarget();
    await expect(pm.apply(createFullMockAgent(), target)).rejects.toThrow(
      PackConflictError,
    );
  });

  it("同 pack 重复声明同名 tool 不报错（幂等）", async () => {
    const pm = new PackManager();
    const tool = { description: "x" } as never;
    pm.use(
      makePack({
        id: "legal",
        tools: [
          { name: "query", tool },
          { name: "query", tool },
        ],
      }),
    );

    const target = createFullMockTarget();
    await expect(pm.apply(createFullMockAgent(), target)).resolves.toBeUndefined();
    expect(target.tools.size).toBe(1);
  });
});

// ============================================
// 命名空间隔离
// ============================================

describe("PackManager Phase 3 — namespaced 隔离", () => {
  it("namespaced 模式下 tool 自动加前缀，多 pack 互不干扰", async () => {
    const pm = new PackManager();
    const tool = { description: "x" } as never;
    pm.use(
      makePack({ id: "legal", namespaced: true, tools: [{ name: "query", tool }] }),
    );
    pm.use(
      makePack({
        id: "medical",
        namespaced: true,
        tools: [{ name: "query", tool }],
      }),
    );

    const target = createFullMockTarget();
    await pm.apply(createFullMockAgent(), target);

    expect(target.tools.has("legal::query")).toBe(true);
    expect(target.tools.has("medical::query")).toBe(true);
    expect(target.tools.size).toBe(2);
  });

  it("namespaced 模式下 agent 自动加前缀", async () => {
    const pm = new PackManager();
    pm.use(
      makePack({
        id: "legal",
        namespaced: true,
        agents: [{ name: "reviewer", config: { type: "custom" } as never }],
      }),
    );
    pm.use(
      makePack({
        id: "medical",
        namespaced: true,
        agents: [{ name: "reviewer", config: { type: "custom" } as never }],
      }),
    );

    const target = createFullMockTarget();
    await pm.apply(createFullMockAgent(), target);

    expect(target.agents.has("legal::reviewer")).toBe(true);
    expect(target.agents.has("medical::reviewer")).toBe(true);
  });

  it("namespaced 与非 namespaced 同名的 tool 也会冲突（全局占用表）", async () => {
    const pm = new PackManager();
    const tool = { description: "x" } as never;
    pm.use(makePack({ id: "legal", tools: [{ name: "query", tool }] }));
    pm.use(
      makePack({
        id: "medical",
        namespaced: true,
        tools: [{ name: "query", tool }],
      }),
    );

    const target = createFullMockTarget();
    // legal 注册 "query"，medical 注册 "medical::query" —— 不冲突
    await expect(pm.apply(createFullMockAgent(), target)).resolves.toBeUndefined();
    expect(target.tools.has("query")).toBe(true);
    expect(target.tools.has("medical::query")).toBe(true);
  });
});

// ============================================
// unloadPack 资源清理
// ============================================

describe("PackManager Phase 3 — unloadPack 清理", () => {
  it("卸载后移除该 pack 注册的全部 tool/agent/capability/hook", async () => {
    const pm = new PackManager();
    const cap = { name: "legal-cap", initialize: vi.fn() } as never;
    const tool = { description: "x" } as never;
    const disposed: string[] = [];

    pm.use(
      makePack({
        id: "legal",
        capabilities: [cap],
        tools: [{ name: "query-law", tool }],
        agents: [{ name: "legal-reviewer", config: { type: "custom" } as never }],
        hooks: [{ event: "tool:before" as never, handler: vi.fn() as never }],
        dispose: () => {
          disposed.push("legal");
        },
      }),
    );
    pm.use(
      makePack({
        id: "medical",
        capabilities: [{ name: "medical-cap", initialize: vi.fn() } as never],
        tools: [{ name: "query-med", tool }],
      }),
    );

    const target = createFullMockTarget();
    const agent = createFullMockAgent();
    await pm.apply(agent, target);

    // 应用后：legal 的资源都在
    expect(target.tools.has("query-law")).toBe(true);
    expect(target.agents.has("legal-reviewer")).toBe(true);
    expect(target.capabilities.has("legal-cap")).toBe(true);
    const beforeHooks = target.hooks.size;

    const ok = await pm.unloadPack("legal", target, agent);
    expect(ok).toBe(true);

    // legal 的资源被移除，medical 不受影响
    expect(target.tools.has("query-law")).toBe(false);
    expect(target.tools.has("query-med")).toBe(true);
    expect(target.agents.has("legal-reviewer")).toBe(false);
    expect(target.capabilities.has("legal-cap")).toBe(false);
    expect(target.hooks.size).toBe(beforeHooks - 1);
    expect(disposed).toContain("legal");

    // pack 从管理器移除
    expect(pm.has("legal")).toBe(false);
    expect(pm.has("medical")).toBe(true);
  });

  it("卸载后（用新 PackManager）同名资源可重新被注册（冲突解决）", async () => {
    const tool = { description: "x" } as never;
    const target = createFullMockTarget();
    const agent = createFullMockAgent();

    // 第一轮：legal 占用 "query"
    const pm1 = new PackManager();
    pm1.use(makePack({ id: "legal", tools: [{ name: "query", tool }] }));
    await pm1.apply(agent, target);
    expect(target.tools.has("query")).toBe(true);

    // 卸载 legal，释放 "query" 的全局占用
    await pm1.unloadPack("legal", target, agent);
    expect(target.tools.has("query")).toBe(false);

    // 第二轮：用新 PackManager 注册同名资源的 medical pack（模拟重新加载场景）
    const pm2 = new PackManager();
    pm2.use(makePack({ id: "medical", tools: [{ name: "query", tool }] }));
    await expect(pm2.apply(agent, target)).resolves.toBeUndefined();
    expect(target.tools.has("query")).toBe(true);
    expect(target.tools.size).toBe(1);
  });

  it("namespaced 卸载只清自己的前缀资源", async () => {
    const pm = new PackManager();
    const tool = { description: "x" } as never;
    const target = createFullMockTarget();
    const agent = createFullMockAgent();

    pm.use(makePack({ id: "legal", namespaced: true, tools: [{ name: "query", tool }] }));
    pm.use(makePack({ id: "medical", namespaced: true, tools: [{ name: "query", tool }] }));
    await pm.apply(agent, target);

    await pm.unloadPack("legal", target, agent);
    expect(target.tools.has("legal::query")).toBe(false);
    expect(target.tools.has("medical::query")).toBe(true);
  });

  it("卸载不存在的 pack 返回 false", async () => {
    const pm = new PackManager();
    const target = createFullMockTarget();
    const agent = createFullMockAgent();
    pm.use(makePack({ id: "x" }));
    await pm.apply(agent, target);

    expect(await pm.unloadPack("nope", target, agent)).toBe(false);
  });
});

// ============================================
// forceRemove（apply 前 unuse）
// ============================================

describe("PackManager Phase 3 — forceRemove", () => {
  it("未 apply 时 forceRemove 直接移除注册", () => {
    const pm = new PackManager();
    pm.use(makePack({ id: "early" }));
    expect(pm.has("early")).toBe(true);
    expect(pm.forceRemove("early")).toBe(true);
    expect(pm.has("early")).toBe(false);
  });

  it("已 apply 后 forceRemove 返回 false（应走 unloadPack）", async () => {
    const pm = new PackManager();
    pm.use(makePack({ id: "applied" }));
    await pm.apply(createFullMockAgent(), createFullMockTarget());
    expect(pm.forceRemove("applied")).toBe(false);
    expect(pm.has("applied")).toBe(true);
  });
});

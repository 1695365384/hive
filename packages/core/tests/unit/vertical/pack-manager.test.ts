/**
 * PackManager 单元测试
 *
 * 覆盖：注册/去重、拓扑排序、循环依赖检测、依赖缺失、
 * apply 编排顺序、幂等、dispose 反向。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { PackManager } from "../../../src/vertical/PackManager.js";
import {
  PackCycleError,
  PackDependencyMissingError,
  type VerticalPack,
  type PackApplyTarget,
} from "../../../src/vertical/index.js";

// ============================================
// 测试用的 mock target
// ============================================

function createMockTarget(): PackApplyTarget & {
  registeredCapabilities: unknown[];
  registeredAgents: Array<{ name: string; config: unknown }>;
  registeredTools: Array<{ name: string; tool: unknown }>;
  registeredHooks: Array<{ event: string; handler: unknown }>;
} {
  const store = {
    registeredCapabilities: [] as unknown[],
    registeredAgents: [] as Array<{ name: string; config: unknown }>,
    registeredTools: [] as Array<{ name: string; tool: unknown }>,
    registeredHooks: [] as Array<{ event: string; handler: unknown }>,
  };
  return {
    ...store,
    registerCapability: (c: unknown) => store.registeredCapabilities.push(c),
    agentRegistry: {
      register: (name: string, config: unknown) =>
        store.registeredAgents.push({ name, config }),
    },
    runner: {
      getToolRegistry: () => ({
        register: (name: string, tool: unknown) =>
          store.registeredTools.push({ name, tool }),
        registerAgentTools: () => {},
      }),
      registerAgentDefinition: (name: string, config: unknown) =>
        store.registeredAgents.push({ name, config }),
    },
    hookRegistry: {
      on: (event: string, handler: unknown) => {
        store.registeredHooks.push({ event, handler });
        return "hook-id";
      },
    },
  };
}

function createMockAgent() {
  return {
    registerSkill: vi.fn(),
  };
}

/** 构造最小 pack */
function makePack(overrides: Partial<VerticalPack> = {}): VerticalPack {
  return {
    id: "test-pack",
    name: "Test Pack",
    version: "1.0.0",
    ...overrides,
  };
}

// ============================================
// 注册与去重
// ============================================

describe("PackManager — 注册", () => {
  let pm: PackManager;
  beforeEach(() => {
    pm = new PackManager();
  });

  it("注册后可通过 has/get/list 访问", () => {
    const pack = makePack({ id: "legal" });
    pm.use(pack);
    expect(pm.has("legal")).toBe(true);
    expect(pm.get("legal")).toBe(pack);
    expect(pm.list()).toEqual(["legal"]);
    expect(pm.size).toBe(1);
  });

  it("支持链式调用", () => {
    pm.use(makePack({ id: "a" }))
      .use(makePack({ id: "b" }))
      .use(makePack({ id: "c" }));
    expect(pm.size).toBe(3);
  });

  it("重复注册同 id 抛错", () => {
    pm.use(makePack({ id: "dup" }));
    expect(() => pm.use(makePack({ id: "dup" }))).toThrow(/already registered/);
  });

  it("空 id 抛错", () => {
    expect(() => pm.use(makePack({ id: "" }))).toThrow(/non-empty id/);
  });

  it("apply 后再注册抛错", async () => {
    pm.use(makePack({ id: "x" }));
    await pm.apply(createMockAgent(), createMockTarget());
    expect(() => pm.use(makePack({ id: "y" }))).toThrow(/after apply/);
  });
});

// ============================================
// 拓扑排序
// ============================================

describe("PackManager — 拓扑排序", () => {
  let pm: PackManager;
  beforeEach(() => {
    pm = new PackManager();
  });

  it("无依赖时按注册顺序", () => {
    pm.use(makePack({ id: "c" }));
    pm.use(makePack({ id: "a" }));
    pm.use(makePack({ id: "b" }));
    const sorted = pm.topologicalSort();
    expect(sorted.map((p) => p.id)).toEqual(["c", "a", "b"]);
  });

  it("单依赖：a 依赖 b，b 在前", () => {
    pm.use(makePack({ id: "a", dependencies: ["b"] }));
    pm.use(makePack({ id: "b" }));
    const sorted = pm.topologicalSort();
    expect(sorted.map((p) => p.id)).toEqual(["b", "a"]);
  });

  it("多依赖：c 依赖 a 和 b，a/b 在前", () => {
    pm.use(makePack({ id: "c", dependencies: ["a", "b"] }));
    pm.use(makePack({ id: "a" }));
    pm.use(makePack({ id: "b" }));
    const sorted = pm.topologicalSort();
    const ids = sorted.map((p) => p.id);
    expect(ids.indexOf("a")).toBeLessThan(ids.indexOf("c"));
    expect(ids.indexOf("b")).toBeLessThan(ids.indexOf("c"));
    expect(ids[2]).toBe("c");
  });

  it("链式依赖：c→b→a", () => {
    pm.use(makePack({ id: "c", dependencies: ["b"] }));
    pm.use(makePack({ id: "b", dependencies: ["a"] }));
    pm.use(makePack({ id: "a" }));
    const sorted = pm.topologicalSort();
    expect(sorted.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("循环依赖抛 PackCycleError", () => {
    pm.use(makePack({ id: "a", dependencies: ["b"] }));
    pm.use(makePack({ id: "b", dependencies: ["a"] }));
    expect(() => pm.topologicalSort()).toThrow(PackCycleError);
  });

  it("自循环抛错", () => {
    pm.use(makePack({ id: "self", dependencies: ["self"] }));
    expect(() => pm.topologicalSort()).toThrow(PackCycleError);
  });

  it("依赖缺失抛 PackDependencyMissingError", () => {
    pm.use(makePack({ id: "a", dependencies: ["nonexistent"] }));
    expect(() => pm.topologicalSort()).toThrow(PackDependencyMissingError);
  });
});

// ============================================
// Apply 编排
// ============================================

describe("PackManager — apply", () => {
  let pm: PackManager;
  beforeEach(() => {
    pm = new PackManager();
  });

  it("空 pack 集合 apply 是 no-op", async () => {
    const target = createMockTarget();
    await pm.apply(createMockAgent(), target);
    expect(pm.isApplied).toBe(true);
    expect(target.registeredCapabilities).toHaveLength(0);
  });

  it("apply 注册所有扩展点（正确顺序）", async () => {
    const mockCap = { name: "test-cap", initialize: vi.fn() };
    const mockTool = { description: "test" };
    const mockSkill = { metadata: { name: "skill1" } };
    const mockAgent = createMockAgent();
    const target = createMockTarget();

    pm.use(
      makePack({
        id: "full",
        capabilities: [mockCap as unknown as never],
        agents: [{ name: "reviewer", config: { type: "custom" } as never }],
        tools: [{ name: "query", tool: mockTool as unknown as never }],
        skills: [{ skill: mockSkill as unknown as never }],
        hooks: [{ event: "tool:before" as never, handler: vi.fn() as never }],
      }),
    );

    await pm.apply(mockAgent, target);

    expect(target.registeredCapabilities).toHaveLength(1);
    // agent 注册到 agentRegistry + runner.registerAgentDefinition（两处）
    expect(target.registeredAgents).toHaveLength(2);
    expect(target.registeredAgents.every(a => a.name === "reviewer")).toBe(true);
    expect(target.registeredTools).toEqual([{ name: "query", tool: mockTool }]);
    expect(target.registeredHooks).toHaveLength(1);
    expect(mockAgent.registerSkill).toHaveBeenCalledWith(mockSkill);
  });

  it("setup 在所有扩展点注册后调用", async () => {
    const setupOrder: string[] = [];
    const target = createMockTarget();

    pm.use(
      makePack({
        id: "a",
        tools: [{ name: "tool-a", tool: {} as never }],
        setup: () => {
          setupOrder.push("a-setup");
        },
      }),
    );

    await pm.apply(createMockAgent(), target);
    expect(setupOrder).toEqual(["a-setup"]);
    expect(target.registeredTools).toHaveLength(1); // setup 前已注册
  });

  it("按拓扑顺序 apply", async () => {
    const order: string[] = [];
    const target = createMockTarget();

    pm.use(
      makePack({
        id: "child",
        dependencies: ["parent"],
        setup: () => {
          order.push("child");
        },
      }),
    );
    pm.use(
      makePack({
        id: "parent",
        setup: () => {
          order.push("parent");
        },
      }),
    );

    await pm.apply(createMockAgent(), target);
    expect(order).toEqual(["parent", "child"]);
  });

  it("apply 是幂等的（多次调用不重复注册）", async () => {
    const target = createMockTarget();
    pm.use(makePack({ id: "x", tools: [{ name: "t", tool: {} as never }] }));

    await pm.apply(createMockAgent(), target);
    await pm.apply(createMockAgent(), target); // 第二次

    expect(target.registeredTools).toHaveLength(1);
  });

  it("setup 抛错中断 apply", async () => {
    pm.use(
      makePack({
        id: "bad",
        setup: () => {
          throw new Error("setup failed");
        },
      }),
    );

    await expect(pm.apply(createMockAgent(), createMockTarget())).rejects.toThrow(
      "setup failed",
    );
  });
});

// ============================================
// Dispose
// ============================================

describe("PackManager — dispose", () => {
  it("反向顺序调用 dispose", async () => {
    const order: string[] = [];
    const pm = new PackManager();

    pm.use(
      makePack({
        id: "a",
        setup: () => {
          order.push("a-setup");
        },
        dispose: () => {
          order.push("a-dispose");
        },
      }),
    );
    pm.use(
      makePack({
        id: "b",
        setup: () => {
          order.push("b-setup");
        },
        dispose: () => {
          order.push("b-dispose");
        },
      }),
    );

    await pm.apply(createMockAgent(), createMockTarget());
    await pm.disposeAll();

    // setup 顺序：a, b（注册顺序）
    // dispose 顺序：b, a（反向）
    expect(order).toEqual(["a-setup", "b-setup", "b-dispose", "a-dispose"]);
  });

  it("dispose 出错不中断其他 pack 的销毁", async () => {
    const pm = new PackManager();
    const disposed: string[] = [];

    pm.use(
      makePack({
        id: "a",
        dispose: () => {
          disposed.push("a");
        },
      }),
    );
    pm.use(
      makePack({
        id: "b",
        dispose: () => {
          throw new Error("b dispose failed");
        },
      }),
    );

    await pm.apply(createMockAgent(), createMockTarget());
    await pm.disposeAll();

    // b 先 dispose（反向），出错但不中断 a
    expect(disposed).toContain("a");
  });

  it("disposeAll 后可重新注册（applied 重置）", async () => {
    const pm = new PackManager();
    pm.use(makePack({ id: "x" }));
    await pm.apply(createMockAgent(), createMockTarget());
    await pm.disposeAll();

    expect(pm.isApplied).toBe(false);
    expect(pm.size).toBe(0);

    // 可以重新 use + apply
    pm.use(makePack({ id: "y" }));
    await pm.apply(createMockAgent(), createMockTarget());
    expect(pm.isApplied).toBe(true);
    expect(pm.has("y")).toBe(true);
  });
});

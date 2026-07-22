import { describe, expect, it, beforeEach } from "vitest";
import { isDockVisible, pickPhase, useActivityStore } from "./activity-store";

describe("pickPhase", () => {
  it("waiting beats working and idle", () => {
    expect(pickPhase("working", "waiting")).toBe("waiting");
    expect(pickPhase("idle", "waiting")).toBe("waiting");
  });

  it("working beats idle", () => {
    expect(pickPhase("idle", "working")).toBe("working");
  });
});

describe("isDockVisible", () => {
  it("shows when working or waiting", () => {
    expect(isDockVisible({ phase: "working", title: "x" })).toBe(true);
    expect(isDockVisible({ phase: "waiting", title: "x", detail: "y" })).toBe(true);
  });

  it("hides idle unless within fade window", () => {
    const now = 1_000_000;
    expect(isDockVisible({ phase: "idle", title: "" }, now)).toBe(false);
    expect(
      isDockVisible({ phase: "idle", title: "", fadeIdleAt: now + 2000 }, now)
    ).toBe(true);
    expect(
      isDockVisible({ phase: "idle", title: "", fadeIdleAt: now - 1 }, now)
    ).toBe(false);
  });
});

describe("useActivityStore", () => {
  beforeEach(() => {
    useActivityStore.getState().reset();
  });

  it("beginRun sets working", () => {
    useActivityStore.getState().beginRun();
    expect(useActivityStore.getState().rollup.phase).toBe("working");
    expect(useActivityStore.getState().rollup.title).toBe("处理中");
  });

  it("setWaiting overrides working phase", () => {
    useActivityStore.getState().beginRun();
    useActivityStore.getState().setWaiting("等待确认 · 运行命令");
    expect(useActivityStore.getState().rollup.phase).toBe("waiting");
    expect(useActivityStore.getState().rollup.detail).toContain("等待确认");
  });

  it("setWorking does not downgrade from waiting", () => {
    useActivityStore.getState().beginRun();
    useActivityStore.getState().setWaiting("等待确认");
    useActivityStore.getState().setWorking({ detail: "读取文件" });
    expect(useActivityStore.getState().rollup.phase).toBe("waiting");
  });

  it("clearWaiting returns to working", () => {
    useActivityStore.getState().beginRun();
    useActivityStore.getState().setWaiting("等待确认");
    useActivityStore.getState().clearWaiting();
    expect(useActivityStore.getState().rollup.phase).toBe("working");
  });

  it("setIdle sets fade window", () => {
    useActivityStore.getState().beginRun();
    useActivityStore.getState().setIdle();
    const { rollup } = useActivityStore.getState();
    expect(rollup.phase).toBe("idle");
    expect(rollup.fadeIdleAt).toBeGreaterThan(Date.now());
  });
});

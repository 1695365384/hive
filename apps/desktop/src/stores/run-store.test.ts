import { beforeEach, describe, expect, it } from "vitest";
import { useRunStore } from "./run-store";

describe("useRunStore", () => {
  beforeEach(() => {
    useRunStore.setState({
      runs: {},
      pendingAsk: {},
      messageCache: {},
      toasts: [],
      viewingSessionId: null,
    });
  });

  it("tracks a single in-flight run", () => {
    const store = useRunStore.getState();
    store.beginRun({
      sessionId: "a",
      assistantMsgId: "m1",
      title: "做 PPT",
    });
    expect(store.getInFlightSessionId()).toBe("a");
    expect(useRunStore.getState().hasLiveRun("a")).toBe(true);
    expect(useRunStore.getState().getRun("a")?.phase).toBe("running");
  });

  it("moves to waiting then back to running", () => {
    const s = useRunStore.getState();
    s.beginRun({ sessionId: "a", assistantMsgId: "m1", title: "t" });
    s.setPhase("a", "waiting");
    expect(useRunStore.getState().getRun("a")?.phase).toBe("waiting");
    s.setPhase("a", "running");
    expect(useRunStore.getState().getRun("a")?.phase).toBe("running");
  });

  it("settling hides getRun but getRunOrSettling still works", () => {
    const s = useRunStore.getState();
    s.beginRun({ sessionId: "a", assistantMsgId: "m1", title: "t" });
    s.beginSettling("a");
    expect(useRunStore.getState().getRun("a")).toBeUndefined();
    expect(useRunStore.getState().getRunOrSettling("a")?.assistantMsgId).toBe("m1");
  });

  // Regression: ISSUE-001 — Found by /qa on 2026-07-17
  // Report: .gstack/qa-reports/qa-report-hive-desktop-2026-07-17.md
  it("expired settling does not clearRun synchronously during getRunOrSettling", async () => {
    const s = useRunStore.getState();
    s.beginRun({ sessionId: "a", assistantMsgId: "m1", title: "t" });
    useRunStore.setState((state) => ({
      runs: {
        ...state.runs,
        a: {
          ...state.runs.a!,
          phase: "settling",
          settleUntil: Date.now() - 1,
        },
      },
    }));
    expect(useRunStore.getState().getRunOrSettling("a")).toBeUndefined();
    // Still present until microtask flush (safe for React render)
    expect(useRunStore.getState().runs.a).toBeDefined();
    await Promise.resolve();
    expect(useRunStore.getState().runs.a).toBeUndefined();
  });

  it("dedupes toasts by session+kind", () => {
    const s = useRunStore.getState();
    s.pushToast({ sessionId: "a", kind: "complete", title: "A" });
    s.pushToast({ sessionId: "a", kind: "complete", title: "A2" });
    expect(useRunStore.getState().toasts).toHaveLength(1);
    expect(useRunStore.getState().toasts[0]!.title).toBe("A2");
  });

  it("updates message cache for background sessions", () => {
    const s = useRunStore.getState();
    s.setMessageCache("a", [
      { id: "u1", role: "user", content: [{ type: "text", text: "hi" }], createdAt: 1 },
    ]);
    s.updateMessageCache("a", (prev) => [
      ...prev,
      { id: "a1", role: "assistant", content: [{ type: "text", text: "ok" }], createdAt: 2 },
    ]);
    expect(useRunStore.getState().getMessageCache("a")).toHaveLength(2);
  });
});

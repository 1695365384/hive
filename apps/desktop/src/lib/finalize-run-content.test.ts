import { describe, expect, it } from "vitest";
import { finalizeRunContent, hasOpenRunParts } from "./finalize-run-content";
import type { ContentPart } from "../types/chat";

describe("finalizeRunContent", () => {
  it("closes open tool calls and workers", () => {
    const content: ContentPart[] = [
      { type: "tool-call", toolCallId: "t1", toolName: "agent", args: { type: "office" }, startedAt: Date.now() - 1000 },
      { type: "worker-start", workerId: "w1", workerType: "office", description: "做页" },
      { type: "office-progress", phase: "adding_slide", slide: 2 },
    ];
    const out = finalizeRunContent(content, { success: true });
    expect(out.find((p) => p.type === "tool-call")).toMatchObject({
      result: "已结束",
      isError: false,
    });
    expect(out.some((p) => p.type === "worker-complete" && p.workerId === "w1" && p.success)).toBe(true);
    expect(hasOpenRunParts(out)).toBe(false);
  });

  it("marks cancelled tools as errors", () => {
    const content: ContentPart[] = [
      { type: "tool-call", toolCallId: "t1", toolName: "Bash", args: {} },
      { type: "worker-start", workerId: "w1", workerType: "general" },
    ];
    const out = finalizeRunContent(content, { cancelled: true });
    expect(out[0]).toMatchObject({ type: "tool-call", result: "已取消", isError: true });
    expect(out[out.length - 1]).toMatchObject({
      type: "worker-complete",
      success: false,
      error: "已取消",
    });
  });

  it("leaves completed parts alone", () => {
    const content: ContentPart[] = [
      { type: "tool-call", toolCallId: "t1", toolName: "Read", args: {}, result: "ok", durationMs: 12 },
      { type: "worker-start", workerId: "w1", workerType: "explore" },
      { type: "worker-complete", workerId: "w1", workerType: "explore", success: true, duration: 100 },
    ];
    const out = finalizeRunContent(content, { success: true });
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ result: "ok", durationMs: 12 });
    expect(hasOpenRunParts(content)).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { groupContentParts } from "./group-content-parts";
import type { ContentPart } from "../types/chat";

describe("groupContentParts", () => {
  it("merges consecutive same-name tool calls into tool-batch", () => {
    const parts: ContentPart[] = [
      { type: "tool-call", toolCallId: "1", toolName: "Glob", args: { pattern: "a" } },
      { type: "tool-call", toolCallId: "2", toolName: "Glob", args: { pattern: "b" } },
    ];

    const grouped = groupContentParts(parts);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]).toMatchObject({ type: "tool-batch", toolName: "Glob", count: 2 });
  });

  it("preserves scenarioId on worker group", () => {
    const parts: ContentPart[] = [
      {
        type: "worker-start",
        workerId: "w1",
        workerType: "office",
        description: "制作 AI 主题 PPT",
        scenarioId: "office-document",
      },
      { type: "worker-complete", workerId: "w1", workerType: "office", success: true },
    ];

    const grouped = groupContentParts(parts);
    expect(grouped).toHaveLength(1);
    if (grouped[0].type === "worker") {
      expect(grouped[0].scenarioId).toBe("office-document");
      expect(grouped[0].description).toBe("制作 AI 主题 PPT");
    }
  });

  it("nests tool calls under active worker", () => {
    const parts: ContentPart[] = [
      { type: "worker-start", workerId: "w1", workerType: "explore" },
      { type: "tool-call", toolCallId: "1", toolName: "Read", args: {}, workerId: "w1" },
      { type: "worker-complete", workerId: "w1", workerType: "explore", success: true, duration: 1200 },
    ];

    const grouped = groupContentParts(parts);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].type).toBe("worker");
    if (grouped[0].type === "worker") {
      expect(grouped[0].children).toHaveLength(1);
      expect(grouped[0].status).toBe("completed");
    }
  });

  it("merges consecutive reasoning blocks inside worker", () => {
    const parts: ContentPart[] = [
      { type: "worker-start", workerId: "w1", workerType: "explore" },
      { type: "reasoning", text: "thinking ", workerId: "w1" },
      { type: "reasoning", text: "more", workerId: "w1" },
      { type: "worker-complete", workerId: "w1", workerType: "explore", success: true },
    ];

    const grouped = groupContentParts(parts);
    if (grouped[0].type === "worker") {
      expect(grouped[0].children).toHaveLength(1);
      if (grouped[0].children[0].type === "reasoning") {
        expect(grouped[0].children[0].text).toBe("thinking more");
      }
    }
  });

  it("drops coordinator reasoning without workerId", () => {
    const parts: ContentPart[] = [
      { type: "reasoning", text: "hidden" },
      { type: "text", text: "visible" },
    ];

    const grouped = groupContentParts(parts);
    expect(grouped).toEqual([{ type: "text", text: "visible" }]);
  });
});

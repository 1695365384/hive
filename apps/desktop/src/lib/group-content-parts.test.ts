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
    expect(grouped[0]).toMatchObject({ type: "tool-batch", toolName: "file-ops", count: 2 });
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

  it("keeps route chip as top-level part", () => {
    const parts: ContentPart[] = [
      { type: "route", mode: "direct" },
      { type: "text", text: "你好" },
    ];
    const grouped = groupContentParts(parts);
    expect(grouped[0]).toMatchObject({ type: "route", mode: "direct" });
    expect(grouped[1]).toMatchObject({ type: "text", text: "你好" });
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

  it("keeps deliverables top-level after worker (with live pptx dedupe)", () => {
    const pptPath = "/workspace/AI制作PPT能力展示.pptx";
    const parts: ContentPart[] = [
      {
        type: "worker-start",
        workerId: "w1",
        workerType: "office",
        description: "创建PPT",
      },
      { type: "worker-complete", workerId: "w1", workerType: "office", success: true, duration: 392500 },
      {
        type: "file-attachment",
        name: "slide1.png",
        size: 1200,
        mimeType: "image/png",
        path: "/workspace/slide1.png",
        src: "/files/uuid_slide1.png",
      },
      {
        type: "file-attachment",
        name: "AI制作PPT能力展示.pptx",
        size: 8900,
        mimeType: "application/octet-stream",
        path: pptPath,
        src: "/files/uuid_v1.pptx",
      },
      {
        type: "file-attachment",
        name: "AI制作PPT能力展示.pptx",
        size: 17600,
        mimeType: "application/octet-stream",
        path: pptPath,
        src: "/files/uuid_v2.pptx",
      },
      {
        type: "file-attachment",
        name: "AI制作PPT能力展示.pptx",
        size: 20300,
        mimeType: "application/octet-stream",
        path: pptPath,
        src: "/files/uuid_v3.pptx",
      },
      { type: "text", text: "PPT 已创建完成" },
    ];

    const grouped = groupContentParts(parts);
    expect(grouped.map((g) => g.type)).toEqual([
      "worker",
      "file-attachment",
      "file-attachment",
      "text",
    ]);
    const ppt = grouped.find(
      (g) => g.type === "file-attachment" && g.name.endsWith(".pptx"),
    );
    expect(ppt?.type === "file-attachment" && ppt.size).toBe(20300);
    expect(grouped[grouped.length - 1]).toEqual({ type: "text", text: "PPT 已创建完成" });
  });

  it("groups consecutive screenshots into a horizontal image-gallery", () => {
    const parts: ContentPart[] = [
      {
        type: "file-attachment",
        name: "slide1.png",
        size: 100,
        mimeType: "image/png",
        path: "/tmp/slide1.png",
        src: "/files/slide1.png",
      },
      {
        type: "file-attachment",
        name: "slide2.png",
        size: 120,
        mimeType: "image/png",
        path: "/tmp/slide2.png",
        src: "/files/slide2.png",
      },
      {
        type: "file-attachment",
        name: "deck.pptx",
        size: 200,
        mimeType: "application/octet-stream",
        path: "/tmp/deck.pptx",
      },
    ];
    const grouped = groupContentParts(parts);
    expect(grouped.map((g) => g.type)).toEqual(["image-gallery", "file-attachment"]);
    expect(grouped[0].type === "image-gallery" && grouped[0].images).toHaveLength(2);
  });

  it("batches Read/Glob/Grep under explore into one file-ops strip", () => {
    const parts: ContentPart[] = [
      { type: "worker-start", workerId: "w1", workerType: "explore", description: "查找相关文件" },
      { type: "tool-call", toolCallId: "1", toolName: "Glob", args: { pattern: "**/*.ts" }, workerId: "w1" },
      { type: "reasoning", text: "next", workerId: "w1" },
      { type: "tool-call", toolCallId: "2", toolName: "Read", args: { path: "a.ts" }, workerId: "w1" },
      { type: "tool-call", toolCallId: "3", toolName: "Grep", args: { pattern: "foo" }, workerId: "w1" },
      { type: "worker-complete", workerId: "w1", workerType: "explore", success: true, duration: 900 },
    ];

    const grouped = groupContentParts(parts);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].type).toBe("worker");
    if (grouped[0].type === "worker") {
      expect(grouped[0].status).toBe("completed");
      expect(grouped[0].children).toHaveLength(1);
      expect(grouped[0].children[0]).toMatchObject({
        type: "tool-batch",
        toolName: "file-ops",
        count: 3,
      });
    }
  });

  it("nests tool calls that arrive after worker-complete", () => {
    const parts: ContentPart[] = [
      { type: "worker-start", workerId: "w1", workerType: "explore" },
      { type: "worker-complete", workerId: "w1", workerType: "explore", success: true, duration: 10 },
      { type: "tool-call", toolCallId: "late", toolName: "Glob", args: {}, workerId: "w1" },
      { type: "tool-call", toolCallId: "late2", toolName: "Read", args: {}, workerId: "w1" },
    ];
    const grouped = groupContentParts(parts);
    expect(grouped).toHaveLength(1);
    if (grouped[0].type === "worker") {
      expect(grouped[0].children[0]).toMatchObject({
        type: "tool-batch",
        toolName: "file-ops",
        count: 2,
      });
    }
  });
});

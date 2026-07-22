import { describe, expect, it } from "vitest";
import { formatToolLabel } from "../components/chat/activity-labels";

describe("formatToolLabel", () => {
  it("hides raw bash/officecli commands behind document copy", () => {
    expect(formatToolLabel("bash", { command: "officecli create demo.pptx" })).toBe(
      "文档助手正在制作演示文稿",
    );
  });

  it("formats read file paths", () => {
    expect(formatToolLabel("read", { file_path: "/tmp/汇报示例.pptx" })).toBe(
      "正在打开文档 · 汇报示例.pptx",
    );
  });

  it("formats agent office as document assistant work", () => {
    expect(formatToolLabel("agent", { type: "office" })).toBe(
      "文档助手正在制作演示文稿",
    );
  });

  it("formats ask_user without leaking tool id", () => {
    expect(formatToolLabel("ask_user", { question: "保存到哪里？" })).toBe(
      "需要确认 · 保存到哪里？",
    );
  });

  it("formats mcp office tools without raw ids", () => {
    expect(formatToolLabel("mcp_office-pptx", { path: "demo.pptx" })).toBe(
      "文档助手正在制作演示文稿",
    );
  });
});

import { describe, expect, it } from "vitest";
import { formatToolLabel } from "../components/chat/activity-labels";

describe("formatToolLabel", () => {
  it("formats bash commands", () => {
    expect(formatToolLabel("bash", { command: "officecli create demo.pptx" })).toBe(
      "运行命令 · officecli create demo.pptx"
    );
  });

  it("formats read file paths", () => {
    expect(formatToolLabel("read", { file_path: "/tmp/汇报示例.pptx" })).toBe(
      "读取文件 · 汇报示例.pptx"
    );
  });

  it("formats agent delegation", () => {
    expect(formatToolLabel("agent", { type: "office" })).toBe("委派 Office 文档任务");
  });
});

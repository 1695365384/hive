/**
 * pack-init 单元测试
 *
 * 验证 hive-pack init 生成的文件结构、内容完整性、命名转换。
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInit } from "../../../src/cli/pack-init.js";

describe("pack-init", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "hive-pack-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("生成完整的目录结构", async () => {
    await runInit({
      name: "legal-assistant",
      dir: tempDir,
      description: "法务助手",
    });

    const expectedFiles = [
      "package.json",
      "tsconfig.json",
      "src/index.ts",
      "src/tools/example.ts",
      "README.md",
      "skills/README.md",
    ];

    for (const file of expectedFiles) {
      await expect(access(join(tempDir, file))).resolves.toBeUndefined();
    }
  });

  it("生成的 package.json 包含正确的 pack 元信息", async () => {
    await runInit({
      name: "my-pack",
      dir: tempDir,
      description: "测试 pack",
    });

    const pkg = JSON.parse(await readFile(join(tempDir, "package.json"), "utf-8"));
    expect(pkg.name).toBe("@hive-pack/my-pack");
    expect(pkg.description).toBe("测试 pack");
    expect(pkg.peerDependencies["@bundy-lmw/hive-core"]).toBeDefined();
    expect(pkg.hive.type).toBe("vertical-pack");
    expect(pkg.hive.class).toBe("MyPack");
  });

  it("类名 PascalCase 转换正确（连字符 → 驼峰）", async () => {
    await runInit({
      name: "customer-service-bot",
      dir: tempDir,
    });

    const indexContent = await readFile(join(tempDir, "src/index.ts"), "utf-8");
    expect(indexContent).toContain("export class CustomerServiceBot");
    expect(indexContent).toContain("readonly id = 'customer-service-bot'");
  });

  it("生成的 index.ts 导入了 VerticalPack 接口", async () => {
    await runInit({ name: "test", dir: tempDir });

    const content = await readFile(join(tempDir, "src/index.ts"), "utf-8");
    expect(content).toContain("import type { VerticalPack }");
    expect(content).toContain("implements VerticalPack");
  });

  it("默认包含一个示例工具", async () => {
    await runInit({ name: "test", dir: tempDir });

    const content = await readFile(join(tempDir, "src/index.ts"), "utf-8");
    expect(content).toContain("example-query");
    expect(content).toContain("createExampleTool");
  });

  it("注释里包含所有 5 种扩展点的引导", async () => {
    await runInit({ name: "test", dir: tempDir });

    const content = await readFile(join(tempDir, "src/index.ts"), "utf-8");
    // 检查 5 种扩展点都在注释里出现了
    expect(content).toMatch(/agents\s*=/);
    expect(content).toMatch(/skills\s*=/);
    expect(content).toMatch(/capabilities\s*=/);
    expect(content).toMatch(/hooks\s*=/);
    expect(content).toMatch(/setup\s*\(/);
    expect(content).toMatch(/dispose\s*\(/);
  });

  it("tools/example.ts 导出 createExampleTool", async () => {
    await runInit({ name: "test", dir: tempDir });

    const content = await readFile(join(tempDir, "src/tools/example.ts"), "utf-8");
    expect(content).toContain("export function createExampleTool");
    expect(content).toContain("from 'ai'");
  });

  it("README 包含安装和使用说明", async () => {
    await runInit({ name: "my-tool", dir: tempDir, description: "我的工具" });

    const readme = await readFile(join(tempDir, "README.md"), "utf-8");
    expect(readme).toContain("npm install");
    expect(readme).toContain("@hive-pack/my-tool");
    expect(readme).toContain("agent.use");
    expect(readme).toContain("MyTool");
  });

  it("description 为空时用 pack name 兜底", async () => {
    await runInit({ name: "simple-pack", dir: tempDir });

    const content = await readFile(join(tempDir, "src/index.ts"), "utf-8");
    expect(content).toContain("readonly name = 'simple-pack'");
  });
});

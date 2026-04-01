## 1. EnvironmentContext 类型定义

- [x] 1.1 在 `packages/core/src/environment/` 下创建 `types.ts`，定义 `EnvironmentContext` interface（os、shell、node、tools、packageManager、projectType、cwd）
- [x] 1.2 创建 `index.ts` 导出类型

## 2. 环境探测模块

- [x] 2.1 创建 `packages/core/src/environment/probe.ts`，实现 `probeEnvironment(cwd?: string): Promise<EnvironmentContext>`
- [x] 2.2 实现 OS/Node 同步获取（`os` 模块 + `process.version`）
- [x] 2.3 实现 shell 类型检测（`process.env.SHELL` 解析）
- [x] 2.4 实现工具链并发探测（`which`/`where`，2s 超时，检测 git/pnpm/npm/yarn/docker/python3/go/cargo/brew）
- [x] 2.5 实现项目类型识别（tsconfig.json/package.json/go.mod/requirements.txt/pyproject.toml）
- [x] 2.6 实现包管理器检测（lockfile 优先，其次工具链结果）
- [x] 2.7 实现整体 5s 超时保护，超时返回部分结果
- [x] 2.8 单元测试：probeEnvironment 各场景覆盖

## 3. PromptBuildContext 扩展

- [x] 3.1 在 `PromptBuildContext` interface 新增 `environmentContext?: EnvironmentContext` 字段
- [x] 3.2 在 `DynamicPromptBuilder.buildSections()` 中新增 environment section（优先级 0）
- [x] 3.3 实现 `formatEnvironment(env: EnvironmentContext): string` 渲染 Markdown 格式
- [x] 3.4 单元测试：传入/不传入 environmentContext 的 prompt 输出验证

## 4. Server 集成

- [x] 4.1 在 `bootstrap()` 中调用 `probeEnvironment()` 并将结果存入 `HiveContext`
- [x] 4.2 在 `ChatCapability.send()` / `LLMRuntime.run()` 中将 `environmentContext` 传入 `PromptBuildContext`
- [x] 4.3 验证：`pnpm --filter @bundy-lmw/hive-server build` 通过

## 5. 端到端验证

- [x] 5.1 启动 server，发送 chat 请求，确认 Agent 的 system prompt 包含 `## Environment` section
- [x] 5.2 确认 Agent 首次对话不需要跑 `uname`/`which` 即可正确使用环境信息
- [x] 5.3 确认 CLI 模式（`hive chat`）也正常注入环境信息
- [x] 5.4 确认桌面端（Tauri sidecar）正常工作

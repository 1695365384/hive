## 1. Harness Layer 基础设施

- [x] 1.1 创建 `packages/core/src/tools/harness/types.ts` — ToolResult 接口、ErrorCode 联合类型、HarnessConfig 接口
- [x] 1.2 创建 `packages/core/src/tools/harness/hint-registry.ts` — HintTemplate 类型、FILE_HINT_TEMPLATES、BASH_HINT_TEMPLATES、getHint() 函数
- [x] 1.3 创建 `packages/core/src/tools/harness/retry.ts` — isRetryable()、isTransient()、retryWithBackoff()（max 2 次，指数退避）
- [x] 1.4 创建 `packages/core/src/tools/harness/serializer.ts` — serializeToolResult() 函数，格式：成功 `[OK]`、失败 `[Error]\n[Hint]`、安全 `[Security]\n[Hint]`
- [x] 1.5 创建 `packages/core/src/tools/harness/with-harness.ts` — withHarness() 高阶函数，串联 retry → hint injection → serialize，含异常兜底
- [x] 1.6 创建 `packages/core/src/tools/harness/index.ts` — barrel export
- [x] 1.7 编写 harness 层单元测试 `packages/core/tests/unit/tools/harness.test.ts` — ToolResult 序列化、retry 逻辑、hint 模板填充、异常兜底

## 2. file-tool 改造

- [x] 2.1 修改 `file-tool.ts` 的 execute 函数返回 ToolResult（内层 raw tool），所有返回点映射到错误码
- [x] 2.2 新增 `createRawFileTool()` 工厂函数返回 rawTool（execute → ToolResult），保留 `createFileTool()` 返回 withHarness 包装后的 tool
- [x] 2.3 更新 file-tool 单元测试，验证 ToolResult 返回码和 context

## 3. bash-tool 改造

- [x] 3.1 修改 `bash-tool.ts` 的 execute 函数返回 ToolResult（内层 raw tool），timeout 改为返回 TIMEOUT 而非 throw
- [x] 3.2 新增 `createRawBashTool()` 工厂函数返回 rawTool，保留 `createBashTool()` 返回 withHarness 包装后的 tool
- [x] 3.3 更新 bash-tool 单元测试，验证 ToolResult 返回码和 context

## 4. tool-registry 集成

- [x] 4.1 修改 `tool-registry.ts` 的 AGENT_TOOL_WHITELIST，工厂函数使用 withHarness 包装
- [x] 4.2 更新 barrel export（`tools/built-in/index.ts`），导出新的 raw 工厂函数
- [x] 4.3 运行全量测试 `pnpm test` 确保无回归

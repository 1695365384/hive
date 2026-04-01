## 1. Hint 模板

- [x] 1.1 在 `hint-registry.ts` 中新增 `SEND_FILE_HINTS` 模板（NETWORK、NOT_FOUND、PERMISSION）
- [x] 1.2 在 `hint-registry.ts` 中新增 `WEB_SEARCH_HINTS` 模板（NETWORK）
- [x] 1.3 在 `hint-registry.ts` 中新增 `WEB_FETCH_HINTS` 模板（NETWORK、PATH_BLOCKED、INVALID_PARAM、NOT_FOUND）
- [x] 1.4 在 `hint-registry.ts` 中新增 `GLOB_HINTS` 模板（PATH_BLOCKED）
- [x] 1.5 在 `hint-registry.ts` 中新增 `GREP_HINTS` 模板（PATH_BLOCKED、INVALID_PARAM）
- [x] 1.6 在 `hint-registry.ts` 中新增 `ASK_USER_HINTS` 模板（PERMISSION、EXEC_ERROR）
- [x] 1.7 更新 `getAllHintTemplates()` 合并新模板

## 2. send-file-tool 改造

- [x] 2.1 创建 `createRawSendFileTool()`，execute 返回 `ToolResult`，错误码映射（NETWORK/NOT_FOUND/PERMISSION）
- [x] 2.2 修改 `createSendFileTool()` 为 `withHarness(createRawSendFileTool(), { maxRetries: 2, baseDelay: 500 })`
- [x] 2.3 更新 `built-in/index.ts` 导出 `createRawSendFileTool`
- [x] 2.4 运行现有 send-file 测试，验证通过

## 3. web-search-tool 改造

- [x] 3.1 创建 `createRawWebSearchTool()`，execute 返回 `ToolResult`，错误码映射（NETWORK）
- [x] 3.2 修改 `createWebSearchTool()` 为 `withHarness(createRawWebSearchTool(), { maxRetries: 2, baseDelay: 500 })`
- [x] 3.3 更新 `built-in/index.ts` 导出 `createRawWebSearchTool`
- [x] 3.4 运行测试验证

## 4. web-fetch-tool 改造

- [x] 4.1 创建 `createRawWebFetchTool()`，execute 返回 `ToolResult`，错误码映射（NETWORK/PATH_BLOCKED/INVALID_PARAM/NOT_FOUND）
- [x] 4.2 修改 `createWebFetchTool()` 为 `withHarness(createRawWebFetchTool(), { maxRetries: 2, baseDelay: 500 })`
- [x] 4.3 更新 `built-in/index.ts` 导出 `createRawWebFetchTool`
- [x] 4.4 运行测试验证

## 5. glob-tool 改造

- [x] 5.1 创建 `createRawGlobTool()`，execute 返回 `ToolResult`，错误码映射（PATH_BLOCKED）
- [x] 5.2 修改 `createGlobTool()` 为 `withHarness(createRawGlobTool())`
- [x] 5.3 更新 `built-in/index.ts` 导出 `createRawGlobTool`
- [x] 5.4 运行测试验证

## 6. grep-tool 改造

- [x] 6.1 创建 `createRawGrepTool()`，execute 返回 `ToolResult`，错误码映射（PATH_BLOCKED/INVALID_PARAM）
- [x] 6.2 修改 `createGrepTool()` 为 `withHarness(createRawGrepTool())`
- [x] 6.3 更新 `built-in/index.ts` 导出 `createRawGrepTool`
- [x] 6.4 运行测试验证

## 7. ask-user-tool 改造

- [x] 7.1 创建 `createRawAskUserTool()`，execute 返回 `ToolResult`，错误码映射（PERMISSION/EXEC_ERROR）
- [x] 7.2 修改 `createAskUserTool()` 为 `withHarness(createRawAskUserTool())`
- [x] 7.3 更新 `built-in/index.ts` 导出 `createRawAskUserTool`
- [x] 7.4 运行测试验证

## 8. 全量验证

- [x] 8.1 运行 core 全量单元测试 `pnpm --filter @bundy-lmw/hive-core test`
- [x] 8.2 运行 server 全量测试 `vitest run --config vitest.config.ts tests/`
- [x] 8.3 运行 `pnpm -r build` 确保编译通过

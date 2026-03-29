## 1. CRITICAL: SDK 安全加固

- [x] 1.1 `ChatCapability.ts` — `process.env` spread 改为最小化白名单对象（仅 HOME/PATH/NODE_ENV + provider key/baseUrl）
- [x] 1.2 `runner.ts` — 同上，替换 `process.env` spread
- [x] 1.3 `llm-utils.ts` — 同上，替换 `process.env` spread
- [x] 1.4 `ChatCapability.ts` — `permissionMode` 从 `'bypassPermissions'` 改为 `'default'`，通过配置项支持覆盖
- [x] 1.5 `runner.ts` — 同上
- [x] 1.6 `llm-utils.ts` — 同上

## 2. CRITICAL: API 认证

- [x] 2.1 新建 `apps/server/src/gateway/auth.ts` — 实现 API Key 认证中间件（Bearer token + query param）
- [x] 2.2 `http.ts` — 所有路由注册认证中间件，支持 `auth.enabled` 配置开关
- [x] 2.3 `websocket.ts` — WebSocket 握手阶段验证 API Key（query param）
- [x] 2.4 `config.ts` — 添加 `auth.enabled` 和 `auth.apiKey` 配置项

## 3. CRITICAL: 凭证泄露修复

- [x] 3.1 `cli.ts` — `/debug` 命令移除 API Key 部分暴露，改为布尔指示器

## 4. HIGH: 代码质量修复

- [x] 4.1 `bootstrap.ts` — 添加插件路径校验函数（拒绝绝对路径和 `..` 遍历）
- [x] 4.2 `ScheduleRepository.ts` — `update()` 改为白名单列映射表
- [x] 4.3 `ScheduleRepository.ts` — `updateRun()` 同上（已为硬编码白名单，无需修改）
- [x] 4.4 `SessionManager.ts` — 扩展 `SessionMetadata` 类型消除 `as unknown as` 断言
- [x] 4.5 `ScheduleCapability.ts` — `parseIntentV2()` 移除 `pendingAutoSchedule` 副作用
- [x] 4.6 `ChatCapability.ts` — `processStream()` 修复 `toolCallCount` 双重递增
- [x] 4.7 `ScheduleCapability.ts` — `fallbackParseV2()` 移除硬编码 cron，改为始终 `needsConfirmation: true`
- [x] 4.8 `Dispatcher.ts` — `classify()` 空 catch 添加 debug 日志

## 5. HIGH: 测试补充

- [x] 5.1 新建 `packages/core/tests/unit/dispatch/extract-json.test.ts` — 覆盖嵌套对象、花括号字符串、反引号、格式错误、空输入
- [x] 5.2 `packages/core/tests/unit/dispatch/classifier.test.ts` — 添加 `classifyForDispatch` 解析路径测试

## 6. MEDIUM: 代码改进

- [x] 6.1 `cron-utils.ts` — 移除 `getNextRunTime()` 中无用的 `cronSchedule()` 调用
- [x] 6.2 `llm-utils.ts` — `extractJSON()` 反引号处理修复（JSON 标准只用双引号）
- [x] 6.3 `Agent.ts` — `chat()` 延迟 Promise 创建，改为 lazy function 传入 `withHeartbeat`
- [x] 6.4 `http.ts` — sessions Map 添加 10000 条上限 + LRU 淘汰
- [x] 6.5 `bootstrap.ts` — `dbPath` 改为 `path.resolve()` 绝对路径
- [x] 6.6 `http.ts` / `websocket.ts` / `bootstrap.ts` — `console.log` 替换为结构化 logger
- [x] 6.7 `classifier.ts` — `callClassifierLLM` 模型选择改为 provider-aware（从 context 获取 active provider）
- [x] 6.8 `classifier.ts` — `regexClassify` 优先级调整：code-task 关键词检测优先于 short-question 启发式
- [x] 6.9 `openai-compatible.ts` — `preprocessParams()` `delete` 改为解构排除
- [x] 6.10 `Dispatcher.ts:182-184` — 空 catch 添加 debug 日志

## 7. 验证

- [x] 7.1 `npm run build` — 确认全量编译通过
- [x] 7.2 `npx vitest run packages/core/tests/unit/` — 确认单元测试全部通过（30 files / 485 tests）
- [ ] 7.3 手动验证认证流程：无 Key → 401，有效 Key → 200

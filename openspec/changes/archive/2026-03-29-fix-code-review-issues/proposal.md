## Why

全量代码审查发现 4 个 CRITICAL、10 个 HIGH、11 个 MEDIUM 级别问题。其中 C-2/C-3/C-4 构成完整攻击链：无认证 HTTP 访问 → `bypassPermissions` 禁用所有安全限制 → `process.env` spread 泄露全部凭证到 SDK 子进程。这些问题在代码审查中被标记为 BLOCK，必须在合并前修复。

## What Changes

**CRITICAL 修复（4 项）：**
- 移除 CLI debug 输出中的 API Key 部分暴露，改为布尔指示器
- SDK 调用不再 spread 全部 `process.env`，改为最小化环境变量传递
- `permissionMode` 从 `'bypassPermissions'` 改为 `'default'`
- HTTP/WebSocket 端点添加 API Key 认证中间件

**HIGH 修复（10 项）：**
- 插件动态加载路径校验（白名单目录）
- WebSocket 网关实现实际协议握手或移除死代码
- `ScheduleRepository` 动态 SQL 改为白名单列映射
- `SessionManager` 消除 `as unknown as` 双重断言
- `ScheduleCapability.parseIntentV2()` 移除内部 `pendingAutoSchedule` 副作用
- `ChatCapability.processStream()` 修复 `toolCallCount` 双重递增
- `ChatCapability.processStream()` 拆分（101 行 → 多个 <50 行方法）
- `fallbackParseV2()` 不再硬编码 cron 表达式，改为返回 needsConfirmation
- 新增 `extractJSON()` 单元测试
- 新增 `classifyForDispatch()` 直接单元测试

**MEDIUM 修复（11 项）：**
- 移除 `getNextRunTime()` 中无用的 `cronSchedule()` 调用
- `estimateNextRun()` 添加 TODO 标注（长期替换为 cron-parser）
- `extractJSON()` 反引号处理修复
- `Agent.chat()` 延迟 Promise 创建
- `http.ts` sessions Map 添加 LRU 上限
- `bootstrap.ts` dbPath 改为 `path.resolve()` 或可配置
- 生产代码 `console.log` 替换为结构化 logger
- `callClassifierLLM` 模型选择改为 provider-aware
- `regexClassify` 优先级调整
- `Dispatcher.classify()` 空 catch 添加 debug 日志
- `preprocessParams()` 改用解构排除

## Capabilities

### New Capabilities
- `api-authentication`: HTTP/WebSocket 端点认证中间件，API Key 校验

### Modified Capabilities
- `schedule-engine`: 修复 `parseIntentV2` 副作用、`fallbackParseV2` 硬编码 cron、动态 SQL 白名单
- `unified-execution-engine`: SDK 安全加固（env 最小化、permissionMode、extractJSON 测试、classifyForDispatch 测试）

## Impact

- **API 兼容性**: HTTP 端点新增认证要求，客户端需携带 API Key（BREAKING）
- **SDK 行为**: `permissionMode` 改为 `'default'`，工具调用需用户确认（BREAKING）
- **依赖**: 可能新增 `cron-parser` 依赖（MEDIUM-2 长期优化，本次仅标注）
- **文件**: 修改约 20 个源文件，新增 2 个测试文件，新增 1 个认证中间件文件

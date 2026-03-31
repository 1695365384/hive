## 1. bootstrap.ts — pino adapter + 可选参数

- [x] 1.1 新增 `createPinoAdapter(pino.Logger): ILogger` 函数，将 pino 的 info/warn/error/debug 映射到 ILogger 接口
- [x] 1.2 `BootstrapOptions` 新增可选 `pinoLogger?: Logger` 字段
- [x] 1.3 `bootstrap()` 中：有 pinoLogger 时用 adapter，无时用现有 createLogger（fallback）
- [x] 1.4 验证：`pnpm --filter @bundy-lmw/hive-server build` 通过

## 2. AdminWsHandler — 注入改造

- [x] 2.1 构造函数改为接收 `HiveLogger` 实例 + `LogBuffer` 实例，不再内部创建
- [x] 2.2 删除构造函数中的 `createHiveLogger()` 调用和 `overrideConsole()` 调用
- [x] 2.3 删除 `closeAll()` 中的 `hiveLogger?.dispose()` 调用
- [x] 2.4 更新 `createAdminWsHandler` 工厂函数签名
- [x] 2.5 验证：`pnpm --filter @bundy-lmw/hive-server build` 通过

## 3. ChatWsHandler — 注入改造

- [x] 3.1 构造函数改为接收 `HiveLogger` 实例，不再内部创建 LogBuffer 和 HiveLogger
- [x] 3.2 删除构造函数中的 `createHiveLogger()`、`new LogBuffer()` 和 `overrideConsole()` 调用
- [x] 3.3 删除 `closeAll()` 中的 `hiveLogger?.dispose()` 调用
- [x] 3.4 更新 `createChatWsHandler` 工厂函数签名
- [x] 3.5 验证：`pnpm --filter @bundy-lmw/hive-server build` 通过

## 4. main.ts — 单例初始化 + subscriber 扇出

- [x] 4.1 在 `startServer()` 顶部创建 `LogBuffer` 和 `subscriber` 数组
- [x] 4.2 创建 HiveLogger（传入 logBuffer + subscriber 扇出回调 + log 目录配置）
- [x] 4.3 调用 `hiveLogger.overrideConsole()`（全局唯一一次）
- [x] 4.4 传入 `pinoLogger: hiveLogger.logger` 到 `bootstrap()`
- [x] 4.5 用新的签名创建 AdminWsHandler（注入 hiveLogger + logBuffer），注册 subscriber
- [x] 4.6 用新的签名创建 ChatWsHandler（注入 hiveLogger），注册 subscriber
- [x] 4.7 close 函数中添加 `hiveLogger.dispose()` 调用
- [x] 4.8 验证：`pnpm --filter @bundy-lmw/hive-server build` 通过

## 5. 端到端验证

- [x] 5.1 启动 server，确认控制台输出带颜色+时间戳（hive-logger 格式）
- [x] 5.2 桌面端日志面板能看到 graceful-shutdown、config、plugins 等模块的日志
- [x] 5.3 确认日志文件 `~/.hive/logs/hive-YYYY-MM-DD.log` 包含所有模块的日志
- [x] 5.4 确认 `hive chat` CLI 子命令仍正常工作（fallback logger）

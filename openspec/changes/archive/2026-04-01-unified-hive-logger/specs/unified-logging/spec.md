## ADDED Requirements

### Requirement: HiveLogger 单例早期初始化
系统 SHALL 在 `main.ts` 的 `startServer()` 函数中，在 `bootstrap()` 调用之前创建唯一的 HiveLogger 实例。全局 `overrideConsole()` SHALL 只调用一次。

#### Scenario: 所有 console 调用走 HiveLogger
- **WHEN** `startServer()` 执行后，任何模块调用 `console.log()`、`console.warn()`、`console.error()`、`console.debug()`
- **THEN** 输出 SHALL 经过 HiveLogger 的 pino 管道
- **THEN** 输出 SHALL 同时写入 stdout（pretty-print）、LogBuffer 和日志文件

#### Scenario: overrideConsole 只调用一次
- **WHEN** `startServer()` 完成 HiveLogger 初始化
- **THEN** `overrideConsole()` SHALL 恰好被调用一次
- **THEN** AdminWsHandler 和 ChatWsHandler SHALL NOT 再次调用 `overrideConsole()`

### Requirement: broadcastLog subscriber 扇出
HiveLogger 的 broadcastLog 回调 SHALL 支持多个订阅者。系统 SHALL 提供 subscriber 注册机制，允许 AdminWsHandler 和 ChatWsHandler 各自注册日志广播函数。

#### Scenario: Admin 和 Chat 同时收到日志推送
- **WHEN** HiveLogger 写入一条日志
- **THEN** AdminWsHandler 的订阅者 SHALL 收到该日志条目
- **THEN** ChatWsHandler 的订阅者 SHALL 收到该日志条目

#### Scenario: 动态注册订阅者
- **WHEN** AdminWsHandler 或 ChatWsHandler 实例创建后
- **THEN** SHALL 通过 subscriber 数组注册 broadcast 函数
- **THEN** 之后产生的日志 SHALL 推送给新注册的订阅者

### Requirement: 共享 LogBuffer
系统 SHALL 在 `startServer()` 中创建唯一的 LogBuffer 实例，注入到 HiveLogger 和 AdminWsHandler。

#### Scenario: AdminWsHandler 使用共享 LogBuffer
- **WHEN** 管理面板请求 `log.tail` API
- **THEN** SHALL 返回与 HiveLogger 写入相同的 LogBuffer 数据

### Requirement: bootstrap 接收可选 pino Logger
`bootstrap()` 函数 SHALL 接受可选的 `pinoLogger` 参数。当提供时，SHALL 用 pino adapter 创建 ILogger；不提供时 SHALL 使用 fallback logger（兼容 CLI 路径）。

#### Scenario: startServer 路径使用 pino adapter
- **WHEN** 通过 `startServer()` 启动并传入 pinoLogger
- **THEN** bootstrap 创建的 ILogger SHALL 将日志写入 HiveLogger 管道

#### Scenario: CLI hive chat 路径使用 fallback
- **WHEN** 通过 `cli/index.ts` 的 chat 子命令启动，不传 pinoLogger
- **THEN** bootstrap SHALL 使用 fallback logger（直接 console 输出）

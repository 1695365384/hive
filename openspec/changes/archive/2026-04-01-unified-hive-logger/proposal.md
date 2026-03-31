## Why

Server 包存在 ~77 处裸 `console.log/warn/error` 调用散落在 13 个文件中，仅 3 个文件（admin-handler、chat-handler、http）真正接入了 HiveLogger。HiveLogger 已具备完整的日志能力（pino + console pretty-print + LogBuffer + 文件轮转），但因初始化顺序和双重 overrideConsole 竞态问题，大部分日志绕过了统一管道，导致桌面端日志面板和文件持久化都看不到这些输出。

## What Changes

- **HiveLogger 单例化**：在 `main.ts` 最早阶段创建唯一 HiveLogger 实例，全局调用一次 `overrideConsole()`
- **broadcastLog 扇出**：用 subscriber 数组替代单一回调，支持 AdminWsHandler 和 ChatWsHandler 同时订阅
- **bootstrap.ts 适配**：删除 `createLogger()`（基于 console.log 的简单封装），改用 pino adapter 包装 HiveLogger 的 pino 实例
- **Handler 注入改造**：AdminWsHandler / ChatWsHandler 不再自行创建 HiveLogger，改为接收注入
- **全部 console 裸调用自动俘获**：overrideConsole 在 bootstrap 之前调用，50+ 处散落的 console 调用自动走 HiveLogger 管道

## Capabilities

### New Capabilities

- `unified-logging`: HiveLogger 单例早期初始化 + 全局 console 劫持 + broadcast 扇出机制

### Modified Capabilities

- `file-logger`: HiveLogger 从 Handler 自创建改为 main.ts 单例创建，构造参数不变
- `ws-domain-handler`: AdminWsHandler / ChatWsHandler 改为外部注入 HiveLogger，移除内部创建逻辑

## Non-goals

- CLI 子命令（`hive plugin`、`hive skill`、`hive chat`）的 console 输出不在范围内——这些是面向终端用户的交互输出，不是服务端日志
- 不改变 HiveLogger 的文件持久化、LogBuffer、pino 配置等内部实现
- 不改变 `@bundy-lmw/hive-core` 的 `ILogger` 接口定义

## Impact

- **apps/server/src/main.ts**：新增 HiveLogger 创建 + overrideConsole + subscriber 管理
- **apps/server/src/bootstrap.ts**：删除 createLogger，改为接收 pino logger 参数并创建 ILogger adapter
- **apps/server/src/gateway/ws/admin-handler.ts**：构造函数改为注入 HiveLogger，删除内部创建和 overrideConsole
- **apps/server/src/gateway/ws/chat-handler.ts**：同上
- **apps/server/src/gateway/http.ts**：无代码改动，但 hiveLoggerMiddleware 的 logger 来源从 handler 变为直接注入的 HiveLogger
- 以下文件零改动，console 调用自动被俘获：graceful-shutdown.ts、config.ts、plugins.ts、plugin-handler.ts、plugin-manager/*

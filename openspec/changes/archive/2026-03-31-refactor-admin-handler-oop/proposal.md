## Why

`admin-handler.ts` 是一个 953 行的 God Class，管理 22 个 WS 消息处理器，横跨 6 个无关业务域（Config、Status、Plugin、Log、Session、Chat）。所有 handler 共享同一组依赖和状态，导致代码难以维护、测试困难（1052 行 mock），新增功能必须修改核心类。Chat handler 本质上是面向终端用户的对话功能，不应与管理接口混在一起。

## What Changes

- 将 `admin-handler.ts` 按域拆分为 5 个独立 Domain Handler 类（Config、Status、Plugin、Log、Session），通过抽象基类 `WsDomainHandler` 统一接口
- 引入 `HandlerContext` 对象注入共享依赖（broadcastEvent、loadConfig、saveConfig、getServer），替代原有散落在类属性上的隐式依赖
- 将 Chat handler 从 admin 中完全独立为新的 `/ws/chat` WebSocket 端点，包含 threadId 定向推送和 fire-and-forget 执行模式
- `reloadPlugin` 方法归属 PluginHandler 内部，通过 Context 获取所需依赖
- AdminWsHandler 瘦身为薄 Router（~200 行），仅负责 WS 连接管理、消息路由、生命周期

## Capabilities

### New Capabilities
- `ws-domain-handler`: Domain Handler 抽象基类和 HandlerContext 依赖注入机制
- `ws-chat-endpoint`: 独立的 `/ws/chat` WebSocket 端点，管理 Agent 对话的完整生命周期

### Modified Capabilities
- `server-factory`: 新增 `/ws/chat` 路由注册，修改 WS 端点初始化流程

## Impact

- `apps/server/src/gateway/ws/admin-handler.ts` — 主要重构目标，拆分为多个文件
- `apps/server/src/gateway/` — 路由注册变更，新增 `/ws/chat` 端点
- `apps/server/tests/unit/admin-handler.test.ts` — 测试适配新结构，新增各 Handler 独立测试
- 前端 Chat WebSocket 连接地址从 `/ws/admin` 改为 `/ws/chat`

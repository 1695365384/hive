## Why

当前 Hive 项目只有 `@bundy-lmw/hive-core` 一个核心包，提供了 Agent 的基础能力。但在实际生产场景中，需要：

1. **多 Agent 协作编排** - 多个 Agent 需要协调执行，共享状态
2. **外部平台接入** - 飞书、QQ、Telegram 等平台需要与 Agent 交互
3. **可扩展架构** - 新平台通过插件形式接入，而非硬编码

这些能力不应该放在 `core` 中。编排和外部接入是"上层建筑"。

## What Changes

### 新增 `packages/orchestrator` 模块

- **内存消息总线 (MessageBus)** - 进程内事件驱动通信，零外部依赖
- **Agent 调度器 (Scheduler)** - 管理 Agent 实例池，分发消息到目标 Agent
- **插件系统 (PluginHost)** - 动态加载和管理插件，平台适配器以插件形式提供
- **网关 (Gateway)** - 统一入口，插件通过网关注册消息处理器

### 官方插件（独立包）

- `@bundy-lmw/hive-plugin-feishu` - 飞书机器人插件（WebSocket 连接飞书服务器）

### 不包含

- HTTP/REST 通道（现阶段不需要）
- WebSocket 服务端（飞书是连飞书服务器，不是自建 WS）
- CLI 通道（现阶段不需要）
- MCP 协议（不需要外部 MCP 调用）
- Redis/消息中间件依赖（纯内存实现）

## Capabilities

### New Capabilities

- `message-bus`: 进程内消息总线，支持发布/订阅、请求/响应、广播模式
- `agent-scheduler`: Agent 实例池管理和消息路由
- `plugin-system`: 插件生命周期管理（加载、启用、禁用、卸载）
- `feishu-plugin`: 飞书机器人适配器插件

### Modified Capabilities

无（这是全新模块）

## Impact

### 新增文件结构

```
packages/
├── core/                    # 现有，不变
├── orchestrator/            # 新增：编排模块
│   ├── src/
│   │   ├── bus/             # 消息总线
│   │   ├── scheduler/       # 调度器
│   │   ├── plugins/         # 插件系统
│   │   └── gateway/         # 网关
│   └── package.json
│
└── plugins/                 # 新增：官方插件目录
    └── feishu/              # 飞书插件
        ├── src/
        │   ├── client.ts    # 飞书 WebSocket 客户端
        │   ├── adapter.ts   # 消息适配器
        │   └── index.ts     # 插件入口
        └── package.json
```

### 依赖关系

```
@bundy-lmw/hive-plugin-feishu → @bundy-lmw/hive-orchestrator → @bundy-lmw/hive-core
```

### 外部依赖

orchestrator: 无外部依赖
plugin-feishu: 飞书 SDK（官方或自实现）

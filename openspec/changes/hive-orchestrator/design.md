## Context

Hive 项目当前架构：

```
packages/core/
├── agents/         # Agent 核心实现（能力委托模式）
├── providers/      # LLM 提供商管理
├── skills/         # 技能系统
├── hooks/          # 生命周期钩子
├── storage/        # SQLite 存储
└── session/        # 会话管理
```

**现状**：
- `@hive/core` 是单 Agent SDK
- 无内置的多 Agent 编排能力
- 无外部通信通道
- 无插件扩展机制

**约束**：
- 必须与 `@hive/core` 解耦，单向依赖
- 不引入外部消息中间件（Redis、RabbitMQ 等）
- 初期聚焦单机场景，不考虑分布式
- 外部平台通过插件形式接入

## Goals / Non-Goals

**Goals:**
1. 提供进程内消息总线，支持多 Agent 通信
2. 实现 Agent 调度器，管理 Agent 实例池
3. 提供插件系统，支持运行时扩展
4. 飞书机器人作为插件接入（WebSocket 连接飞书服务器）
5. 零外部消息队列依赖

**Non-Goals:**
- 不支持 MCP 协议（不需要外部 MCP 调用）
- 不支持分布式部署（初期单机）
- 不提供持久化消息（内存消息，进程重启丢失）
- 不实现 Agent 间的分布式协调
- 不实现 HTTP/REST 通道（现阶段不需要）
- 不实现 WebSocket 服务端（飞书是连飞书服务器，不是自建 WS）
- 不实现 CLI 通道（现阶段不需要）

## Decisions

### D1: 消息总线实现方案

**选择**: 基于 EventEmitter 的内存消息总线

**备选方案**:
| 方案 | 优点 | 缺点 |
|------|------|------|
| EventEmitter（原生） | 零依赖 | 功能简单 |
| EventEmitter3 | 高性能、命名空间 | 额外依赖 |
| 自实现 | 完全控制 | 开发成本 |

**决定**: 自实现轻量级 MessageBus，基于 EventEmitter，增加：
- 请求/响应模式（`request/response`）
- 中间件支持（日志、序列化）
- 主题通配符（`agent:*`）

### D2: 插件系统设计

**选择**: 简单的插件宿主 + 生命周期钩子 + 平台适配器接口

```typescript
interface Plugin {
  name: string;
  version: string;
  init(host: PluginHost): Promise<void>;
  destroy(): Promise<void>;
  // 可选钩子
  onMessage?: (msg: AgentMessage, next: () => void) => void;
  onAgentStart?: (agentId: string) => void;
  onAgentEnd?: (agentId: string) => void;
}

interface PlatformAdapter extends Plugin {
  // 平台特定接口
  sendMessage(to: string, content: string): Promise<void>;
}
```

**决定**:
- 不使用 VM 沙箱（复杂度高，初期不需要）
- 插件与主进程同上下文运行
- 通过 npm 包分发插件
- 平台适配器（飞书、QQ、Telegram）以插件形式提供

### D3: 调度器设计

**选择**: 简单的 Agent 池 + 消息路由

```typescript
interface Scheduler {
  register(agent: Agent): void;
  unregister(agentId: string): void;
  dispatch(message: AgentMessage): Promise<void>;
  broadcast(message: AgentMessage): Promise<void>;
}
```

**决定**:
- Agent 实例由调度器持有
- 消息按 `message.agent` 字段路由到目标 Agent
- 支持广播（所有 Agent 接收）

### D4: 飞书插件设计

**选择**: WebSocket 客户端连接飞书服务器

```typescript
interface FeishuPlugin extends PlatformAdapter {
  // 连接飞书 WebSocket
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  // 消息转换
  transformIncoming(feishuMsg: FeishuMessage): AgentMessage;
  transformOutgoing(agentMsg: AgentMessage): FeishuMessage;
}
```

**决定**:
- 飞书插件作为独立包 `@hive/plugin-feishu`
- 通过 WebSocket 连接飞书服务器（非自建服务端）
- 消息格式转换在插件内完成
- 其他平台（QQ、Telegram）可复用相同模式

### D5: 包结构

```
packages/
├── core/                    # 现有，不变
├── orchestrator/            # 新增：编排模块
│   ├── src/
│   │   ├── index.ts         # 公开 API
│   │   ├── bus/             # 消息总线
│   │   ├── scheduler/       # 调度器
│   │   └── plugins/         # 插件系统
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

## Risks / Trade-offs

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 内存消息丢失 | 进程崩溃时消息丢失 | 重要场景可加钩子持久化 |
| 单机瓶颈 | 无法水平扩展 | 初期可接受，后续可抽象 Broker 接口 |
| 插件安全 | 恶意插件影响主进程 | 信任模型，仅加载可信插件 |
| 飞书协议变更 | 需要适配更新 | 抽象适配层，隔离协议细节 |

## Migration Plan

这是新模块，无需迁移。部署步骤：

1. 创建 `packages/orchestrator` 目录
2. 初始化 `package.json`，依赖 `@hive/core`
3. 实现核心组件（按 tasks.md 顺序）
4. 创建 `packages/plugins/feishu` 飞书插件
5. 添加单元测试
6. 发布 npm 包

## Open Questions

1. **飞书 SDK 选择** - 官方 SDK vs 自实现？
   - 倾向先自实现 WebSocket 客户端（协议简单）

2. **插件加载方式** - 动态 import vs require？
   - 倾向动态 import（ESM 兼容）

3. **消息格式标准化** - 是否复用 core 的 Message 类型？
   - 倾向复用 + 扩展（添加 channel、correlationId 等元数据）

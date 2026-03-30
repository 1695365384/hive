## Context

移除 OpenClaw 后，Hive 需要一个干净的飞书通道实现。飞书官方 SDK `@larksuiteoapi/node-sdk` 提供了完整的 API 封装，但需要适配到 Hive 的插件系统中。

**当前状态**:
- `packages/plugins/` 目录为空
- 无插件接口定义
- `apps/server` 的 bootstrap 已移除插件加载逻辑

**约束**:
- 必须基于飞书官方 SDK，避免引入 OpenClaw
- 插件必须与 Hive Core 解耦（仅依赖接口）
- 支持多租户（多飞书应用）

## Goals / Non-Goals

**Goals:**
- 定义清晰的 `Plugin` 和 `Channel` 接口
- 实现基于飞书 SDK 的通道插件
- 支持接收和发送飞书消息
- 支持多租户配置
- 与 Hive MessageBus 集成

**Non-Goals:**
- 不支持飞书小程序（仅机器人消息）
- 不实现飞书文档、日历等其他能力
- 不实现飞书审批等复杂工作流

## Decisions

### D1: 插件接口设计

**决策**: 定义 `IPlugin` 和 `IChannel` 接口在 `@bundy-lmw/hive-core` 中

**理由**:
- Core 定义接口，插件实现接口
- 避免循环依赖
- 其他插件可复用相同接口

**替代方案**:
- ❌ 创建独立的 `@hive/plugin-types` 包 - 增加复杂度
- ❌ 在插件包中定义 - 导致依赖倒置

### D2: 飞书事件接收方式

**决策**: 使用 HTTP Webhook 接收飞书事件

**理由**:
- 飞书推荐方式
- 与现有 HTTP Server 集成简单
- 支持本地开发（配合内网穿透）

**替代方案**:
- ❌ 长连接 - 飞书不支持
- ❌ 轮询 - 不实时且浪费资源

### D3: 消息格式转换

**决策**: 飞书消息格式在通道内转换为通用格式

```
飞书消息 → FeishuChannel → 统一消息格式 → MessageBus
```

**理由**:
- 业务代码不需要了解飞书消息结构
- 未来支持其他通道时只需新增 Channel 实现

### D4: 多租户实现

**决策**: 每个飞书应用配置创建独立的 `FeishuChannel` 实例

```typescript
const channels = config.apps.map(app => new FeishuChannel(app))
```

**理由**:
- 隔离性好
- 每个应用独立的 token 管理

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|----------|
| 飞书 API 变更 | 使用官方 SDK，跟随版本升级 |
| Token 泄露 | 配置文件不入库，使用环境变量 |
| 事件丢失 | 实现事件确认机制，记录处理日志 |
| 并发消息处理 | MessageBus 支持异步，SDK 线程安全 |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Hive Server                        │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐    ┌────────────┐  │
│  │ Bootstrap   │───▶│ PluginLoader│───▶│ MessageBus │  │
│  └─────────────┘    └──────┬──────┘    └────────────┘  │
│                            │                           │
│                            ▼                           │
│  ┌─────────────────────────────────────────────────┐   │
│  │              @bundy-lmw/hive-plugin-feishu                │   │
│  │  ┌──────────────┐    ┌──────────────────────┐   │   │
│  │  │ FeishuPlugin │───▶│ FeishuChannel (x N)  │   │   │
│  │  └──────────────┘    └──────────┬───────────┘   │   │
│  │                                 │               │   │
│  │  ┌──────────────────────────────▼─────────────┐ │   │
│  │  │         @larksuiteoapi/node-sdk            │ │   │
│  │  └────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## File Structure

```
packages/plugins/feishu/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts           # 导出 FeishuPlugin
│   ├── plugin.ts          # 插件主类
│   ├── channel.ts         # FeishuChannel 实现
│   ├── webhook.ts         # Webhook 处理器
│   ├── message.ts         # 消息格式转换
│   └── types.ts           # 类型定义
└── README.md
```

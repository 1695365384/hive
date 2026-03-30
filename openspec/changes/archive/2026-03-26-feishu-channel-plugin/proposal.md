## Why

之前的飞书插件基于 OpenClaw 实现，存在严重的循环依赖问题，已完全移除。现在需要基于飞书官方 SDK (`@larksuiteoapi/node-sdk`) 重新封装一个干净、独立的通道插件，使 Hive 能够接收和发送飞书消息。

## What Changes

- 创建全新的 `@bundy-lmw/hive-plugin-feishu` 包，基于飞书官方 SDK 实现
- 实现飞书事件订阅接收（通过 Webhook 或长连接）
- 实现飞书消息发送 API 封装
- 定义清晰的插件接口，与 Hive Core 解耦
- 支持多租户（多个飞书应用）

## Capabilities

### New Capabilities

- `feishu-channel`: 飞书通道插件 - 接收和发送飞书消息的核心能力
- `plugin-interface`: 插件接口规范 - 定义 Hive 插件的标准接口（事件、通道、工具）

### Modified Capabilities

无（这是全新的功能）

## Impact

**新增代码**:
- `packages/plugins/feishu/` - 飞书插件包

**依赖**:
- `@larksuiteoapi/node-sdk` - 飞书官方 Node.js SDK
- `@bundy-lmw/hive-core` - Hive 核心（仅类型依赖）
- `@bundy-lmw/hive-orchestrator` - 消息总线（事件通信）

**影响范围**:
- `apps/server` - 需要更新插件加载机制以支持新插件接口
- `pnpm-workspace.yaml` - 需要包含新插件包

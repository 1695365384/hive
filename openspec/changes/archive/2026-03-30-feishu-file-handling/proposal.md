## Why

飞书插件当前只支持文本/卡片/Markdown 消息的收发，虽然 `capabilities` 中声明了 `sendFile: true` 和 `sendImage: true`，但实际并未实现。用户在飞书中发送文件或图片给机器人时，插件只提取了原始 JSON 字符串，无法获取实际文件内容。同样，Agent 也无法通过飞书通道发送文件或图片给用户。

## What Changes

- **BREAKING** `IPlugin.initialize()` 签名扩展：增加第四个参数 `context: PluginContext`，包含 `workspaceDir`（只读）
- `ServerImpl.start()` 调用 `plugin.initialize()` 时传递 `_workspaceManager.rootPath`
- `FeishuChannel` 实现文件发送：通过 `client.im.file.create()` 上传 + `client.im.v1.message.create()` 发送
- `FeishuChannel` 实现图片发送：通过 `client.im.image.create()` 上传 + `client.im.v1.message.create()` 发送
- `FeishuChannel` 实现文件/图片接收：收到 `file`/`image`/`audio`/`media` 类型消息时自动下载到 `{workspaceDir}/files/feishu/received/`
- `FeishuPlugin` 存储 `workspaceDir` 并传递给 `FeishuChannel`

## Capabilities

### New Capabilities
- `file-handling`: 飞书通道的文件/图片收发能力（上传、下载、消息构建）

### Modified Capabilities
- `plugin-interface`: `IPlugin.initialize()` 签名扩展，增加 `context` 参数传递 workspace 目录
- `feishu-channel`: 消息接收增加文件类型处理，消息发送增加文件/图片类型实现

## Impact

- `@hive/core` — `IPlugin` 接口签名变更（`initialize` 增加参数），所有插件需适配
- `@hive/plugin-feishu` — 新增文件上传/下载逻辑，修改消息收发流程
- `apps/server` — `ServerImpl` 传递 workspace 目录给插件
- 无新增外部依赖（`@larksuiteoapi/node-sdk` 已包含文件 API）

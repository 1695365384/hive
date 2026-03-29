## Context

飞书插件基于 `@larksuiteoapi/node-sdk`，已实现文本/卡片/Markdown 消息的 WebSocket 长连接收发。`capabilities` 声明了 `sendFile: true` 和 `sendImage: true`，但 `send()` 方法的 `buildContent()` 对 file/image 类型走了 default 分支（错误地构建为 interactive card）。

Server 已有 `WorkspaceManager`（`_workspaceManager.rootPath`），但插件初始化时无法访问该路径。

飞书 SDK 提供的文件 API：
- 上传文件：`client.im.file.create({ data: { file_type, file_name, file } })` → 返回 `file_key`
- 下载文件：`client.im.file.get({ path: { file_key } })` → `resp.writeFile(path)`
- 上传图片：`client.im.image.create({ data: { image_type, image } })` → 返回 `image_key`
- 下载图片：`client.im.image.get({ path: { image_key } })` → `resp.writeFile(path)`

## Goals / Non-Goals

**Goals:**
- 插件能通过飞书 API 发送文件和图片
- 插件收到文件/图片消息时自动下载到 workspace 目录
- 插件能只读访问 workspace 目录（不修改 workspace 本身结构）

**Non-Goals:**
- 不改 `ChannelSendOptions` / `IChannel` 接口（用 metadata 传文件路径）
- 不实现文件预览、在线编辑等高级功能
- 不做文件大小限制或磁盘配额管理
- 不改其他插件（非飞书插件不受影响）

## Decisions

### D1: IPlugin.initialize() 增加 context 参数

**选择**: `initialize(msgBus, logger, registerChannel, context)` 其中 `context = { workspaceDir: string }`

**备选方案**:
- ~~在 IPlugin 加 `setWorkspaceDir()` setter~~ — 违反最小改动原则，多一个方法多一个状态管理点
- ~~把 workspaceDir 放到 plugin config~~ — 语义不对，config 是用户配置不是运行时注入

**理由**: 最小改动，context 对象未来可扩展（加其他运行时信息），且 workspaceDir 是只读的。

### D2: 文件发送通过 metadata 传递路径

**选择**: `ChannelSendOptions.metadata.filePath` 传递本地文件路径，不改动 core 的 `IChannel` 接口。

```
channel.send({
  type: 'file',
  to: chatId,
  content: '',           // 文件发送时忽略
  metadata: { filePath: '/path/to/report.pdf' }
})
```

**理由**: 不需要改 core 接口签名，插件内部自行解析 metadata。其他插件不受影响。

### D3: 文件接收自动下载

**选择**: 收到 `file`/`image`/`audio`/`media` 类型消息时自动下载，`message.content` 写入本地文件路径。

**存储路径**: `{workspaceDir}/files/feishu/received/{date}_{fileKey}.{ext}`

**理由**: Agent 处理消息时可以直接拿到文件路径，无需二次请求。

### D4: 图片与文件分开处理

**选择**: 图片走 `client.im.image` API，其他文件走 `client.im.file` API。

飞书的消息类型和 API 是分离的：
- `msg_type: 'image'` → content 是 `{ image_key }` → 上传/下载用 `client.im.image`
- `msg_type: 'file'` → content 是 `{ file_key, file_name }` → 上传/下载用 `client.im.file`
- `msg_type: 'audio'`/`'media'` → 同 file API

## Risks / Trade-offs

- **[BREAKING] initialize() 签名变更** → 所有插件需适配。Mitigation: context 参数设为可选，现有插件不传也能工作
- **大文件下载阻塞消息处理** → Mitigation: 下载是异步的，不阻塞事件循环；后续可加文件大小限制
- **磁盘空间** → Mitigation: 目前不处理，workspace 本身已有清理机制（非本次范围）

## Why

Agent 目前只能返回纯文本给用户。当 Agent 通过工具生成了文件（如报告、图片），无法将其发送给用户。飞书插件已支持文件收发，但 ServerImpl 的消息管道只传递 `content: string`，没有文件通道。

## What Changes

- `ChannelSendOptions` 新增 `filePath?: string` 一等字段（替代 `metadata.filePath` 的野路子）
- 新增 `send_file` 内置工具，Agent 可调用将本地文件发送给当前会话的用户
- 工具通过回调机制（同 `ask-user` 模式）获取当前 channelId + chatId，直接调用 `channel.send()`
- `ServerImpl` 的 `message:response` 处理器支持传递 `filePath` 到 `channel.send()`
- FeishuChannel 的 `send()` 从 `metadata.filePath` 迁移到 `options.filePath`

## Capabilities

### New Capabilities
- `send-file-tool`: Agent 内置工具 `send_file`，支持将本地文件/图片发送给当前会话用户

### Modified Capabilities
- `common-types`: `ChannelSendOptions` 新增 `filePath` 字段
- `feishu-channel`: `send()` 方法读取 `options.filePath` 替代 `metadata.filePath`

## Impact

- `@bundy-lmw/hive-core` — `ChannelSendOptions` 接口变更、新增内置工具、ToolRegistry 注册
- `@bundy-lmw/hive-plugin-feishu` — `send()` 方法适配 `filePath` 字段
- `apps/server` — `ServerImpl` 注入 `send_file` 工具回调、`message:response` 处理器传递 `filePath`
- 无新增外部依赖

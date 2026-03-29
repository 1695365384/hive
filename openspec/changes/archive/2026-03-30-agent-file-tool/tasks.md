## 1. Core 接口变更

- [x] 1.1 在 `packages/core/src/plugins/types.ts` 的 `ChannelSendOptions` 中新增 `filePath?: string` 字段

## 2. send_file 内置工具

- [x] 2.1 创建 `packages/core/src/tools/built-in/send-file-tool.ts`：实现 `createSendFileTool()`，定义 Zod schema（filePath, description?），通过全局回调执行发送
- [x] 2.2 在 `packages/core/src/tools/built-in/index.ts` 中导出 `createSendFileTool`、`sendFileTool`、`setSendFileCallback`、`SendFileCallback` 类型
- [x] 2.3 在 `packages/core/src/tools/tool-registry.ts` 中：`setSendFileCallback` 方法、`general` 白名单添加 `send_file`
- [x] 2.4 在 `packages/core/src/tools/index.ts` 中导出新工具

## 3. Server 注入回调

- [x] 3.1 在 `ServerImpl.subscribeMessageHandler()` 中，每次 dispatch 前注入当前 channelId + chatId 的发送回调到 ToolRegistry
- [x] 3.2 `message:response` 处理器支持传递 `filePath` 到 `channel.send()`

## 4. 飞书插件适配

- [x] 4.1 `FeishuChannel.send()` / `reply()` 优先读取 `options.filePath`，降级读取 `metadata.filePath`

## 5. 测试

- [x] 5.1 为 `send_file` 工具编写单元测试（回调注入、文件不存在、无回调、类型自动识别）
- [x] 5.2 为 `ChannelSendOptions.filePath` 编写测试（FeishuChannel send/reply 的 file/image 分支）

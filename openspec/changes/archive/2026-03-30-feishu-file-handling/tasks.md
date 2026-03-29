## 1. Core 接口变更

- [x] 1.1 在 `packages/core/src/plugins/types.ts` 中新增 `PluginContext` 接口（`workspaceDir: string`）
- [x] 1.2 修改 `IPlugin.initialize()` 签名，增加第四个可选参数 `context?: PluginContext`

## 2. Server 传递 workspace 目录

- [x] 2.1 修改 `packages/core/src/server/ServerImpl.ts`，在 `plugin.initialize()` 调用时传递 `{ workspaceDir: this._workspaceManager.rootPath }`
- [x] 2.2 处理 `_workspaceManager` 未定义时的降级（context 不传或 workspaceDir 为空字符串）

## 3. 飞书插件 — 文件发送

- [x] 3.1 修改 `FeishuPlugin`：在 `initialize()` 中接收 context 并传递 `workspaceDir` 给 `FeishuChannel`
- [x] 3.2 修改 `FeishuChannel` 构造函数，接收 `workspaceDir` 并存储
- [x] 3.3 新增 `uploadFile(filePath)` 方法：通过 `client.im.file.create()` 上传，返回 `file_key`
- [x] 3.4 新增 `uploadImage(filePath)` 方法：通过 `client.im.image.create()` 上传，返回 `image_key`
- [x] 3.5 修改 `send()` 方法：当 `type` 为 `'file'` 或 `'image'` 时，先上传再发送消息
- [x] 3.6 修改 `reply()` 方法：支持回复文件/图片消息

## 4. 飞书插件 — 文件接收

- [x] 4.1 新增 `downloadFile(fileKey, fileName)` 方法：通过 `client.im.file.get()` 下载并保存到 `{workspaceDir}/files/feishu/received/`
- [x] 4.2 新增 `downloadImage(imageKey)` 方法：通过 `client.im.image.get()` 下载并保存
- [x] 4.3 修改 `convertWSMessage()` 和 `convertWebhookMessage()`：对 `file`/`image`/`audio`/`media` 类型触发自动下载，`content` 写入本地路径

## 5. 测试

- [x] 5.1 为文件上传（`uploadFile`/`uploadImage`）编写单元测试（mock SDK）
- [x] 5.2 为文件下载（`downloadFile`/`downloadImage`）编写单元测试（mock SDK）
- [x] 5.3 为 `send()` 的 file/image 分支编写单元测试
- [x] 5.4 为消息接收的文件下载分支编写单元测试

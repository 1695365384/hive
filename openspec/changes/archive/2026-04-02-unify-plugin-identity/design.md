## Context

当前插件系统存在三套身份标识：

| 标识来源 | 示例值 | 使用位置 |
|---------|--------|---------|
| `plugin.metadata.id` | `"feishu"` | IPlugin 接口、ServerImpl 日志 |
| registry key | `"feishu"` | plugin.list、plugin.uninstall、handleUpdateConfig |
| manifest.name / config key | `"@bundy-lmw/hive-plugin-feishu"` | pluginInstances Map、loadFromDirectory config 匹配、hive.config.json |

这导致：PluginHandler 的 `pluginInstances` Map 用 manifest.name 存储、用 registry key 查找（找不到）；reload 时 config key 不匹配（拿到空配置）；pluginInstances 是 ServerImpl.plugins 的冗余拷贝。

## Goals / Non-Goals

**Goals:**
- 全链路统一使用 `metadata.id`（`hive.id`）作为插件唯一标识
- 消除 `pluginInstances` 冗余状态，Server 作为 plugins 的唯一持有者
- reloadPlugin 能正确找到旧实例、读取最新配置、替换新实例
- `hive.config.json` 的 plugins key 统一为 `hive.id`

**Non-Goals:**
- 不重构插件加载流程整体架构
- 不修改 IPlugin / PluginMetadata 接口
- 不修改 registry key（当前值与 hive.id 相同）
- 不做前端适配（前端传的 pluginId 已是 registry key）

## Decisions

### D1: 引入 `hive.id` 作为 manifest 的身份字段

package.json 新增 `hive.id`，与 `PluginMetadata.id` 对齐。manifest 解析时继承此字段。

```json
{
  "name": "@bundy-lmw/hive-plugin-feishu",
  "hive": {
    "plugin": true,
    "entry": "dist/index.js",
    "id": "feishu"
  }
}
```

**替代方案：**
- 从 package.json name 提取（去掉 `@bundy-lmw/hive-plugin-` 前缀）→ 依赖命名约定，不显式
- 先实例化 Plugin 类再读 metadata.id → 加载时序复杂，需要先 new 再判断

**选择理由：** 显式声明，不依赖命名约定，加载前就能确定身份。

### D2: Server 接口新增 getPlugin / replacePlugin

```typescript
interface Server {
  // 现有
  readonly agent: Agent
  readonly bus: MessageBus
  readonly logger: ILogger
  start(): Promise<void>
  stop(): Promise<void>
  getChannel(id: string): IChannel | undefined
  registerChannel(channel: IChannel): void
  // 新增
  getPlugin(id: string): IPlugin | undefined
  replacePlugin(id: string, plugin: IPlugin): void
}
```

**替代方案：**
- 暴露 `getPlugins()` 返回可变数组 → encapsulation leak
- 仅在 PluginHandler 维护 Map → 就是当前的 bug

**选择理由：** Server 是 plugins 的唯一持有者，通过方法暴露查找和替换能力，保持封装。

### D3: 删除 pluginInstances，reloadPlugin 直接走 Server

PluginHandler 不再维护独立的 `pluginInstances: Map<string, IPlugin>`，所有插件查找和替换通过 `Server.getPlugin()` / `Server.replacePlugin()` 完成。同时删除 `setPlugins()` 方法、`scanPluginDir` import。

### D4: hive.config.json 统一用 hive.id 作为 plugins key

```json
{
  "plugins": {
    "feishu": { "apps": [...] }
  }
}
```

loadFromDirectory、handleUpdateConfig、reloadPlugin、appendToConfig 全部用 `manifest.id`（即 `hive.id`）作为 config key。

### D5: reloadPlugin 不再扫描 manifest 文件系统

当前 reloadPlugin 调用 `scanPluginDir()` 找 manifest entry 来重新 import。改为：直接从旧插件的 manifest 信息或 registry 反查 entry 路径，避免文件系统扫描。

## Risks / Trade-offs

- **[配置迁移]** 现有 hive.config.json 的 plugins key 需要手动更新 → 提供清晰的迁移说明，config-store 的 sensitize 方法可以辅助
- **[hive.id 缺失]** 老插件没有 `hive.id` 字段 → 回退到从 package.json name 提取（去掉 `@bundy-lmw/hive-plugin-` 前缀）
- **[reload 失败]** 新实例创建失败时旧实例已被 destroy → 先创建新实例并验证，成功后再销毁旧实例（swap 模式）

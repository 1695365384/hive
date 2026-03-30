## Context

当前 `apps/server/src/plugins.ts` 静态 import 所有插件类并实例化。Core 层 `ServerImpl` 只接收 `IPlugin[]`，不关心插件来源。

关键约束：动态 `import()` 必须在 app 层（`apps/server/`）执行，不能放在 `packages/core/`，否则 ESM monorepo 路径解析会失败。

## Goals / Non-Goals

**Goals:**
- 用户 `npm install` 插件包后，只需在 `hive.config.json` 添加配置即可启用
- Core 层不涉及动态加载逻辑，保持接口纯净
- 加载失败时提供清晰错误信息，不影响其他插件

**Non-Goals:**
- 运行时热加载 / 热卸载（需要重启 server）
- 自动发现 node_modules 中的插件（显式配置优于隐式约定）
- 插件依赖管理 / 加载顺序控制

## Decisions

### 1. 动态加载放在 app 层

`apps/server/src/plugins.ts` 改为 async 函数，读取 `pluginConfigs` 后循环 `await import(name)` 实例化。

**替代方案：Core 层 PluginLoader** — 之前因路径解析问题被否决，core 不应依赖具体插件包路径。

### 2. 插件包约定：default export

插件包 MUST 导出 default class（`IPlugin` 实现）。加载逻辑按 `mod.default` 取入口。

**替代方案：约定命名导出（如 `mod[CamelCaseName]`）** — default export 更简洁，是 Node.js 生态的标准约定。保留命名导出作为 fallback 可增加复杂度但收益低，暂不实现。

### 3. 错误处理策略

单个插件加载失败时 log error 并跳过，不阻塞 server 启动。这与现有 `ServerImpl` 中插件初始化的错误处理策略一致。

## Risks / Trade-offs

- **[类型安全]** 动态 import 丢失编译时类型检查 → 插件包通过 `implements IPlugin` 约束，运行时在 `new Plugin(config)` 后由 Server 的 `initialize()` 做实际验证
- **[配置错误]** 用户填错插件包名 → 加载失败时打印清晰错误信息，包含包名和原因

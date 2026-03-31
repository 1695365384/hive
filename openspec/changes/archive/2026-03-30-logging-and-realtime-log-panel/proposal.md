## Why

Server 日志仅存在于内存 LogBuffer（10K 条），重启即丢。桌面端虽然有 LogViewer 页面，但需要切换到 logs 页才能看到日志，无法在操作其他页面时实时感知 server 运行状态。排查问题时缺少历史日志，开发体验差。

## What Changes

- **日志文件持久化**：在 `interceptConsole()` 中扩展文件写入能力，日志输出到工作空间 `logs/` 目录，按天切割，自动清理过期文件
- **底部抽屉日志面板**：桌面端新增 VS Code 风格底部可折叠日志面板，任意页面均可实时查看日志，不遮挡主内容
- **全局日志状态管理**：引入状态管理工具将日志提升到全局状态，确保 WS 推送的日志在任何页面都能被捕获，不遗漏任何日志条目
- **状态栏日志指示器**：底部状态栏显示未读日志数和错误数，点击可展开日志面板

## Capabilities

### New Capabilities
- `file-logger`: 日志文件持久化，按天切割与自动清理

### Modified Capabilities
- `server-factory`: interceptConsole 扩展文件写入能力

## Impact

- **Server 端**：`admin-handler.ts` 的 `interceptConsole()` 需扩展，新增 `file-logger` 模块
- **Desktop 前端**：Dashboard 布局重构为三段式（顶栏/内容区/底部抽屉），引入全局状态管理（zustand），LogViewer 组件重构为底部面板
- **依赖**：desktop 端新增 zustand 依赖（轻量状态管理）
- **无 Breaking Changes**：现有 LogViewer 页面行为保持兼容，WS 协议不变

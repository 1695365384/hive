## 1. Server 端 — FileLogger 模块

- [x] 1.1 创建 `apps/server/src/logging/file-logger.ts`，实现 FileLogger 类：按天切割文件写入、日志格式化、日期切换检测
- [x] 1.2 实现文件大小检测（>50MB 额外切割为 `.1.log` 序号文件）
- [x] 1.3 实现启动时自动清理过期文件（默认 7 天可配置）
- [x] 1.4 实现 `dispose()` 方法（flush + 关闭 stream）
- [x] 1.5 编写 FileLogger 单元测试

## 2. Server 端 — 集成 FileLogger 到 interceptConsole

- [x] 2.1 修改 `admin-handler.ts` 的 `interceptConsole()`，在捕获日志时调用 `fileLogger.addLog(entry)`
- [x] 2.2 修改 `AdminWsHandler` 构造函数，接收 `logFile` 配置，初始化 FileLogger
- [x] 2.3 修改 `AdminWsHandler.dispose()`，调用 `fileLogger.dispose()`
- [x] 2.4 更新 `createServer` / bootstrap 流程，传递 logFile 配置

## 3. Desktop 端 — zustand 全局日志 Store

- [x] 3.1 安装 zustand 依赖 (`npm install zustand` in apps/desktop)
- [x] 3.2 创建 `apps/desktop/src/stores/log-store.ts`，定义 useLogStore：logs 数组、addLog、clearUnread、unreadCount、errorCount
- [x] 3.3 在 WsClient 初始化阶段订阅 `log` 事件，写入 useLogStore（而非组件 useEffect 层）

## 4. Desktop 端 — 底部抽屉 LogDrawer 组件

- [x] 4.1 创建 `apps/desktop/src/components/LogDrawer.tsx`：可折叠底部面板，复用 LogViewer 的过滤/渲染逻辑
- [x] 4.2 实现抽屉高度三档切换（折叠/半屏/全屏），拖拽调节
- [x] 4.3 实现状态栏 StatusBar 组件：显示 `Logs (N)` 和 `Errors (N)` badge，点击展开抽屉
- [x] 4.4 抽屉展开时 badge 归零

## 5. Desktop 端 — Dashboard 布局重构

- [x] 5.1 重构 `Dashboard.tsx` 为三段式布局：Sidebar + Content + StatusBar/LogDrawer
- [x] 5.2 从导航中移除 logs 页面入口（日志通过底部抽屉全局可见）
- [x] 5.3 LogViewer 页面保留但改为读取全局 store（向后兼容）

## 6. 验证

- [x] 6.1 启动 server，验证 `logs/` 目录创建和日志文件写入
- [x] 6.2 验证桌面端底部抽屉实时显示日志，切换页面不丢失
- [x] 6.3 验证状态栏 badge 数字正确
- [x] 6.4 验证日志文件按天切割和过期清理

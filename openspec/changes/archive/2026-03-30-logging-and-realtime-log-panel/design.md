## Context

当前 Server 日志通过 `interceptConsole()` 捕获到内存 LogBuffer（10K 条），经 Admin WS 推送到桌面端。桌面端 `LogViewer` 作为独立页面存在，用户必须切换到 logs 页面才能看到日志。

关键约束：
- Server 端零日志框架依赖，日志基于 `console.*` + `interceptConsole()`
- Desktop 使用 React + Vite + Tauri v2，当前无全局状态管理
- WS 协议已有 `log.subscribe` / `log.getHistory` / `log.unsubscribe`
- LogBuffer 已有 10K 条内存缓存能力

## Goals / Non-Goals

**Goals:**
- 日志持久化到工作空间 `logs/` 目录，按天切割，自动清理过期文件
- 桌面端底部抽屉面板，任意页面实时可见日志
- 全局日志状态管理，WS 连接时即开始收集，不因页面切换丢失日志
- 状态栏显示日志统计（未读数、错误数），点击可展开面板

**Non-Goals:**
- 不引入服务端日志框架（winston/pino 等），沿用 interceptConsole 方式
- 不做结构化 JSON 日志，保持纯文本可读格式
- 不做远程日志上报或日志分析平台
- 不改动 WS 协议（现有 log.subscribe 机制足够）

## Decisions

### D1: 状态管理选型 — zustand

**选择**: zustand（~1KB，无 Provider 包裹，支持 selector 优化）

**备选方案**:
| 方案 | 优点 | 缺点 |
|------|------|------|
| React Context | 零依赖 | 性能差，任何状态变化触发整棵树重渲染 |
| zustand | 极简 API，性能好，无 Provider | 新增依赖 |
| jotai | 原子化，更细粒度 | 学习成本略高，日志场景不需要原子级 |

**理由**: 日志场景需要高频更新（每条日志触发一次状态变更），zustand 的 selector 模式可以避免无关组件重渲染，且无需 Provider 包裹，集成成本最低。

### D2: 日志状态架构 — WS 层直接写入 store

**选择**: 在 WsClient 层（非组件层）订阅 `log` 事件并写入 zustand store

```
WsClient.onEvent("log")
    │
    ▼
useLogStore().addLog(entry)   ← 全局 store，组件无关
    │
    ├──▶ 底部抽屉面板 (LogDrawer) 实时渲染
    ├──▶ 状态栏 badge 读取 counts
    └──▶ LogViewer 页面 也可读取（向后兼容）
```

**理由**: 将订阅逻辑提升到 WsClient 初始化阶段，而非组件 `useEffect`。这样：
- WS 连接成功后立即开始收集日志，无需任何页面挂载
- 页面切换不影响日志收集
- 重连后自动恢复订阅，通过 store 补偿断线期间的日志

### D3: 文件写入 — 在 interceptConsole 中扩展

**选择**: 新增 `FileLogger` 类，由 `AdminWsHandler` 初始化并调用

```typescript
// file-logger.ts
class FileLogger {
  private currentStream: fs.WriteStream | null
  private currentDate: string

  addLog(entry: LogEntry): void  // 写入当前文件，检查日期切换
  cleanup(retentionDays: number): void  // 删除过期文件
  dispose(): void  // 关闭 stream
}
```

**理由**: 最小改动原则。`interceptConsole()` 已经是所有日志的汇聚点，在此处加一行 `this.fileLogger.addLog(entry)` 即可。FileLogger 封装文件操作细节。

### D4: 底部抽屉布局

**选择**: Dashboard 三段式布局

```
┌──────────────────────────────────┐
│ Sidebar │  TopBar + Content       │
│         │  (当前页面)             │
│         │                         │
│         │                         │
│─────────│─────────────────────────│
│         │ StatusBar [Logs (3)]    │
│         │ ┌─────────────────────┐ │
│         │ │ LogDrawer (可折叠)   │ │
│         │ │ ...                 │ │
│         │ └─────────────────────┘ │
└──────────────────────────────────┘
```

**要点**:
- 抽屉高度可拖拽调节（3 个档位：折叠/半屏/全屏）
- 默认折叠，新日志到达时 badge 更新但不自动展开
- 状态栏显示 `Logs (N)` 和 `Errors (N)`
- 抽屉展开时，badge 归零

## Risks / Trade-offs

- **[高频状态更新性能]** → zustand selector 确保只有订阅日志的组件重渲染；LogDrawer 使用虚拟滚动（如日志量大）
- **[文件写入阻塞]** → `fs.createWriteStream` 是异步的，不会阻塞事件循环
- **[日志文件磁盘占用]** → 默认保留 7 天，单个文件超过 50MB 时额外切割
- **[WS 断线丢日志]** → 断线期间服务端日志仍写入 LogBuffer（10K），重连后 `log.getHistory` 可补回部分日志

## 1. Server: 日志文件读取

- [x] 1.1 在 `hive-logger.ts` 中新增 `listLogDates()` 方法 — 扫描日志目录返回有日志的日期列表
- [x] 1.2 在 `hive-logger.ts` 中新增 `getLogsByDate(date, limit?, offset?)` 方法 — 读取指定日期的日志文件，解析 JSON 行返回 LogEntry[]
- [x] 1.3 在 `admin-handler.ts` 中注册 `log.listDates` handler
- [x] 1.4 在 `admin-handler.ts` 中注册 `log.getByDate` handler

## 2. Desktop: 日期选择 UI

- [x] 2.1 在 `log-store.ts` 中新增 `selectedDate` 状态和 `setSelectedDate` action，新增 `loadHistoryLogs(date)` action
- [x] 2.2 修改 `use-log-polling.ts` — 当 `selectedDate` 不是今天时暂停轮询
- [x] 2.3 在 `LogDrawer.tsx` 顶部添加日期选择器（下拉列表，含"今天"选项和历史日期列表）
- [x] 2.4 选择历史日期时调用 `log.getByDate` 加载日志，选择"今天"时恢复实时轮询

## 3. 验证

- [x] 3.1 Server TypeScript 编译通过 + 单元测试通过
- [x] 3.2 Desktop TypeScript 编译通过
- [ ] 3.3 重新打包 SEA binary，重启 Tauri dev 验证端到端功能

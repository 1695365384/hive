## Why

当前日志面板只能查看当前会话的实时日志。Server 重启后内存中的 LogBuffer 清空，历史日志丢失。用户需要按日期回溯查看任意一天的执行日志，用于问题排查和审计。

日志文件已按 `hive-YYYY-MM-DD.log` 格式存储在 `~/.hive/logs/`，只需新增服务端读取 API 和前端日期选择器即可实现。

## What Changes

- 新增 `log.getByDate` WS API：按日期读取日志文件并返回解析后的日志条目
- 新增 `log.listDates` WS API：列出有日志文件的日期列表
- 桌面端日志面板增加日期选择器，支持切换查看历史日期日志
- 查看历史日期时暂停实时轮询，切换回"今天"时恢复

## Capabilities

### New Capabilities
- `log-file-reader`: 从磁盘日志文件按日期读取和解析日志的服务端能力

### Modified Capabilities
- `file-logger`: 新增按日期读取日志文件的方法（文件已存在，只需添加读取能力）

## Impact

- `apps/server/src/logging/hive-logger.ts` — 新增文件读取方法
- `apps/server/src/gateway/ws/admin-handler.ts` — 注册新 WS handler
- `apps/desktop/src/hooks/use-log-polling.ts` — 支持日期切换逻辑
- `apps/desktop/src/components/LogDrawer.tsx` — 新增日期选择器 UI
- `apps/desktop/src/stores/log-store.ts` — 支持按日期加载日志

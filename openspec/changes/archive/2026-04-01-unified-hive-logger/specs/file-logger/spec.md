## MODIFIED Requirements

### Requirement: 日志写入工作空间 logs 目录
FileLogger SHALL 将日志写入工作空间下的 `logs/` 目录，文件命名为 `hive-YYYY-MM-DD.log`，格式为纯文本。

```
2026-03-30 14:30:01.234 [INFO] [server] Server started on port 4450
2026-03-30 14:30:01.235 [WARN] [plugin:feishu] Retry connection in 5s
2026-03-30 14:30:01.236 [ERROR] [agent] LLM request failed: timeout
```

#### Scenario: 首次写入时自动创建 logs 目录
- **WHEN** FileLogger 初始化时 `logs/` 目录不存在
- **THEN** FileLogger SHALL 自动创建 `logs/` 目录

#### Scenario: 按天自动切换日志文件
- **WHEN** 系统日期从 2026-03-30 变为 2026-03-31
- **THEN** FileLogger SHALL 关闭当前文件 `hive-2026-03-30.log`
- **THEN** FileLogger SHALL 创建并写入新文件 `hive-2026-03-31.log`

#### Scenario: 单个日志文件超过 50MB 时额外切割
- **WHEN** 当前日志文件大小超过 50MB
- **THEN** FileLogger SHALL 关闭当前文件
- **THEN** FileLogger SHALL 创建带序号的新文件 `hive-2026-03-30.1.log`

#### Scenario: FileLogger 在 main.ts 中单例创建
- **WHEN** `startServer()` 启动
- **THEN** FileLogger（作为 HiveLogger 的一部分）SHALL 在 main.ts 中创建唯一实例
- **THEN** AdminWsHandler 和 ChatWsHandler SHALL NOT 自行创建 FileLogger

## MODIFIED Requirements

### Requirement: FileLogger 优雅关闭
FileLogger SHALL 提供 `dispose()` 方法关闭文件流。SHALL 由 main.ts 的 close 函数统一调用。

#### Scenario: Server 停止时关闭日志文件
- **WHEN** 调用 `hiveLogger.dispose()`
- **THEN** SHALL 将缓冲区中的数据刷新到磁盘
- **THEN** SHALL 关闭 WriteStream

#### Scenario: close 函数统一 dispose
- **WHEN** main.ts 的 close() 被调用
- **THEN** SHALL 调用一次 `hiveLogger.dispose()`
- **THEN** AdminWsHandler.closeAll() SHALL NOT 再次调用 dispose

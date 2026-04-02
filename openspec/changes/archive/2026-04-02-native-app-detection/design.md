## Context

当前环境扫描系统分两阶段：
- Phase 1 (`probe.ts`): 同步探测 OS/Shell/Node/CPU/Memory，注入 system prompt
- Phase 2 (`scanner.ts`): 异步遍历 PATH 目录，分类、版本检测，存入 SQLite `env_tools` 表

`env_tools` 表结构：`name TEXT PK, category TEXT, version TEXT, path TEXT, scanned_at INTEGER`

`ToolCategory` 类型：`runtime | pkgManager | buildTool | container | vcs | system | other`

env-tool 当前行为：必须传 `query` 或 `category` 参数。无参数调用返回"no data"。

prompt 中 Environment section 只说"Use the `env` tool to check available tools"，Agent 不知道有哪些 category、不知道可以先调 env() 了解全貌。

## Goals / Non-Goals

**Goals:**
- Agent 能通过 `env(category="native-app")` 一步发现平台上可用的原生应用
- Agent 能通过 `env()` 无参数调用获得环境全貌概览，减少盲目工具调用
- 探测结果包含足够信息让 Agent 知道如何访问（访问命令示例）
- 跨平台支持（macOS / Windows / Linux）
- 不改 env_tools 表结构（复用现有 name/category/version/path 字段）
- 发现耗时 < 1 秒（纯文件系统扫描，无进程探测）

**Non-Goals:**
- 不硬编码任何应用列表（应用列表完全由运行时发现）
- 不在 prompt 中硬编码 category 列表或平台特定知识
- 不做应用的深层能力探测（只发现"存在性"，不做脚本化验证）
- 不涉及 Server/Channel/Desktop 层

## Decisions

### D1: 复用 env_tools 表，不改表结构

**选择**: 用现有表结构存储原生应用信息：
- `name`: 应用显示名（如 `Notes`、`Reminders`、`Calendar`）
- `category`: `native-app`（新增到 ToolCategory）
- `version`: 不填（原生应用版本对 Agent 没有意义）
- `path`: 平台级访问命令模板（如 `osascript -e 'tell application "Notes"'`）

### D2: 动态发现（无硬编码注册表）

**选择**: 运行时扫描平台特定目录发现已安装应用，而非维护静态注册表。

| 平台 | 发现方式 | 速度 |
|------|----------|------|
| macOS | `fs.readdirSync(/Applications/*.app)` | < 100ms |
| Windows | 枚举 Start Menu `.lnk` 快捷方式 | < 100ms |
| Linux | 解析 `/usr/share/applications/*.desktop` 的 `Name=` 字段 | < 200ms |

**替代方案**: 静态注册表 + 运行时探测 → 需要维护，不可扩展，每加一个应用都要改代码。放弃。

**设计原则**: 代码只定义"如何发现"（发现机制），不定义"有什么"（应用列表）。应用列表完全由文件系统决定。

### D3: 平台级访问命令模板（非 per-app 硬编码）

**选择**: 每个平台定义一个访问命令模板，对所有发现的通用：

| 平台 | 模板 |
|------|------|
| macOS | `osascript -e 'tell application "{AppName}"'` |
| Windows | `start "" "{AppName}"` |
| Linux | `gio launch "{appname}.desktop"` |

一个规则适用所有应用。新增应用时无需任何代码变更。

### D4: 发现集成到 scanEnvironment()

**选择**: PATH 扫描和原生应用发现并发执行（Promise.all）。原生应用发现是同步的文件系统操作（< 100ms），用 Promise.resolve 包装。

### D5: env() 无参数返回 category 摘要

**选择**: 当 env-tool 收到的 query 和 category 都为空时，执行 `SELECT category, COUNT(*) as count FROM env_tools GROUP BY category ORDER BY count DESC`，返回每个 category 的名称和工具数量。格式：

```
- **runtime** (5 tools)
- **native-app** (42 tools)
- **system** (8 tools)

Use `env(category="<name>")` to list tools in a specific category.
Use `env(query="<keyword>")` to search by keyword.
```

**替代方案**: prompt 中列所有 category → 每加一个 category 改 prompt，不可扩展。放弃。

### D6: prompt 方法论引导（非知识注入）

**选择**: 在 `formatEnvironment()` 的末尾追加一句方法论引导，而非 category 列表：

```
Before executing an unfamiliar task, call env() to discover available capabilities.
```

这教的是"怎么思考"，不是"具体知道什么"。~100 字符，跨平台通用，不需要随 category 变更而修改。

**替代方案**: 在 prompt 中列出所有 category 名称 → 臃肿且不可扩展。放弃。

### D7: 不做脚本化验证

**选择**: 发现所有 .app bundles 后直接存入数据库，不做 `osascript` 脚本化验证。

**理由**: 每个应用验证需要 2 秒，100+ 应用需要 200+ 秒，远超性能预算。Agent 在实际需要交互时可以尝试访问命令，失败自然反馈。信息类查询（"有哪些应用"）不需要验证。

## Risks / Trade-offs

- **[Risk] macOS /Applications 下可能有大量应用** → 限制 MAX_APPS=200，防止数据库膨胀
- **[Risk] 非脚本化应用存入数据库** → Agent 查到后尝试访问会失败，但比不知道该应用存在好得多。信息价值 > 操作保证。
- **[Risk] path 字段语义变化** → env-tool 输出格式已调整，native-app 的 path 显示为 "access: ..."
- **[Trade-off] env() 概览多一次工具调用** → 但能省下后面 30 次盲目调用，净效果是减少
- **[Trade-off] 动态发现依赖文件系统约定** → 依赖 /Applications、.desktop 等 XDG 标准，但这些是各平台的主流约定

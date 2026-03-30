## Context

Hive 使用 `.hive/` 作为工作空间目录（已有 `hive.db`、`cache/`）。插件系统当前通过 npm 动态 import 加载，插件配置耦合在 `hive.config.json` 中。

## Goals / Non-Goals

**Goals:**
- 用户将插件 ZIP 解压到 `.hive/plugins/<name>/` 后，重启 server 即自动加载
- 插件配置从插件目录下的 `config.json` 读取，与主配置解耦
- 保留 npm 动态加载作为兼容路径（hive.config.json 中仍可配置）
- 目录扫描和 npm 加载两种来源的插件合并为统一的 `IPlugin[]`

**Non-Goals:**
- ZIP 上传 / 自动解压 API（后续迭代）
- 插件热加载（需重启）
- 插件依赖解析（插件必须打包为自包含的单文件）
- 插件签名 / 安全校验（后续迭代）

## Decisions

### 1. 插件目录结构

```
.hive/plugins/
└── <plugin-name>/
    ├── package.json          ← 必须含 "hive": { "plugin": true, "entry": "..." }
    ├── config.json           ← 可选，插件配置（缺失时传 {} 给构造函数）
    └── dist/
        └── index.js          ← 打包产物
```

`package.json` 中的 `hive.entry` 指定入口文件相对路径，默认 `dist/index.js`。

**替代方案：固定入口文件名** — 不够灵活，不同打包工具输出路径不同。

### 2. 加载优先级：目录扫描优先，npm 配置兜底

```
loadPlugins():
  1. 扫描 .hive/plugins/ → 得到 IPlugin[]
  2. 读取 hive.config.json plugins → 动态 import → 得到 IPlugin[]
  3. 合并，npm 插件不覆盖同名的目录插件
```

### 3. 扫描逻辑放在 app 层

与动态 import 一样，扫描和加载逻辑在 `apps/server/src/plugins.ts`，core 不感知。

## Risks / Trade-offs

- **[插件质量]** 无打包约束可能导致加载失败 → 加载时 catch 错误，log 清晰提示
- **[同名冲突]** 目录插件和 npm 插件同名 → 目录优先，npm 不覆盖
- **[配置迁移]** 现有 hive.config.json 中的插件配置 → 兼容保留，不影响现有用户

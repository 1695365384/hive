## Context

Hive 的插件加载系统已实现（`scanPluginDir` + `loadFromNpm`），支持从 `.hive/plugins/` 目录和 npm 动态 import 两种方式加载插件。CLI 目前是手写 `parseArgs`，只有 `chat` 和 `server` 两个命令。

本设计在已有加载机制之上，补齐**搜索 → 安装 → 管理**的用户体验链路。

## Goals / Non-Goals

**Goals:**
- 用户可通过 `hive plugin search <keyword>` 搜索 npm 上的 `@hive/plugin-*` 插件
- 用户可通过 `hive plugin add <source>` 安装插件（npm 包、Git URL、本地路径）
- 用户可通过 `hive plugin list/remove/info/update` 管理已安装插件
- 安装后的插件与现有 `scanPluginDir()` 机制无缝衔接

**Non-Goals:**
- 不自建 Registry 服务或 GitHub 索引 Repo（直接用 npm Registry API）
- 不做 Desktop UI（本期只做 CLI，预留 Server API 接口）
- 不做插件热重载（安装后需重启生效）
- 不做插件签名验证（依赖 npm scope `@hive/plugin-*` 防冒名）
- 不做插件依赖冲突检测（依赖 npm 自身的依赖解析）

## Decisions

### D1: CLI 框架选择 — commander

**选择**: 引入 `commander` 作为 CLI 框架。

**替代方案**:
- 继续手写 parseArgs：嵌套子命令（`hive plugin add`）会导致代码快速膨胀
- yargs：功能更强但 API 更复杂，commander 对本场景足够

**理由**: commander 是 Node.js 生态最成熟的 CLI 框架，零配置支持子命令、参数校验、自动 help 生成。与现有手写 parseArgs 的迁移成本极低。

### D2: 插件搜索 — npm Registry Search API

**选择**: 直接调用 `https://registry.npmjs.org/-/v1/search?text=scope:hive-plugin+<keyword>` 进行搜索。

**理由**:
- 零基础设施：不需要自建索引服务
- 服务端模糊搜索：npm API 支持文本匹配、评分排序
- 无速率限制：npm Registry API 对搜索无实质限流
- 插件发布到 npm 后立即可搜索，无需额外维护索引

### D3: npm 安装位置 — `--prefix .hive/plugins/<name>`

**选择**: 使用 `npm install --prefix .hive/plugins/<name> <package>` 安装插件到 `.hive/plugins/` 目录下。

**安装后目录结构**:
```
.hive/plugins/feishu/
├── node_modules/
│   └── @hive/
│       └── plugin-feishu/
│           ├── dist/index.js    ← 入口
│           └── package.json     ← hive.plugin 字段
└── package.json                 ← npm --prefix 生成的
```

**与现有加载机制的衔接**: `scanPluginDir()` 扫描 `.hive/plugins/` 下的子目录，查找 `package.json` 的 `hive.plugin` 字段。但 `--prefix` 安装后，实际的 `package.json` 在 `node_modules/@bundy-lmw/hive-plugin-feishu/` 下，不在子目录根。

**解决方案**: 修改 `scanPluginDir()` 增加 `--prefix` 安装模式的识别——如果子目录下没有直接的 `package.json`（有 `hive.plugin`），则检查 `node_modules/@hive/` 下是否有包。

### D4: 安装状态存储 — `.registry.json`

**选择**: 在 `.hive/plugins/.registry.json` 记录已安装插件的元数据。

```json
{
  "feishu": {
    "source": "npm:@bundy-lmw/hive-plugin-feishu@1.0.0",
    "installedAt": "2026-03-30T12:00:00.000Z",
    "resolvedVersion": "1.0.0"
  }
}
```

**职责分离**:
- `.registry.json`: 安装元数据（来源、版本、安装时间），由 `hive plugin` 命令读写
- `hive.config.json`: 运行时配置（API key 等），由用户或插件 UI 编辑

### D5: Git URL 安装 — clone + npm install

**选择**: `git clone` 到临时目录 → `npm install --production` → 复制到 `.hive/plugins/<name>/`。

安装前展示仓库信息并要求用户确认（安全考虑）。

### D6: 模块结构

```
apps/server/src/plugin-manager/
├── index.ts          # 公开 API (search, install, list, remove, update, info)
├── searcher.ts       # npm Registry 搜索
├── installer.ts      # 多来源安装 (npm / git / local)
├── registry.ts       # .registry.json 读写
├── cli.ts            # commander 子命令注册
└── types.ts          # 插件分发相关类型
```

## Risks / Trade-offs

- **[npm --prefix 目录结构不标准]** → 通过修改 `scanPluginDir()` 增加嵌套目录检测来兼容
- **[npm install 网络失败]** → 安装失败时清理半成品目录，不写 .registry.json
- **[Git clone 恶意仓库]** → 安装前要求用户确认，检查 package.json 中的 scripts
- **[npm scope 被冒名注册]** → `@hive` scope 需要在 npm 上注册组织账号，限制发布权限
- **[scanPluginDir 遍历 node_modules 慢]** → 只检查一级子目录，不递归

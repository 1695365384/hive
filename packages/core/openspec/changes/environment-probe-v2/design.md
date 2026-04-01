## Context

当前环境探测系统（`packages/core/src/environment/probe.ts`）在 Server 启动时运行，通过 `which` 命令检测 11 个写死的工具（git, pnpm, npm 等），结果存入 `EnvironmentContext` 并全量注入 Agent system prompt。

问题：
- 工具列表写死，无法感知系统自带能力（macOS 的 screencapture、pbcopy 等）
- `systeminformation` 依赖引入但未使用
- os 模块能提供的 CPU/内存信息未利用
- 所有信息全量注入 prompt，token 浪费
- Agent 执行任务时仍需来回试探环境

项目已有 SQLite 基础设施（`better-sqlite3`，SessionCapability 使用），工具注册系统成熟（`ToolRegistry` + built-in tools）。

## Goals / Non-Goals

**Goals:**
- Agent 启动后零额外 turns 即可感知系统基础环境（OS/CPU/Memory）
- 全量扫描 PATH 下所有可执行文件，按类别分类存入 SQLite
- Agent 通过内置工具按需查询系统能力，不浪费 prompt token
- 跨平台支持（macOS/Linux/Windows）
- 覆盖开发工具 + 系统自带能力（截图、剪贴板、自动化等）

**Non-Goals:**
- 不做运行时动态刷新（环境变化后重启 server 即可）
- 不做网络探测（代理、DNS、连通性）
- 不做 Docker 容器内部环境探测
- 不做敏感信息收集（API keys、用户名、HOME 路径）
- 不做用户自定义探测配置（内置分类字典够用）

## Decisions

### 1. 探测模块位置不变，内部重构

**选择**: 保持 `packages/core/src/environment/` 路径，重构 `probe.ts` + `types.ts`

**理由**: 环境信息服务于 Agent，属于 core 职责。Server 只负责调用。路径不变降低迁移成本。

### 2. 启动两阶段探测

**选择**:
- 阶段 1（同步，< 1ms）：os 模块获取 OS/Shell/Node/CPU/Memory → 注入 prompt
- 阶段 2（异步，2-3s）：全量扫描 PATH → 分类 → 版本探测 → 写入 SQLite

**理由**: 阶段 1 保证 Agent 第一句话就能感知基础环境；阶段 2 不阻塞 Agent 接受请求，异步完成后即可查询。实测 30 个工具 `--version` 探测约 1.3s，全量 PATH 扫描预计 2-3s。

**替代方案**: 全量同步探测 → 启动阻塞 3s+，用户体验差。

### 3. PATH 全量扫描而非写死列表

**选择**: 读取 `process.env.PATH`，遍历所有目录下的可执行文件，用分类字典匹配

**跨平台 PATH 解析**:
- macOS/Linux: `process.env.PATH` 冒号 `:` 分隔
- Windows: `process.env.Path` 或 `process.env.PATH` 分号 `;` 分隔

**可执行文件判定**:
- macOS/Linux: `fs.accessSync(path, fs.constants.X_OK)`
- Windows: 文件扩展名为 `.exe`、`.bat`、`.cmd`、`.ps1`

**分类字典**: 已知工具按类别归类，未命中工具归入 `other` 类别。字典按平台区分（`system:darwin`、`system:linux`、`system:win32`）。

**理由**: 写死列表无法覆盖系统自带工具（screencapture 等），全量扫描 + 分类字典更灵活且覆盖面广。

### 4. SQLite 存储 + 内置工具查询

**选择**: 探测结果写入 `env_tools` 表，通过 `query-environment` 内置工具按需查询

**表结构**:
```sql
CREATE TABLE IF NOT EXISTS env_tools (
  name       TEXT PRIMARY KEY,
  category   TEXT NOT NULL,
  version    TEXT,
  path       TEXT,
  scanned_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_env_tools_category ON env_tools(category);
```

**工具接口**:
```typescript
// 按关键词模糊查询
queryEnvironment({ query: "python" })
// → [{ name: "python3", category: "runtime", version: "3.12.1", path: "/usr/bin/python3" }]

// 按类别查询
queryEnvironment({ category: "buildTool" })
// → [{ name: "make", ... }, { name: "cmake", ... }]
```

**理由**: SQLite 已是项目依赖，无需引入新存储。内置工具模式与现有 Bash/File/Grep 工具一致，Agent 可自然调用。

**替代方案**: 全量注入 prompt → 几百个工具占用大量 token；存文件 → Agent 无法结构化查询。

### 5. 版本号在阶段 2 全量探测

**选择**: 阶段 2 对所有已知工具跑 `--version`，一次性存入 SQLite

**理由**: 实测 18 个工具版本探测仅需 1.3s，全量 PATH 中有意义工具约 30-50 个，总耗时可控在 2-3s。无需懒加载，查询时直接返回。

### 6. 分类字典设计

```typescript
const TOOL_CATEGORIES: Record<string, Record<string, string>> = {
  // 跨平台工具
  common: {
    // Runtimes
    node: 'runtime', deno: 'runtime', bun: 'runtime',
    python3: 'runtime', python: 'runtime', ruby: 'runtime',
    go: 'runtime', java: 'runtime', javac: 'runtime',
    rustc: 'runtime', swift: 'runtime', dotnet: 'runtime',
    // Package Managers
    pnpm: 'pkgManager', npm: 'pkgManager', yarn: 'pkgManager',
    pip3: 'pkgManager', pip: 'pkgManager', cargo: 'pkgManager',
    gem: 'pkgManager', composer: 'pkgManager', go: 'pkgManager',
    // Build Tools
    make: 'buildTool', cmake: 'buildTool', gradle: 'buildTool',
    gcc: 'buildTool', g++: 'buildTool', clang: 'buildTool', clang++: 'buildTool',
    swiftc: 'buildTool', xcodebuild: 'buildTool', rustc: 'buildTool',
    // Containers
    docker: 'container', podman: 'container', colima: 'container',
    'docker-compose': 'container',
    // VCS
    git: 'vcs', hg: 'vcs', svn: 'vcs',
  },
  darwin: {
    brew: 'pkgManager',
    screencapture: 'system', pbcopy: 'system', pbpaste: 'system',
    open: 'system', osascript: 'system', say: 'system',
    diskutil: 'system', caffeinate: 'system', pmset: 'system',
    mdfind: 'system', lsof: 'system', launchctl: 'system',
    plutil: 'system', sw_vers: 'system', security: 'system',
  },
  linux: {
    apt: 'pkgManager', dnf: 'pkgManager', snap: 'pkgManager',
    xdg_open: 'system', xclip: 'system', xsel: 'system',
    systemctl: 'system', notify_send: 'system', scrot: 'system',
    journalctl: 'system', cron: 'system', systemctl: 'system',
  },
  win32: {
    clip: 'system', start: 'system', powershell: 'system',
    tasklist: 'system', netsh: 'system', where: 'system',
  },
}
```

注意：分类字典中工具名使用下划线替代连字符（如 `docker-compose` → `docker_compose`），存储时还原为实际命令名。

### 7. EnvironmentContext 精简

**选择**: 移除 `tools`、`packageManager`、`projectType`，新增 `cpu`、`memory`

```typescript
interface EnvironmentContext {
  os: { platform: string; arch: string; version: string; displayName: string }
  shell: string
  node: { version: string }
  cpu: { model: string; cores: number }
  memory: { totalGb: number }
  cwd: string
}
```

**理由**: `tools`/`packageManager`/`projectType` 改由 SQLite + 内置工具查询，不需要全量注入 prompt。`cpu`/`memory` 对 Agent 决策有价值（判断能否并行编译、内存是否足够）。

### 8. query-environment 工具注册

**选择**: 注册为 evaluator 类型可用的内置工具（与 bash、file 同级）

**理由**: query-environment 是信息查询工具，不涉及文件写入或命令执行，所有 Agent 类型都应可用。

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| PATH 扫描在 PATH 很长时（100+ 目录）可能耗时 | 限制扫描目录数量上限（如 50），跳过不存在的目录 |
| `--version` 输出格式不统一 | 只取第一行，截断到合理长度（200 字符），解析失败时存 null |
| Windows PATH 解析差异 | 使用 `process.env.Path` 回退，文件扩展名过滤 |
| SQLite 写入在阶段 2 异步进行，Agent 在写入完成前查询 | 工具检查 `env_tools` 表是否存在数据，无数据时返回"环境探测尚未完成"提示 |
| 分类字典覆盖不全 | 未命中工具归入 `other` 类别，不丢失数据，后续可补充字典 |
| 环境变化后数据过时 | 表中 `scanned_at` 记录时间，Agent 可据此判断数据新鲜度 |

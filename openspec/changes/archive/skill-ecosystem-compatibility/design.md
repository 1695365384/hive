## Context

Hive 的技能系统当前只从本地 `skills/` 目录加载内置技能。社区已有成熟的开放技能生态 — `vercel-labs/skills`（`npx skills`），技能格式为 `SKILL.md` + YAML frontmatter（遵循 `agentskills.io` 规范）。Hive 的 `SkillLoader` 在格式层面已天然兼容该规范（同样解析 YAML frontmatter 中的 `name` + `description`）。

当前痛点：
1. 无法从 GitHub 仓库安装第三方技能
2. `SkillRegistry` 在 `refreshIfChanged()` 中对不存在的目录执行 `mkdirSync`，会创建无意义的空目录
3. `userSkillsDir` 无默认值，server 端未配置

## Goals / Non-Goals

**Goals:**
- 用户能通过 `hive skill add <github-source>` 从任意 GitHub 仓库安装技能到项目工作空间
- 用户技能与内置技能目录隔离（`skills/` vs `skills.local/`）
- 用户技能与 Claude Code 等其他 Agent 工具的技能完全隔离（不使用 `.claude/skills/`）
- 安装后 `SkillRegistry` 自动检测并加载，无需重启
- 修复 `mkdirSync` 自动创建空目录的隐患

**Non-Goals:**
- 不实现技能版本更新（用户可重新 add 覆盖）
- 不实现技能搜索/注册表
- 不支持全局技能目录（`~/.hive/skills/`）
- 不依赖 `vercel-labs/skills` CLI 或向其提 PR

## Decisions

### D1: 用户技能目录 — `skills.local/`

**选择**: `skills.local/` 作为用户技能目录（相对于 `process.cwd()`）

**替代方案**:
- `.hive/skills/` — 需要 `npx skills` 注册 Hive 为 Agent 才能直接安装，且用户明确拒绝依赖第三方 PR
- `.claude/skills/` — 与 Claude Code 混淆，用户明确拒绝

**理由**: `skills.local/` 语义清晰（local = 用户本地安装），与 `skills/`（内置）对称，不需要任何外部工具的配合。`.gitignore` 添加 `skills.local/` 即可排除。

### D2: 安装逻辑 — 自行实现 git clone + 文件复制

**选择**: `hive skill add` 内部执行 `git clone --depth 1` + 按标准路径查找 `SKILL.md` + 复制到 `skills.local/`

**替代方案**:
- 调用 `npx skills` CLI — 依赖外部工具，且无法指定自定义目标路径
- npm 包安装 — 技能仓库不是 npm 包，不适用

**理由**: 完全自主可控，无外部依赖。安装逻辑简单（~50 行），核心流程：
1. 解析 source（`owner/repo` 或完整 URL）
2. `git clone --depth 1` 到临时目录
3. 按 `agentskills.io` 标准路径查找 SKILL.md（`skills/` → `.claude/skills/` → 根目录 → 递归兜底）
4. 复制匹配的 `<name>/` 目录到 `skills.local/`
5. 清理临时目录

### D3: SKILL.md 发现路径 — 遵循 agentskills.io 规范

**选择**: 按 `vercel-labs/skills` 定义的标准路径顺序查找

**路径优先级**:
1. `skills/<name>/SKILL.md`
2. `skills/.curated/<name>/SKILL.md`
3. `skills/.experimental/<name>/SKILL.md`
4. `.claude/skills/<name>/SKILL.md`
5. 根目录 `SKILL.md`（单技能仓库）
6. 递归搜索（兜底）

**理由**: 确保与生态中所有技能仓库兼容。大部分技能仓库都遵循此结构。

### D4: SkillRegistry 不自动创建目录

**选择**: 删除 `refreshIfChanged()` 和 `loadFromDirectorySync()` 中的 `mkdirSync` 调用，目录不存在时静默跳过

**理由**:
- `skills/` 由仓库维护，不需要自动创建
- `skills.local/` 由 `hive skill add` 创建，如果不存在说明没有用户技能，无需创建空目录
- 避免在文件系统中留下无意义的空目录

### D5: CLI 子命令放在 `apps/server/src/cli/`

**选择**: 在现有 commander CLI 框架下新增 `skill` 子命令组

**理由**: 与 `plugin` 子命令保持一致的模式。CLI 代码属于 server 包，因为 server 是唯一暴露 CLI 入口的包。

## Risks / Trade-offs

| 风险 | 缓解 |
|------|------|
| git clone 失败（网络、权限、仓库不存在） | 捕获错误，友好提示，清理临时目录 |
| 技能仓库结构不标准导致找不到 SKILL.md | 递归兜底搜索 + 明确错误提示 |
| 用户技能覆盖内置技能（同名） | 用户技能优先级高于内置技能（后加载覆盖），与 `npx skills` 行为一致 |
| 临时目录未清理（进程中断） | 使用 `os.tmpdir()` + 随机后缀，系统自动清理 |
| `hive skill add` 在 SEA binary 中执行 git | SEA binary 打包时不包含 git，需使用系统 PATH 中的 git |

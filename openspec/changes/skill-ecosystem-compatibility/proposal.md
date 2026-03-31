## Why

Hive 的技能系统目前只支持从本地 `skills/` 目录加载内置技能，无法从外部生态安装技能。社区已有成熟的开放技能生态（`vercel-labs/skills`，即 `npx skills`），技能格式统一为 `SKILL.md` + YAML frontmatter（`agentskills.io` 规范），且已有大量可用技能仓库。Hive 的 `SkillLoader` 在格式层面已天然兼容该规范，但缺少安装机制和用户技能目录。需要让用户能从 GitHub 仓库安装技能到项目工作空间，同时与 Claude Code 等其他 Agent 工具的技能完全隔离。

## What Changes

- **新增 `hive skill add` CLI 子命令**：从 GitHub 仓库（`owner/repo` 简写或完整 URL）克隆并安装技能到项目工作空间，支持指定安装单个技能（`-s skill-name`）
- **新增 `hive skill list` CLI 子命令**：列出已安装的内置技能和用户技能
- **新增 `hive skill remove` CLI 子命令**：移除已安装的用户技能
- **修改 `SkillSystemConfig`**：`userSkillsDir` 默认值从无改为 `skills.local/`，与内置技能目录 `skills/` 隔离
- **修复 `SkillRegistry`**：删除 `refreshIfChanged()` 和 `loadFromDirectorySync()` 中的自动 `mkdirSync` 行为，目录不存在时静默跳过
- **`.gitignore` 更新**：添加 `skills.local/` 排除规则

## Capabilities

### New Capabilities
- `skill-installer`: 从 GitHub 仓库安装、列出、移除用户技能的 CLI 命令

### Modified Capabilities
- `plugin-cli`: 新增 `skill` 子命令组（add / list / remove）

## Non-goals

- **不实现技能更新机制**：用户可重新 `hive skill add` 覆盖安装，未来再考虑 `update` 子命令
- **不实现技能注册表/搜索**：用户自行在 GitHub 或 skills.sh 发现技能仓库
- **不依赖 `vercel-labs/skills` CLI**：自行实现安装逻辑（git clone + 文件复制），避免对外部 PR 的依赖
- **不支持全局技能目录**：所有技能都在项目工作空间内，不支持 `~/.hive/skills/` 全局安装
- **不向 `vercel-labs/skills` 提 PR 注册 Hive**：保持独立，不依赖第三方接受

## Impact

- **受影响模块**：`packages/core`（SkillSystemConfig、SkillRegistry）、`apps/server`（CLI、bootstrap）
- **新增依赖**：无（git clone 使用 Node.js 内置 `child_process`）
- **API 变更**：`SkillSystemConfig.userSkillsDir` 新增默认值，属于向后兼容变更（原默认无，新默认 `skills.local/`）
- **文件系统**：新增 `skills.local/` 目录（gitignored）

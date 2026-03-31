## 1. SkillRegistry 修复与 userSkillsDir 默认值

- [x] 1.1 删除 `registry.ts` 中 `refreshIfChanged()` 的 `mkdirSync` 调用，改为目录不存在时静默跳过
- [x] 1.2 删除 `registry.ts` 中 `loadFromDirectorySync()` 的 `mkdirSync` 调用，改为目录不存在时返回空数组
- [x] 1.3 `SkillSystemConfig.userSkillsDir` 默认值改为 `path.resolve(process.cwd(), 'skills.local')`，`getConfiguredSkillDirs()` 返回 `[builtin, user]` 两个目录
- [x] 1.4 编写单元测试：验证目录不存在时不自动创建、不报错；验证 userSkillsDir 默认值
- [x] 1.5 运行 `pnpm test` 确认现有测试不受影响

## 2. Skill 安装器核心逻辑

- [x] 2.1 创建 `apps/server/src/cli/commands/skill/installer.ts`：实现 `parseSource()` 函数（`owner/repo` → URL、完整 URL 直通）
- [x] 2.2 实现 `cloneRepo()` 函数：`git clone --depth 1` 到 `os.tmpdir()` 随机子目录，含 SIGINT/SIGTERM 信号处理清理
- [x] 2.3 实现 `discoverSkills()` 函数：按 agentskills.io 标准路径顺序查找 SKILL.md（skills/ → skills/.curated/ → skills/.experimental/ → .claude/skills/ → 根目录 → 递归兜底）
- [x] 2.4 实现 `installSkills()` 函数：复制匹配的技能目录到 `skills.local/`，含路径穿越检查（跳过 `../`），同名技能覆盖处理
- [x] 2.5 实现 `cleanup()` 函数：递归删除临时目录
- [x] 2.6 编写单元测试：parseSource 各种输入格式、discoverSkills 路径优先级、路径穿越防护、cleanup 清理

## 3. CLI 子命令注册

- [x] 3.1 创建 `apps/server/src/cli/commands/skill/index.ts`：注册 `skill` 子命令组，含 add / list / remove
- [x] 3.2 实现 `skill add` 子命令：参数 `<source>`，选项 `-s <name>`（可多次）、`--list`（仅预览），调用 installer 模块
- [x] 3.3 实现 `skill list` 子命令：读取 `skills/` 和 `skills.local/` 目录，分组展示内置/用户技能（名称、描述、版本）
- [x] 3.4 实现 `skill remove` 子命令：参数 `<name>`，验证不在内置技能列表中，删除 `skills.local/<name>/` 目录
- [x] 3.5 在 `apps/server/src/cli/index.ts` 中注册 skill 命令组（与 plugin 并列）
- [x] 3.6 编写集成测试：`hive skill --help`、`hive skill add` 缺参数报错、`hive skill remove` 缺参数报错

## 4. 收尾与文档

- [x] 4.1 `.gitignore` 添加 `skills.local/` 排除规则
- [x] 4.2 更新 CLAUDE.md：技能安装命令示例
- [x] 4.3 运行 `pnpm test` 全量测试，确认 80% 覆盖率
- [x] 4.4 运行 `pnpm --filter @bundy-lmw/hive-server build` 确认编译通过

## ADDED Requirements

### Requirement: skill add 命令
系统 SHALL 支持 `hive skill add <source>` 命令，从 GitHub 仓库安装技能到项目工作空间的 `skills.local/` 目录。

#### Scenario: 通过 owner/repo 简写安装
- **WHEN** 用户执行 `hive skill add vercel-labs/agent-skills`
- **THEN** 系统 git clone 该仓库到临时目录，查找所有 SKILL.md 文件，复制技能目录到 `skills.local/`，清理临时目录，输出安装结果

#### Scenario: 通过完整 GitHub URL 安装
- **WHEN** 用户执行 `hive skill add https://github.com/owner/repo`
- **THEN** 行为与 owner/repo 简写一致

#### Scenario: 通过 git URL 安装
- **WHEN** 用户执行 `hive skill add git@github.com:owner/repo.git`
- **THEN** 行为与 owner/repo 简写一致

#### Scenario: 指定单个技能安装
- **WHEN** 用户执行 `hive skill add vercel-labs/agent-skills -s frontend-design`
- **THEN** 系统仅安装名为 `frontend-design` 的技能，忽略其他技能

#### Scenario: 指定多个技能安装
- **WHEN** 用户执行 `hive skill add vercel-labs/agent-skills -s frontend-design -s code-review`
- **THEN** 系统仅安装指定的技能

#### Scenario: 安装前预览可用技能
- **WHEN** 用户执行 `hive skill add vercel-labs/agent-skills --list`
- **THEN** 系统列出仓库中可用的技能名称，不执行安装

#### Scenario: 缺少 source 参数
- **WHEN** 用户执行 `hive skill add`（不带参数）
- **THEN** 展示错误信息 "Usage: hive skill add <owner/repo | github-url>"

#### Scenario: 源仓库不存在
- **WHEN** 用户执行 `hive skill add nonexistent/repo`
- **THEN** 展示错误信息 "Failed to clone repository" 并提示检查仓库地址

#### Scenario: 仓库中无 SKILL.md
- **WHEN** 用户执行 `hive skill add owner/repo`，但仓库中不包含任何 SKILL.md 文件
- **THEN** 展示错误信息 "No skills found in repository"

#### Scenario: 覆盖已安装的同名技能
- **WHEN** 用户执行 `hive skill add` 安装一个与 `skills.local/` 中已有技能同名的技能
- **THEN** 覆盖已有技能目录，输出 "Updated: <skill-name>"

### Requirement: skill list 命令
系统 SHALL 支持 `hive skill list` 命令，列出项目中所有已安装的技能。

#### Scenario: 列出所有技能
- **WHEN** 用户执行 `hive skill list`
- **THEN** 分两组展示：内置技能（来自 `skills/`）和用户技能（来自 `skills.local/`），每个技能显示名称、描述、版本

#### Scenario: 无用户技能
- **WHEN** 用户执行 `hive skill list`，且 `skills.local/` 不存在
- **THEN** 仅展示内置技能，不展示用户技能分组

### Requirement: skill remove 命令
系统 SHALL 支持 `hive skill remove <name>` 命令，从 `skills.local/` 中移除用户技能。

#### Scenario: 移除用户技能
- **WHEN** 用户执行 `hive skill remove frontend-design`
- **THEN** 删除 `skills.local/frontend-design/` 目录，输出 "Removed: frontend-design"

#### Scenario: 移除不存在的技能
- **WHEN** 用户执行 `hive skill remove nonexistent`
- **THEN** 展示错误信息 "Skill not found: nonexistent"

#### Scenario: 尝试移除内置技能
- **WHEN** 用户执行 `hive skill remove <builtin-skill-name>`（内置技能名）
- **THEN** 展示错误信息 "Cannot remove built-in skill: <name>. Use 'skill remove' only for user-installed skills."

#### Scenario: 缺少 name 参数
- **WHEN** 用户执行 `hive skill remove`（不带参数）
- **THEN** 展示错误信息 "Usage: hive skill remove <name>"

### Requirement: SKILL.md 发现路径
安装器 SHALL 按 `agentskills.io` 规范定义的标准路径顺序查找 SKILL.md 文件。

#### Scenario: 标准 skills/ 目录结构
- **WHEN** 仓库包含 `skills/<name>/SKILL.md` 结构
- **THEN** 正确发现并安装所有技能

#### Scenario: 根目录单技能
- **WHEN** 仓库根目录包含 `SKILL.md`（单技能仓库）
- **THEN** 将整个仓库内容作为单个技能安装

#### Scenario: .claude/skills/ 目录结构
- **WHEN** 仓库仅包含 `.claude/skills/<name>/SKILL.md`
- **THEN** 正确发现并安装所有技能

#### Scenario: 非标准结构递归兜底
- **WHEN** 仓库使用非标准目录结构
- **THEN** 递归搜索所有 SKILL.md 文件并安装

### Requirement: 安装器安全约束
安装器 SHALL 对复制的文件执行安全检查。

#### Scenario: 路径穿越防护
- **WHEN** 技能目录中包含 `../` 路径的文件
- **THEN** 跳过该文件，输出警告

#### Scenario: 临时目录清理
- **WHEN** 安装完成（成功或失败）
- **THEN** 清理所有临时目录和文件

#### Scenario: 安装中断清理
- **WHEN** 安装过程中进程被中断（SIGINT/SIGTERM）
- **THEN** 清理临时目录

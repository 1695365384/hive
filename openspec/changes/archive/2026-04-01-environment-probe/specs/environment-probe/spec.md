## ADDED Requirements

### Requirement: EnvironmentContext 数据结构
系统 SHALL 定义 `EnvironmentContext` interface，包含以下字段：`os`（platform/arch/version）、`shell`（shell 类型）、`node`（Node.js 版本）、`tools`（可用工具链列表）、`packageManager`（包管理器）、`projectType`（项目类型）、`cwd`（当前工作目录）。

#### Scenario: EnvironmentContext 完整结构
- **WHEN** 调用 `probeEnvironment()` 返回结果
- **THEN** 返回对象 SHALL 包含 `os`、`shell`、`node`、`tools`、`packageManager`、`projectType`、`cwd` 字段
- **THEN** 所有字段类型 SHALL 为 string 或 string 的嵌套对象（os/node）

#### Scenario: tools 字段内容
- **WHEN** 环境中存在 `git`、`pnpm`、`docker` 命令
- **THEN** `tools` 数组 SHALL 包含 `'git'`、`'pnpm'`、`'docker'`

### Requirement: OS 和 Node.js 信息同步获取
`probeEnvironment()` SHALL 使用 Node.js 内置 `os` 模块和 `process.version` 同步获取操作系统和 Node.js 版本信息，不依赖外部命令。

#### Scenario: macOS 环境
- **WHEN** 在 macOS arm64 上运行
- **THEN** `os.platform` SHALL 为 `'darwin'`
- **THEN** `os.arch` SHALL 为 `'arm64'`

#### Scenario: Node.js 版本
- **WHEN** Node.js 版本为 v20.11.0
- **THEN** `node.version` SHALL 为 `'v20.11.0'`

### Requirement: Shell 类型检测
系统 SHALL 通过 `process.env.SHELL` 检测当前 shell 类型，提取最后一个路径段作为 shell 名称。

#### Scenario: zsh 环境
- **WHEN** `process.env.SHELL` 为 `/bin/zsh`
- **THEN** `shell` SHALL 为 `'zsh'`

#### Scenario: 无 SHELL 环境变量
- **WHEN** `process.env.SHELL` 为 undefined
- **THEN** `shell` SHALL 为 `'unknown'`

### Requirement: 工具链并发探测
系统 SHALL 并发检测常用工具链（git、pnpm、npm、yarn、docker、python3、go、cargo、brew），使用 `which` 命令（macOS/Linux）或 `where` 命令（Windows），每个检测超时 2 秒。

#### Scenario: 工具存在
- **WHEN** 系统中安装了 `git` 且可在 PATH 中找到
- **THEN** `tools` 数组 SHALL 包含 `'git'`

#### Scenario: 工具不存在
- **WHEN** 系统中未安装 `docker`
- **THEN** `tools` 数组 SHALL NOT 包含 `'docker'`

#### Scenario: 检测超时不阻塞
- **WHEN** 某个 `which` 命令超过 2 秒未返回
- **THEN** 该工具 SHALL 被视为不可用，不阻塞整体探测

### Requirement: 项目类型自动识别
系统 SHALL 根据当前工作目录下的特征文件识别项目类型：`tsconfig.json` → typescript，`package.json`（无 tsconfig）→ javascript，`go.mod` → golang，`requirements.txt` / `pyproject.toml` → python。

#### Scenario: TypeScript 项目
- **WHEN** cwd 下存在 `tsconfig.json`
- **THEN** `projectType` SHALL 为 `'typescript'`

#### Scenario: 无法识别
- **WHEN** cwd 下无任何特征文件
- **THEN** `projectType` SHALL 为 `'unknown'`

### Requirement: 包管理器检测
系统 SHALL 根据工具链探测结果和项目文件判断包管理器：优先检查 `pnpm-lock.yaml` / `.npmrc` 中 pnpm 配置，其次检查 `tools` 中是否包含 pnpm/npm/yarn。

#### Scenario: pnpm 项目
- **WHEN** cwd 下存在 `pnpm-lock.yaml`
- **THEN** `packageManager` SHALL 为 `'pnpm'`

#### Scenario: 工具链中有 pnpm 但无 lockfile
- **WHEN** `tools` 包含 `'pnpm'` 且无 lockfile
- **THEN** `packageManager` SHALL 为 `'pnpm'`

### Requirement: 探测总耗时限制
`probeEnvironment()` 整体执行时间 SHALL NOT 超过 5 秒。超时后 SHALL 返回已收集到的部分信息，不抛出异常。

#### Scenario: 部分探测超时
- **WHEN** 工具链探测总耗时超过 5 秒
- **THEN** SHALL 返回 OS/Node/Shell 等已获取的信息
- **THEN** `tools` 数组可能为空或部分填充

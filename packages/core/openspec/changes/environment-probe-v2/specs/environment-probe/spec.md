## MODIFIED Requirements

### Requirement: EnvironmentContext 数据结构
系统 SHALL 定义 `EnvironmentContext` interface，包含以下字段：`os`（platform/arch/version/displayName）、`shell`（shell 类型）、`node`（Node.js 版本）、`cpu`（model/cores）、`memory`（totalGb）、`cwd`（当前工作目录）。SHALL NOT 包含 `tools`、`packageManager`、`projectType` 字段。

#### Scenario: EnvironmentContext 完整结构
- **WHEN** 调用 `probeEnvironment()` 返回结果
- **THEN** 返回对象 SHALL 包含 `os`、`shell`、`node`、`cpu`、`memory`、`cwd` 字段
- **THEN** 返回对象 SHALL NOT 包含 `tools`、`packageManager`、`projectType` 字段

#### Scenario: os 字段内容
- **WHEN** 在 macOS arm64 上运行
- **THEN** `os.platform` SHALL 为 `'darwin'`
- **THEN** `os.arch` SHALL 为 `'arm64'`
- **THEN** `os.displayName` SHALL 为人类可读的系统名称（如 `'macOS 15.5 Sequoia'`）

#### Scenario: cpu 字段内容
- **WHEN** 系统有 10 核 Apple M4 CPU
- **THEN** `cpu.model` SHALL 为 `'Apple M4'`
- **THEN** `cpu.cores` SHALL 为 `10`

#### Scenario: memory 字段内容
- **WHEN** 系统总内存为 16 GB
- **THEN** `memory.totalGb` SHALL 为 `16`

### Requirement: 启动两阶段探测
系统 SHALL 在启动时分两个阶段探测环境信息。

#### Scenario: 阶段 1 同步探测
- **WHEN** Server 启动
- **THEN** 系统 SHALL 同步调用 `probeEnvironment()` 获取 OS/Shell/Node/CPU/Memory 信息
- **THEN** 阶段 1 执行时间 SHALL NOT 超过 10ms

#### Scenario: 阶段 2 异步探测
- **WHEN** Server 启动完成阶段 1
- **THEN** 系统 SHALL 异步启动全量 PATH 扫描
- **THEN** Agent 接受请求 SHALL NOT 被阶段 2 阻塞

## ADDED Requirements

### Requirement: 全量 PATH 扫描
系统 SHALL 读取 `process.env.PATH` 环境变量，遍历所有目录下的可执行文件，使用分类字典匹配归类，探测版本号，全量写入 SQLite `env_tools` 表。

#### Scenario: macOS/Linux PATH 解析
- **WHEN** 在 macOS/Linux 上运行
- **THEN** 系统 SHALL 使用冒号 `:` 分隔 `process.env.PATH`
- **THEN** 对每个目录下的文件，SHALL 使用 `fs.accessSync(path, fs.constants.X_OK)` 判断可执行权限

#### Scenario: Windows PATH 解析
- **WHEN** 在 Windows 上运行
- **THEN** 系统 SHALL 使用分号 `;` 分隔 `process.env.PATH` 或 `process.env.Path`
- **THEN** 对每个目录下的文件，SHALL 通过扩展名（`.exe`、`.bat`、`.cmd`、`.ps1`）判断可执行文件

#### Scenario: 分类字典匹配
- **WHEN** 扫描到可执行文件 `screencapture`
- **THEN** 系统 SHALL 通过分类字典将其归类为 `'system'` 类别（darwin 平台）

#### Scenario: 未命中分类字典
- **WHEN** 扫描到可执行文件 `my-custom-tool` 且分类字典中无匹配
- **THEN** 系统 SHALL 将其归类为 `'other'` 类别

#### Scenario: 版本号探测
- **WHEN** 扫描到已知工具 `python3`
- **THEN** 系统 SHALL 执行 `python3 --version` 探测版本号
- **THEN** 版本号 SHALL 存入 `env_tools.version` 字段

#### Scenario: 版本号探测失败
- **WHEN** 工具的 `--version` 执行失败或超时（2s）
- **THEN** `version` 字段 SHALL 存为 `null`，不阻塞整体扫描

#### Scenario: 写入 SQLite
- **WHEN** 阶段 2 扫描完成
- **THEN** 所有工具信息 SHALL 写入 `env_tools` 表
- **THEN** `scanned_at` SHALL 为当前时间戳

#### Scenario: 扫描目录数量限制
- **WHEN** PATH 中包含超过 50 个目录
- **THEN** 系统 SHALL 只扫描前 50 个目录，跳过其余

### Requirement: 跨平台分类字典
系统 SHALL 维护跨平台分类字典，包含 `common`（跨平台工具）、`darwin`（macOS 系统工具）、`linux`（Linux 系统工具）、`win32`（Windows 系统工具）四个分组。每个工具映射到一个类别（runtime、pkgManager、buildTool、container、vcs、system、other）。

#### Scenario: 分类字典包含运行时工具
- **WHEN** 系统加载分类字典
- **THEN** 字典 SHALL 包含以下 runtime 工具：node、python3、python、ruby、go、java、javac、rustc、swift、deno、bun

#### Scenario: 分类字典包含 macOS 系统工具
- **WHEN** 系统加载分类字典
- **THEN** `darwin` 分组 SHALL 包含：screencapture、pbcopy、pbpaste、open、osascript、say、diskutil、caffeinate、pmset、mdfind、lsof、launchctl

#### Scenario: 分类字典包含 Linux 系统工具
- **WHEN** 系统加载分类字典
- **THEN** `linux` 分组 SHALL 包含：xdg_open、xclip、systemctl、notify_send、scrot、journalctl、apt、dnf

#### Scenario: 分类字典包含 Windows 系统工具
- **WHEN** 系统加载分类字典
- **THEN** `win32` 分组 SHALL 包含：clip、start、powershell、tasklist、netsh

### Requirement: 人类可读 OS 名称
系统 SHALL 通过 os 模块信息生成人类可读的操作系统名称。`darwin` 平台 SHALL 映射为 `macOS`，`linux` 平台保持 `Linux`，`win32` 平台映射为 `Windows`。版本号 SHALL 附加到名称后。

#### Scenario: macOS 系统名称
- **WHEN** `os.platform()` 为 `'darwin'`，`os.release()` 为 `'24.5.0'`
- **THEN** `os.displayName` SHALL 格式为 `'macOS {version}'`（如 `'macOS 15.5'`）

#### Scenario: Linux 系统名称
- **WHEN** `os.platform()` 为 `'linux'`
- **THEN** `os.displayName` SHALL 为 `'Linux'`

#### Scenario: Windows 系统名称
- **WHEN** `os.platform()` 为 `'win32'`
- **THEN** `os.displayName` SHALL 为 `'Windows'`

## REMOVED Requirements

### Requirement: 工具链并发探测
**Reason**: 替换为全量 PATH 扫描 + SQLite 存储，不再需要写死工具列表进行 `which` 检测
**Migration**: 工具检测改由阶段 2 异步扫描 PATH 实现，结果存入 `env_tools` 表，通过 `query-environment` 工具查询

### Requirement: 项目类型自动识别
**Reason**: projectType 信息对 Agent 决策价值有限，且可通过 `query-environment` 或 Bash 工具按需获取
**Migration**: 移除 `projectType` 字段，Agent 可通过 Bash 工具检查项目特征文件

### Requirement: 包管理器检测
**Reason**: packageManager 信息改由 SQLite `env_tools` 表的 pkgManager 类别查询获取
**Migration**: Agent 通过 `query-environment({ category: "pkgManager" })` 获取可用包管理器

### Requirement: 探测总耗时限制
**Reason**: 阶段 1 同步探测耗时极短（< 1ms），阶段 2 异步执行不阻塞启动，原有的 5s 总超时不再适用
**Migration**: 阶段 2 中每个工具的版本探测保持 2s 单个超时，整体无硬性总超时

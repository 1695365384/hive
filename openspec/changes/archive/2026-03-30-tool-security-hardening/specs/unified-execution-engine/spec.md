## MODIFIED Requirements

### Requirement: grep-tool 安全实现
grep-tool SHALL 使用 Node.js 原生文件读取 + 正则匹配实现，不依赖 `child_process.exec` 或外部 `grep` 二进制，消除命令注入攻击面。

#### Scenario: grep 搜索文件内容
- **WHEN** 调用 grep-tool 传入 `pattern: "TODO"` 和 `path: "./src"`
- **THEN** 工具 SHALL 使用 `fs.readdir` + 正则匹配返回结果，不调用 shell

#### Scenario: grep 特殊字符不被注入
- **WHEN** 调用 grep-tool 传入 `pattern: '"; rm -rf /; echo "'`
- **THEN** 工具 SHALL 将 pattern 作为正则字面量处理，不执行任何 shell 命令

### Requirement: bash-tool allowlist 模式
bash-tool SHALL 支持命令 allowlist 模式，默认只允许已知安全命令前缀执行，可通过配置切换为全开放模式。

#### Scenario: allowlist 允许 git 命令
- **WHEN** 调用 bash-tool 传入 `command: "git status"`
- **THEN** 命令 SHALL 正常执行（git 在默认 allowlist 中）

#### Scenario: allowlist 拒绝未知命令
- **WHEN** 调用 bash-tool 传入 `command: "python3 -c 'import os; os.system(\"rm -rf /\")'"`
- **THEN** 命令 SHALL 被拒绝并返回安全提示

#### Scenario: allowlist 可配置
- **WHEN** 环境变量 `HIVE_BASH_ALLOWLIST` 设置为自定义命令列表
- **THEN** 工具 SHALL 使用该列表作为 allowlist

#### Scenario: 黑名单仍作为双保险
- **WHEN** allowlist 模式下执行命令
- **THEN** 危险命令黑名单检查 SHALL 仍然生效

### Requirement: runner timeout 资源清理
AgentRunner 的 `executeWithConfig` SHALL 在 `Promise.race` 完成后清理 timeout timer，防止资源泄漏。

#### Scenario: 正常完成后清理 timer
- **WHEN** runtime 调用在 timeout 之前完成
- **THEN** timeout timer SHALL 被 clearTimeout 清理

#### Scenario: 超时后正常执行
- **WHEN** runtime 调用超过 timeout
- **THEN** SHALL 正常中断并返回超时错误

### Requirement: ChatCapability 事件监听器清理
ChatCapability 的 `combineAbortSignals` SHALL 使用 `AbortSignal.any()`（Node 20+）替代手动事件监听，消除内存泄漏。

#### Scenario: 多次调用 send 不泄漏监听器
- **WHEN** ChatCapability.send() 被连续调用 100 次
- **THEN** 不应累积 100+ 个未清理的事件监听器

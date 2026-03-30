## MODIFIED Requirements

### Requirement: 统一子 Agent 执行入口
系统 SHALL 提供唯一的 Agent 执行引擎 `AgentRunner`，所有子 Agent 调用（explore、plan、general、自定义 Agent）MUST 通过 `AgentRunner.execute()` 或其便捷方法执行。系统 MUST NOT 存在其他直接调用 SDK `query()` 的执行路径。

所有高层执行方法 SHALL 使用最小化的环境变量集合传递给 SDK，MUST NOT spread 全部 `process.env`。SDK 调用 SHALL 使用 `'default'` permissionMode，MUST NOT 使用 `'bypassPermissions'`。

#### Scenario: SDK 调用使用最小化环境变量
- **WHEN** AgentRunner 构建 SDK query options
- **THEN** 环境变量对象 SHALL 仅包含 `HOME`、`PATH`、`NODE_ENV` 和当前 provider 需要的 API Key/BaseUrl
- **THEN** SHALL 不包含数据库密码、私钥等无关环境变量

#### Scenario: SDK 调用使用默认权限模式
- **WHEN** AgentRunner 构建 SDK query options
- **THEN** `permissionMode` SHALL 为 `'default'`
- **THEN** 工具调用 SHALL 需要用户确认

#### Scenario: 通过 Runner 执行 explore Agent
- **WHEN** 调用 `runner.explore(prompt, thoroughness)`
- **THEN** Runner 使用 explore Agent 配置构建 query options，调用 SDK `query()`，返回 `AgentResult`

#### Scenario: 通过 Runner 执行 general Agent
- **WHEN** 调用 `runner.general(prompt, options)`
- **THEN** Runner 使用 general Agent 配置构建 query options，调用 SDK `query()`，返回 `AgentResult`

## ADDED Requirements

### Requirement: extractJSON 单元测试覆盖
`extractJSON()` 函数 SHALL 具有完整的单元测试覆盖，包括：嵌套对象、含花括号的字符串、反引号字符串、格式错误的 JSON、空输入、多个 JSON 对象。

#### Scenario: 嵌套对象解析
- **WHEN** 输入包含嵌套 JSON 对象 `{ "a": { "b": 1 } }`
- **THEN** `extractJSON` SHALL 正确提取完整嵌套结构

#### Scenario: 字符串中的花括号
- **WHEN** 输入包含 `{ "code": "if (x > 0) { return true; }" }`
- **THEN** `extractJSON` SHALL 正确识别字符串内的花括号，不提前截断

#### Scenario: 格式错误的 JSON
- **WHEN** 输入为不完整的 JSON `{ "name": `
- **THEN** `extractJSON` SHALL 返回 `null`

#### Scenario: 空输入
- **WHEN** 输入为空字符串
- **THEN** `extractJSON` SHALL 返回 `null`

### Requirement: classifyForDispatch 单元测试覆盖
`classifyForDispatch()` 函数 SHALL 具有直接单元测试，验证 LLM 委托、结果解析和 trace 事件生成。

#### Scenario: LLM 分类成功
- **WHEN** 调用 `classifyForDispatch(task)` 且 mock `callClassifierLLM` 返回有效分类
- **THEN** SHALL 正确解析分类结果
- **THEN** SHALL 返回包含 `layer`、`confidence`、`trace` 的分类结果

#### Scenario: LLM 分类超时
- **WHEN** `callClassifierLLM` 抛出超时错误
- **THEN** SHALL 回退到 regexClassify
- **THEN** trace SHALL 记录超时事件

### Requirement: toolCallCount 准确计数
`ChatCapability.processStream()` SHALL 每个 tool call 仅递增 `toolCallCount` 一次。

#### Scenario: 单次工具调用
- **WHEN** 流式响应包含一个 `tool_use` 消息块
- **THEN** `toolCallCount` SHALL 从 0 变为 1（递增 1 次）

### Requirement: CLI debug 不暴露 API Key
`/debug` 命令 MUST NOT 输出 API Key 的任何部分（包括截断版本）。

#### Scenario: debug 输出安全
- **WHEN** 执行 `/debug` 命令且 provider 配置了 API Key
- **THEN** 输出 SHALL 包含 `hasApiKey: true` 或 `API Key: (已配置)` 格式
- **THEN** SHALL 不输出任何 API Key 字符

### Requirement: 插件路径安全校验
动态加载插件 SHALL 验证路径安全性，MUST 拒绝绝对路径和包含 `..` 的路径。

#### Scenario: 合法相对路径
- **WHEN** 插件名为 `@bundy-lmw/hive-plugin-feishu`
- **THEN** SHALL 允许加载

#### Scenario: 绝对路径被拒绝
- **WHEN** 插件名为 `/etc/malicious-plugin`
- **THEN** SHALL 拒绝加载并记录警告

#### Scenario: 路径遍历被拒绝
- **WHEN** 插件名为 `../../etc/malicious`
- **THEN** SHALL 拒绝加载并记录警告

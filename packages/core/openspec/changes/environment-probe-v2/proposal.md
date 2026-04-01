## Why

当前环境探测系统存在三个核心问题：(1) 工具检测列表写死在代码中（`TOOLS_TO_DETECT`），只覆盖 11 个开发工具，且无法感知系统自带能力（如 macOS 的 `screencapture`、`pbcopy`）；(2) `systeminformation` 依赖引入了但从未使用，是死依赖；(3) 所有探测信息全量注入 prompt，浪费 token，而 os 模块能提供的 CPU/内存等信息反而没有利用。Agent 在执行任务时仍然需要来回试探环境，违背了"零额外 turns"的设计初衷。

## What Changes

- **重写环境探测模块**：启动时分两阶段——阶段 1 用 os 模块同步获取基础信息（OS/Shell/Node/CPU/Memory）注入 prompt；阶段 2 异步全量扫描 PATH 下所有可执行文件，按类别分类、探测版本号，存入 SQLite
- **新增内置工具 `query-environment`**：Agent 按需模糊查询系统能力，支持按关键词或类别查询，返回结构化 JSON，不浪费 prompt token
- **EnvironmentContext 精简**：移除 `tools`、`packageManager`、`projectType` 字段（改由 SQLite + 内置工具按需查询），新增 `cpu`、`memory` 字段（从 os 模块获取）
- **跨平台 PATH 扫描**：支持 macOS/Linux（冒号分隔 PATH）和 Windows（分号分隔 PATH），包含平台特定的系统能力检测
- **删除 `systeminformation` 死依赖**：移除 import 和 package.json 依赖

## Capabilities

### New Capabilities
- `query-environment-tool`: 内置工具，支持按关键词模糊查询或按类别查询 SQLite 中的系统能力数据，返回工具名称、版本、路径、分类

### Modified Capabilities
- `environment-probe`: EnvironmentContext 数据结构变更（移除 tools/packageManager/projectType，新增 cpu/memory）；探测策略从写死列表 `which` 检测改为全量 PATH 扫描 + 分类字典匹配；新增异步阶段 2 探测并写入 SQLite
- `builtin-tools`: 新增 query-environment 工具定义

## Impact

- **代码**：`environment/probe.ts` 重写、`environment/types.ts` 修改、新增 `tools/built-in/query-environment.ts`、`DynamicPromptBuilder.ts` 适配、`ExecutionCapability.ts` 适配、`ServerImpl.ts` 启动流程调整
- **依赖**：移除 `systeminformation` 包
- **数据库**：新增 `env_tools` SQLite 表
- **API**：EnvironmentContext 接口 **BREAKING** 变更（移除 tools/packageManager/projectType，新增 cpu/memory）
- **测试**：environment-probe 单元测试重写、dynamic-prompt-builder 测试更新、新增 query-environment 工具测试

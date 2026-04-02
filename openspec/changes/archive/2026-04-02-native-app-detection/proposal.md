## Why

Agent 在收到"查看备忘录"这类涉及原生应用的请求时，不知道平台上有哪些原生应用可用、如何访问它们，导致盲目 glob/grep/bash 搜索 30+ 次才找到方案。根本原因有两层：
1. env_tools 表只扫描 PATH 中的可执行文件，缺少原生应用这一层抽象
2. env 工具不支持无参数调用返回概览，Agent 无法快速了解环境全貌，只能盲目尝试

## What Changes

- 新增 `native-app` 到 `ToolCategory` 类型
- 动态发现原生应用：运行时扫描平台目录（macOS: /Applications/*.app，Windows: Start Menu，Linux: .desktop files），无硬编码应用列表
- 平台级访问命令模板（macOS: `osascript -e 'tell application "AppName"'`），一个规则适用所有应用
- 集成到 `scanEnvironment()` Phase 2 异步扫描流程中
- env-tool 支持无参数调用，返回所有 category 的摘要（名称 + 工具数量），让 Agent 一步了解环境全貌
- 在 prompt 的 Environment section 添加方法论引导（~100 字符），鼓励 Agent 在执行不熟悉任务时先调 env() 了解环境

## Capabilities

### New Capabilities
- `native-app-detection`: 动态原生应用发现、注册和查询能力

### Modified Capabilities
- （无现有 spec 需要修改）

## Impact

- **Core (`packages/core/src/environment/`)**: `tool-categories.ts` 新增 category，`native-app-scanner.ts` 动态发现原生应用，`scanner.ts` 集成到 `scanEnvironment()`
- **Core (`packages/core/src/tools/built-in/env-tool.ts`)**: 新增无参数概览模式、`native-app` category 支持、输出格式调整
- **Core (`packages/core/src/agents/pipeline/DynamicPromptBuilder.ts`)**: Environment section 增加方法论引导句
- **测试**: 需要新增单元测试覆盖动态发现函数、env 概览模式、集成测试覆盖扫描流程
- **Non-goals**: 不涉及 Server/Channel/Desktop 层；不做应用的深层能力探测（只发现"存在性"）；不在 prompt 中硬编码平台特定知识或 category 列表

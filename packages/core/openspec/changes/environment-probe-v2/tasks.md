## 1. 清理与类型重构

- [x] 1.1 删除 `systeminformation` 依赖：从 `packages/core/package.json` 移除依赖，运行 `pnpm install`
- [x] 1.2 重写 `packages/core/src/environment/types.ts`：EnvironmentContext 移除 `tools`、`packageManager`、`projectType`，新增 `cpu: { model: string; cores: number }`、`memory: { totalGb: number }`，`os` 新增 `displayName: string`
- [x] 1.3 更新 `packages/core/src/environment/index.ts` 导出，确保新类型正确导出

## 2. 分类字典

- [x] 2.1 创建 `packages/core/src/environment/tool-categories.ts`：定义 `TOOL_CATEGORIES` 分类字典（common + darwin + linux + win32 四个分组），定义 `ToolCategory` 类型联合（runtime | pkgManager | buildTool | container | vcs | system | other）
- [x] 2.2 实现分类函数 `categorizeTool(name: string, platform: string): string`：先查平台特定字典，再查 common 字典，未命中返回 'other'

## 3. 环境探测模块重写

- [x] 3.1 重写 `packages/core/src/environment/probe.ts` 阶段 1：同步探测 os 模块信息（platform/arch/version/displayName、shell、node version、cpu model/cores、memory totalGb、cwd）
- [x] 3.2 实现 OS displayName 生成：darwin → macOS、linux → Linux、win32 → Windows，附版本号
- [x] 3.3 新建 `packages/core/src/environment/scanner.ts` 阶段 2：异步全量 PATH 扫描，跨平台 PATH 解析（冒号/分号分隔），可执行文件判定（X_OK / 扩展名过滤）
- [x] 3.4 实现 PATH 扫描目录数量限制（最多 50 个目录），跳过不存在的目录
- [x] 3.5 实现分类字典匹配：每个可执行文件调用 `categorizeTool()` 归类
- [x] 3.6 实现版本号探测：对已知工具（非 'other' 类别）执行 `--version`，单个超时 2s，取第一行，截断 200 字符，失败存 null
- [x] 3.7 实现 SQLite 写入：创建 `env_tools` 表（如不存在）和 `idx_env_tools_category` 索引，批量插入扫描结果
- [x] 3.8 导出 `scanEnvironment(dbPath: string): Promise<void>` 函数

## 4. 内置工具 query-environment

- [x] 4.1 创建 `packages/core/src/tools/built-in/query-environment.ts`：实现 queryEnvironment 工具，接受 `query?: string` 和 `category?: string` 参数
- [x] 4.2 实现关键词模糊查询：`SELECT * FROM env_tools WHERE name LIKE '%query%'`
- [x] 4.3 实现类别精确查询：`SELECT * FROM env_tools WHERE category = 'category'`
- [x] 4.4 实现组合查询：同时提供 query 和 category 时用 AND 条件
- [x] 4.5 实现参数校验：未提供 query 或 category 时返回错误提示
- [x] 4.6 实现空数据兜底：`env_tools` 表无数据时返回"环境探测尚未完成"提示
- [x] 4.7 在 `packages/core/src/tools/tool-registry.ts` 中注册 query-environment 工具，对所有 Agent 类型可用

## 5. 集成适配

- [x] 5.1 更新 `packages/core/src/agents/pipeline/DynamicPromptBuilder.ts`：`formatEnvironment()` 适配新 EnvironmentContext（显示 displayName、cpu、memory，移除 tools/packageManager/projectType 渲染）
- [x] 5.2 更新 `packages/core/src/agents/capabilities/ExecutionCapability.ts`：适配新 EnvironmentContext 类型
- [x] 5.3 更新 `packages/core/src/server/ServerImpl.ts`：启动阶段 1 调用 `probeEnvironment()`，阶段 2 异步调用 `scanEnvironment(dbPath)`
- [x] 5.4 更新 `apps/server/src/bootstrap.ts`：适配新的启动流程
- [x] 5.5 更新 `packages/core/src/agents/types/core.ts`：移除旧的 `tools`/`packageManager`/`projectType` 引用

## 6. 测试

- [x] 6.1 重写 `packages/core/tests/unit/environment-probe.test.ts`：测试阶段 1（OS/Shell/Node/CPU/Memory/CWD），测试 OS displayName 生成
- [x] 6.2 新建 `packages/core/tests/unit/environment-scanner.test.ts`：测试 PATH 解析（macOS/Linux/Windows）、可执行文件判定、分类字典匹配、版本号探测、SQLite 写入、目录数量限制
- [x] 6.3 新建 `packages/core/tests/unit/query-environment.test.ts`：测试关键词查询、类别查询、组合查询、参数校验、空数据兜底
- [x] 6.4 更新 `packages/core/tests/unit/dynamic-prompt-builder.test.ts`：适配新 EnvironmentContext 格式

## 7. 验证

- [x] 7.1 `pnpm --filter @bundy-lmw/hive-core build` 通过
- [x] 7.2 `pnpm test` 通过（相关测试 57/57 通过，已有失败与本次改动无关）
- [ ] 7.3 启动 server，确认 Agent system prompt 包含精简的 Environment section（无 tools 列表）
- [ ] 7.4 通过 query-environment 工具查询系统能力，确认 SQLite 数据正确

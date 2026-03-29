## Why

当前蜂群系统的 DAG 编排层（swarm/pipeline）引入了 ~2000 行复杂代码（拓扑排序、黑板、模板、聚合器），但实际使用的模板都是简单的链式/扇出结构，没有真正的菱形依赖。DAG 的核心价值——并行执行——在蜂群场景中收益有限（review+test 并行节省的时间远不及额外编排开销）。蜂群项目的核心目标是提高 Agent 的任务完成度，而完成度取决于 Agent 自身能力和上下文传递质量，不取决于编排拓扑。

删除 DAG 后，用三子 Agent（explore → plan → general）的简单顺序执行替代，保留子 Agent 协作的核心价值，大幅降低系统复杂度。

## What Changes

- **BREAKING** 删除整个 `agents/swarm/` 目录（executor、blackboard、templates、tracer、decomposer、aggregator、classifier、types）
- **BREAKING** 删除整个 `agents/pipeline/` 目录（executor、types）
- **BREAKING** 删除 `SwarmCapability.ts`
- **BREAKING** 删除 `Agent` 类的 `swarm()`、`pipeline()`、`previewSwarm()`、`registerSwarmTemplate()` 方法
- **BREAKING** 简化 `Dispatcher` 分类为 `chat` / `workflow` 二选一，删除 `swarm`/`pipeline` 分支
- 增强 `WorkflowCapability.run()`：恢复 explore → plan → execute 三阶段顺序执行
- 清理所有相关的类型导出、测试文件、API 端点

## Capabilities

### New Capabilities

（无新增 capability）

### Modified Capabilities

- `unified-execution-engine`: 删除 swarm/pipeline 执行层，简化为 chat + workflow 双层架构；增强 workflow 为三子 Agent 顺序执行

## Impact

- **代码删除**: ~2000 行（swarm ~1500 + pipeline ~400 + SwarmCapability ~150）
- **代码修改**: ~200 行（WorkflowCapability 增强、Dispatcher 简化、Agent 方法清理）
- **测试删除**: swarm/ 和 pipeline/ 下所有测试文件
- **API 变更**: 删除 swarm/pipeline 相关的 HTTP/WS 端点和 CLI 命令
- **类型变更**: 删除 SwarmResult、SwarmOptions、SwarmTemplate、PipelineResult 等类型导出

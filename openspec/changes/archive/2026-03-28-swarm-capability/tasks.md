## Phase 1: 类型定义与基础设施

- [x] 1.1 创建 `packages/core/src/agents/swarm/` 目录
- [x] 1.2 定义核心类型 `swarm/types.ts`
  - `SwarmTemplate`, `SwarmNode`, `SwarmAggregateConfig`
  - `SwarmOptions`, `SwarmResult`
  - `TraceEvent`（所有事件类型）
  - `BlackboardConfig`
  - `CyclicDependencyError` 错误类
- [x] 1.3 编写类型单元测试 `tests/unit/swarm/types.test.ts`
  - 验证 CyclicDependencyError 继承 Error
  - 验证 TraceEvent 类型约束

## Phase 2: 共享黑板

- [x] 2.1 实现 `swarm/blackboard.ts` — Blackboard 类
  - `set(key, value)` — 写入 + 重复写入检测
  - `get<T>(key)` — 类型安全读取
  - `has(key)` — 存在检查
  - `render(template)` — `{nodeId.result}` 变量替换
  - `truncate(value, maxLen)` — 长值裁剪（首 500 + 尾 500）
  - `snapshot()` — 返回 `{ length, truncated }` 摘要
  - `on(key, listener)` / `onAny(listener)` — 变化监听
  - `clear()` — 清空
- [x] 2.2 编写 Blackboard 单元测试
  - 基本读写
  - 重复写入抛错
  - render 模板变量替换（`{task}`, `{nodeId}`, `{nodeId.result}`）
  - 长值裁剪（边界：恰好 maxLen、超过 maxLen、空值）
  - 变化监听触发
  - snapshot 格式

## Phase 3: 执行追踪器

- [x] 3.1 实现 `swarm/tracer.ts` — SwarmTracer 类
  - `record(event)` — 记录事件
  - `getEvents()` — 获取全部事件（只读）
  - `getSwarmId()` — 获取执行 ID（格式 `sw-{timestamp}`）
  - `report()` — 生成树状文本报告
  - `toJSON()` — 导出 JSON
  - `getDuration()` — 总耗时计算
  - `getTokenUsage()` — 汇总所有节点的 token 使用
- [x] 3.2 编写 SwarmTracer 单元测试
  - 事件记录顺序
  - report() 格式化输出
  - getDuration() 计算
  - getTokenUsage() 汇总

## Phase 4: 内置蜂群模板

- [x] 4.1 实现 `swarm/templates.ts` — 内置模板定义
  - `add-feature` — explore+plan → implement → review+test
  - `debug` — explore → analyze → fix → verify
  - `code-review` — security+quality+test (全并行)
  - `refactor` — explore → refactor → test
  - `BUILTIN_TEMPLATES` 导出数组
- [x] 4.2 编写模板单元测试
  - 每个模板的 DAG 结构验证（依赖关系正确）
  - 拓扑排序后层级数正确
  - 所有节点的 agent 类型有效（在 AgentType 联合类型内）

## Phase 5: 模板匹配与 Prompt 渲染

- [x] 5.1 实现 `swarm/decomposer.ts`
  - `matchTemplate(task, templateName?)` — 正则匹配或指定名称
  - `buildGraph(template, blackboard)` — 从模板 + 黑板构建可执行 DAG
  - `renderNodePrompt(node, blackboard)` — 渲染节点 prompt（注入黑板值）
- [x] 5.2 编写 Decomposer 单元测试
  - matchTemplate：正常匹配、指定名称、无匹配返回 null
  - 中文任务匹配（"添加功能"、"修复 bug"、"审查代码"）
  - renderNodePrompt：变量替换、依赖结果注入、裁剪后注入

## Phase 6: DAG 执行引擎

- [x] 6.1 实现 `swarm/executor.ts` — SwarmExecutor 类
  - `topologicalSort(nodes)` — 拓扑排序，返回 `string[][]`（分层）
  - `detectCycle(nodes)` — 环检测
  - `execute(graph, blackboard, tracer, options)` — 主执行循环
    - 按层遍历
    - 同层 `Promise.allSettled` 并行
    - 单节点执行：`renderNodePrompt` → `runner.execute` → 写黑板
    - 失败节点标记 skipped
    - 依赖 skipped 节点的下游自动跳过
    - 每层完成记录黑板快照
- [x] 6.2 编写 Executor 单元测试（mock AgentRunner）
  - topologicalSort：线性链、钻石 DAG、并行层
  - detectCycle：3 节点环、自环、无环
  - execute：单层单节点、多层并行、节点失败传播、全部失败
  - 跳过依赖失败节点的下游
  - maxConcurrent 限制

## Phase 7: 结果聚合

- [x] 7.1 实现 `swarm/aggregator.ts`
  - `aggregate(config, results, blackboard)` — 主聚合函数
  - `formatSection(nodeId, text)` — 分节格式
  - `formatAppend(nodeId, text)` — 追加格式
  - 主节点失败时的 fallback 策略（找其他成功终端节点）
- [x] 7.2 编写 Aggregator 单元测试
  - primary 结果提取
  - merge append/section 格式
  - mergeFormat=summary 仅保留主结果
  - 主节点失败 fallback
  - 全部失败处理

## Phase 8: SwarmCapability 主入口

- [x] 8.1 实现 `capabilities/SwarmCapability.ts`
  - `initialize(context)` — 初始化 + 注册内置模板
  - `run(task, options?)` — 完整蜂群执行流程
    - 匹配模板 → 创建黑板/追踪器 → 构建 DAG → 执行 → 聚合 → emit hook
  - `registerTemplate(template)` — 用户自定义模板
  - `listTemplates()` — 列出所有可用模板
  - `preview(task)` — 预览匹配结果（不执行）
  - 降级逻辑：模板匹配失败 → 走现有 WorkflowCapability
- [x] 8.2 实现 `swarm/index.ts` — barrel export
- [x] 8.3 在 `agents/capabilities/index.ts` 导出 SwarmCapability
- [x] 8.4 编写 SwarmCapability 集成测试（mock AgentRunner）
  - 完整流程：task → match → execute → aggregate
  - 降级流程：无匹配 → workflow fallback
  - 自定义模板注册和使用
  - preview() 返回正确的模板信息

## Phase 9: Hook 集成与导出

- [x] 9.1 在 SwarmCapability.run() 中触发 hook 事件
  - `swarm:phase` — 阶段变化
  - `swarm:node-complete` — 节点完成
- [x] 9.2 在 `packages/core/src/agents/index.ts` 中导出蜂群相关类型
  - `SwarmCapability`, `SwarmTemplate`, `SwarmOptions`, `SwarmResult`
  - `TraceEvent`, `Blackboard`
- [x] 9.3 在主 `Agent` 类中添加 `swarm()` 便捷方法
  - `agent.swarm(task, options?)` → 委托给 SwarmCapability
- [x] 9.4 在 `packages/core/src/index.ts` 顶层导出

## Phase 10: 文档与收尾

- [ ] 10.1 更新 CLAUDE.md — 添加蜂群能力说明
- [ ] 10.2 编写使用示例（README 或注释）
- [x] 10.3 运行全量测试确保无回归
- [x] 10.4 运行 `npm run build` 确保编译通过

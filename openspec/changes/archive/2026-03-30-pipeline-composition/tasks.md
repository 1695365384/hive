## 1. 类型定义

- [x] 1.1 创建 `src/agents/pipeline/types.ts`：定义 `PipelineStage` 接口（name / templateName / templateVariant / trigger）
- [x] 1.2 定义 `TriggerCondition` 联合类型：always / onField / onNodeFail / confirm
- [x] 1.3 定义 `FieldMatchRule` 接口（field / operator / value）
- [x] 1.4 定义 `PipelineResult` 接口（stages 结果汇总）

## 2. 触发条件引擎

- [x] 2.1 创建 `src/agents/pipeline/trigger.ts`：实现 `evaluateTrigger(trigger, context)` 函数
- [x] 2.2 实现 `always` 触发：无条件返回 true
- [x] 2.3 实现 `onField` 触发：从黑板读取字段值，支持 eq / ne / gt / lt / contains 运算符
- [x] 2.4 实现 `onNodeFail` 触发：检查指定节点是否执行失败
- [x] 2.5 编写触发条件单元测试

## 3. Pipeline 执行器

- [x] 3.1 创建 `src/agents/pipeline/executor.ts`：实现 `PipelineExecutor` 类
- [x] 3.2 实现共享 Blackboard 创建和传递
- [x] 3.3 实现阶段前缀机制：节点 ID 在黑板中存储为 `stageName.nodeId`
- [x] 3.4 实现阶段顺序执行循环：评估触发条件 → 执行或跳过
- [x] 3.5 实现 `confirm` 触发：暂停执行，通过回调通知宿主应用，等待用户确认/拒绝
- [x] 3.6 实现空 Pipeline 处理：返回空结果

## 4. Pipeline Tracer

- [x] 4.1 新增 Pipeline 级别 tracer 事件：`stage.start` / `stage.complete` / `stage.skipped`
- [x] 4.2 每个 stage 事件包含 `{ stageName, template, variant, duration }`
- [x] 4.3 实现 `tracer.report()` 按阶段分层显示，每个阶段内显示节点详情
- [x] 4.4 编写 Pipeline tracer 单元测试

## 5. Agent 集成

- [x] 5.1 在 `Agent.ts` 中新增 `pipeline()` 方法
- [x] 5.2 创建 `src/agents/pipeline/index.ts` 导出所有 Pipeline 类型
- [x] 5.3 在 `src/agents/index.ts` 中导出 Pipeline 模块
- [x] 5.4 在 `src/index.ts` 顶层导出 Pipeline 相关类型

## 6. 测试

- [x] 6.1 编写两阶段 Pipeline 集成测试：scan → fix，验证黑板共享
- [x] 6.2 编写条件触发测试：onField 匹配/不匹配、onNodeFail、always
- [x] 6.3 编写阶段前缀测试：同名节点在不同阶段不冲突
- [x] 6.4 编写 confirm 触发测试：暂停、恢复、拒绝跳过
- [x] 6.5 编写空 Pipeline 测试

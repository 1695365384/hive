## 1. 类型定义

- [x] 1.1 在 `src/agents/swarm/types.ts` 中新增 `TaskClassification` 接口（type / complexity / confidence）
- [x] 1.2 在 `SwarmTemplate` 接口中新增可选 `variant` 字段（`'simple' | 'medium' | 'complex'`，默认 `'medium'`）
- [x] 1.3 在 `SwarmOptions` 中新增 `classify?: boolean`（默认 `true`）

## 2. 分类器实现

- [x] 2.1 创建 `src/agents/swarm/classifier.ts`：实现 `classify(task: string)` 函数，使用 Haiku + JSON Schema 结构化输出
- [x] 2.2 编写分类 prompt：描述 5 种任务类型和 3 种复杂度的判断标准
- [x] 2.3 实现低置信度 fallback（confidence < 0.5 时记录 tracer 事件）

## 3. 模板匹配改造

- [x] 3.1 修改 `matchTemplate()` 函数：支持 `variant` 参数，先按 name+regex 匹配模板族，再按 variant 选择变体
- [x] 3.2 实现 variant fallback 逻辑：找不到精确变体时 fallback 到 `medium`
- [x] 3.3 fallback 时记录 `template.variant-fallback` tracer 事件

## 4. SwarmCapability 集成

- [x] 4.1 修改 `SwarmCapability.run()` 流程：在 `matchTemplate` 之前插入 `classify` 步骤
- [x] 4.2 支持 `classify: false` 选项跳过分类，直接走正则匹配
- [x] 4.3 分类结果传递给 `matchTemplate` 作为 variant 选择依据

## 5. 内置模板变体

- [x] 5.1 创建 `debug-simple` 变体（2 节点：explore → fix）
- [x] 5.2 创建 `code-review-simple` 变体（2 节点：explore → review）
- [x] 5.3 为现有模板标记 `variant: 'medium'`
- [x] 5.4 创建 `debug-complex` 变体（5 节点：explore → analyze → plan → fix → verify）
- [x] 5.5 创建 `add-feature-complex` 变体（6 节点：explore + plan → implement → security-audit → review → test）

## 6. Tracer 事件扩展

- [x] 6.1 新增 `classifier.complete` 事件类型，包含 `{ type, complexity, confidence, model, latency }`
- [x] 6.2 新增 `classifier.low-confidence` 事件类型
- [x] 6.3 新增 `template.variant-fallback` 事件类型
- [x] 6.4 修改 `tracer.report()` 显示分类结果信息

## 7. 测试

- [x] 7.1 编写 classifier 单元测试：正常分类、低置信度、跳过分类
- [x] 7.2 编写 variant 匹配单元测试：精确匹配、fallback、无 variant 默认 medium
- [x] 7.3 编写模板变体集成测试：验证各变体 DAG 结构正确
- [x] 7.4 编写 tracer 事件测试：验证分类和 fallback 事件正确记录

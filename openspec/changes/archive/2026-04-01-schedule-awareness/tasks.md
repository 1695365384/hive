## 1. Prompt 模板

- [x] 1.1 创建 `templates/schedule-awareness.md` — 声明定时任务能力（创建/查询/暂停/恢复/删除）、三种调度模式、触发条件、确认流程
- [x] 1.2 在 DynamicPromptBuilder 中新增 `schedule` section 构建逻辑，加载 schedule-awareness 模板 + 嵌入 scheduleSummary
- [x] 1.3 设置 schedule section 的 token budget 优先级为 4（与 skill 同级）

## 2. 数据注入

- [x] 2.1 在 `PromptBuildContext` 类型中新增可选字段 `scheduleSummary?: string`
- [x] 2.2 在 ChatCapability 构建 PromptBuildContext 时查询 ScheduleRepository，格式化已有任务摘要并填入 scheduleSummary
- [x] 2.3 在 WorkflowCapability 的 buildSystemPrompt 中同样注入 scheduleSummary

## 3. 测试

- [x] 3.1 单元测试：DynamicPromptBuilder 在有 scheduleSummary 时正确注入 schedule section
- [x] 3.2 单元测试：DynamicPromptBuilder 在无 scheduleSummary 时仍注入能力声明
- [x] 3.3 单元测试：token budget 不足时 schedule section 被正确裁剪
- [x] 3.4 单元测试：ChatCapability 构建 context 时正确查询并格式化任务摘要

## Context

当前蜂群系统使用正则匹配选择模板（`SwarmTemplate.match: RegExp`），匹配结果直接决定 DAG 结构。这种静态匹配无法区分任务复杂度——"修个 typo"和"重构整个认证系统"都匹配到 debug 或 refactor 模板。

现有架构：
- `SwarmCapability.run()` → `matchTemplate()` → `buildGraph()` → `execute()` → `aggregate()`
- `matchTemplate()` 纯正则匹配，返回 `SwarmTemplate | null`
- DAG 执行引擎完全确定性，不涉及任何动态决策

约束：DAG 执行层必须保持确定性（可追踪、可复现、非黑盒），这是蜂群的核心卖点。

## Goals / Non-Goals

**Goals:**
- 让系统根据任务复杂度选择合适的模板变体（simple / medium / complex）
- 分类过程可追踪（写入 Tracer）
- 现有模板完全向后兼容（不填 variant 默认 medium）
- 分类成本极低（< 200 tokens，使用 Haiku）

**Non-Goals:**
- 不在 DAG 执行层引入条件分支
- 不做动态节点生成
- 不用 LLM 做 DAG 内部的运行时决策

## Decisions

### D1: 分类器用结构化输出，不用自由文本

**选择**: Haiku + JSON Schema 约束输出
**替代方案**: 自由文本分类（容易解析失败）；嵌入式分类（需要训练数据）

分类器输出格式：
```typescript
interface TaskClassification {
  type: 'add-feature' | 'debug' | 'code-review' | 'refactor' | 'general';
  complexity: 'simple' | 'medium' | 'complex';
  confidence: number;  // 0-1
}
```

**理由**: JSON Schema 保证解析可靠，Haiku 的工具调用能力天然支持结构化输出。

### D2: 模板变体通过 variant 字段区分

**选择**: `SwarmTemplate` 新增可选 `variant` 字段（`'simple' | 'medium' | 'complex'`）
**替代方案**: 每个变体创建独立模板（膨胀且难维护）

```typescript
interface SwarmTemplate {
  name: string;
  variant?: 'simple' | 'medium' | 'complex';  // 新增，默认 'medium'
  match: RegExp;
  nodes: Record<string, SwarmNode>;
  aggregate: SwarmAggregateConfig;
}
```

匹配逻辑：先按 name+regex 匹配模板族，再按 variant 选择变体。找不到精确变体时 fallback 到 medium。

### D3: 分类器集成在 SwarmCapability.run() 中，不在外部

**选择**: 在 `matchTemplate` 之前插入分类步骤
**替代方案**: 独立的 ClassifierService（过度工程化）

流程：
```
run(task)
  → classify(task)           // Haiku 分类，~100ms
  → matchTemplate(task, variant)  // 正则 + variant 选择
  → buildGraph() / execute() / aggregate()
```

### D4: 分类器可配置，支持跳过

**选择**: `SwarmOptions` 新增 `classify?: boolean`（默认 true）
**替代方案**: 强制每次都分类

用户可以设 `classify: false` 跳过分类，直接走正则匹配。这对测试和已知场景有性能优势。

### D5: 分类结果写入 Tracer

**选择**: 新增 `classifier.complete` 事件，包含 classification 完整数据
**替代方案**: 不记录分类结果

## Risks / Trade-offs

| 风险 | 缓解 |
|------|------|
| Haiku 分类错误导致选错变体 | medium 是最安全的默认；用户可 `classify: false` 跳过 |
| 增加一次 LLM 调用的延迟（~100-300ms） | Haiku 速度极快；可跳过分类；相比多执行 2-3 个无用节点节省的时间远超分类开销 |
| 变体数量膨胀（4 模板 × 3 变体 = 12 个） | 变体间大量共享节点配置；实际新增约 4 个简化模板 |
| 分类 prompt 需要随模板更新维护 | 分类 prompt 只描述复杂度判断标准，不列举具体模板名，维护成本低 |

## Open Questions

- 分类 prompt 是否需要支持用户自定义？（初期不需要，后续可作为扩展）

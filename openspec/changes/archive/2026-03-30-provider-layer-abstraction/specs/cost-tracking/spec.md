## MODIFIED Requirements

### Requirement: LLMRuntime 运行结果

`RuntimeResult` SHALL 包含模型规格信息，供调用方进行资源管理和费用预估。

```typescript
interface RuntimeResult {
  text: string
  tools: string[]
  usage?: { input: number; output: number }
  cost?: { input: number; output: number; total: number }
  modelSpec?: {
    contextWindow: number
    maxOutputTokens: number
    supportsTools: boolean
  }
}
```

#### Scenario: 运行完成后附带 modelSpec
- **WHEN** `LLMRuntime.run()` 成功完成
- **AND** `ProviderManager` 能获取到当前模型的 ModelSpec
- **THEN** `RuntimeResult.modelSpec` SHALL 包含 `contextWindow`、`maxOutputTokens`、`supportsTools`

#### Scenario: ModelSpec 不可用时的降级
- **WHEN** `ProviderManager` 无法获取 ModelSpec（如 models.dev 不可用）
- **THEN** `RuntimeResult.modelSpec` SHALL 为 `undefined`
- **AND** 运行正常完成，不受影响

#### Scenario: 向后兼容
- **WHEN** 现有代码访问 `RuntimeResult` 的 `text`、`tools`、`usage` 字段
- **THEN** 行为不变，`modelSpec` 为可选字段

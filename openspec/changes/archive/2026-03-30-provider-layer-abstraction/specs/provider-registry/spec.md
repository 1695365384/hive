## ADDED Requirements

### Requirement: Provider Registry 自动补全配置

系统 SHALL 通过 models.dev 动态获取 Provider 信息（baseUrl、type、envKeys、defaultModel），在用户配置缺失时自动补全。

`ProviderManager` 加载外部配置时，对每个 `ProviderConfig` 执行补全：
1. `baseUrl` 缺失 → 从 models.dev `ProviderInfo.baseUrl` 获取
2. `type` 缺失 → 从 models.dev `ProviderInfo.type` 获取
3. `apiKey` 缺失 → 从 models.dev `ProviderInfo.envKeys` 读取环境变量
4. `model` 缺失 → 从 models.dev `ProviderInfo.defaultModel` 获取

models.dev 不可用时，回退到 `STATIC_PROVIDERS` 静态数据。

#### Scenario: ProviderManager 根据 id 自动补全配置
- **WHEN** 用户配置 Provider 时仅提供 `id`、`apiKey`、`model`
- **AND** 配置中未指定 `baseUrl`
- **THEN** `ProviderManager` SHALL 从 models.dev 缓存查询该 `id` 对应的 `ProviderInfo`
- **AND** 用 `ProviderInfo` 中的 `baseUrl`、`type` 等字段补全缺失配置

#### Scenario: models.dev 中不存在的 id
- **WHEN** 用户配置的 `id` 在 models.dev 缓存和 `STATIC_PROVIDERS` 中均不存在
- **AND** 用户未提供 `baseUrl`
- **THEN** 系统 SHALL 报错提示用户需要手动提供 `baseUrl`

#### Scenario: 用户显式配置优先于 Registry
- **WHEN** 用户配置中显式提供了 `baseUrl` 或 `type`
- **THEN** 用户提供的值 SHALL 优先于 models.dev 中的值

### Requirement: 用户配置简化为 4 个字段

用户配置 Provider 时，SHALL 仅需提供 4 个字段：`name`、`id`、`apiKey`、`model`。

```json
{
  "provider": {
    "name": "智谱 GLM",
    "id": "glm-coding",
    "apiKey": "...",
    "model": "glm-5"
  }
}
```

`baseUrl`、`type` 等实现细节由系统内部从 `id` 自动解析，用户无需关心。

#### Scenario: 最小配置即可使用
- **WHEN** 用户仅提供 `name`、`id`、`apiKey`、`model`
- **AND** `id` 在 models.dev 中存在
- **THEN** 系统 SHALL 正常创建 Provider，无需用户了解 baseUrl 或 type

#### Scenario: 环境变量 fallback
- **WHEN** 用户配置中未提供 `apiKey`
- **AND** models.dev 中该 Provider 的 `envKeys` 包含 `GLM_API_KEY`
- **THEN** 系统 SHALL 从环境变量 `GLM_API_KEY` 获取 apiKey

#### Scenario: 用户配置的 apiKey 优先于环境变量
- **WHEN** 用户在配置中显式提供了 `apiKey`
- **THEN** 用户提供的 apiKey SHALL 优先于环境变量 fallback

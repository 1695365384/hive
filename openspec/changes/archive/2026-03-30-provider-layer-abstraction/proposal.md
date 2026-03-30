## Why

用户配置 Provider 时需要知道 baseUrl 等实现细节，不够抽象。当前 `hive.config.json` 的 provider 配置：

```json
{
  "provider": {
    "id": "glm",
    "apiKey": "...",
    "model": "glm-5",
    "baseUrl": "https://open.bigmodel.cn/api/paas/v4"  // ← 用户不该关心这个
  }
}
```

**用户只应该关心 4 个字段**：`name`（可读名称）、`id`（选择哪个 provider）、`apiKey`（凭证）、`model`（模型）。baseUrl、adapter type 等全部由系统内部从 models.dev 的 `ProviderInfo` 自动解析。

此外，ModelSpec 数据（contextWindow、maxOutputTokens）虽然被 `ProviderManager` 从 models.dev 获取并缓存，但从未传递给 `LLMRuntime` 和 `CompressionService`，导致压缩阈值硬编码为 200000。

## What Changes

### A. Provider 简化配置 + models.dev 自动补全

用户配置简化为 4 个字段：

```json
{
  "provider": {
    "name": "智谱 GLM",
    "id": "glm",
    "apiKey": "...",
    "model": "glm-5"
  }
}
```

`ProviderManager` 加载配置时，从 models.dev 的 `ProviderInfo`（已通过 `ProviderRegistryImpl` 缓存）自动补全 `baseUrl`、`type`、`envKeys`、`defaultModel`。models.dev 不可用时回退到 `STATIC_PROVIDERS` 静态数据。

### B. ModelSpec 数据流贯通

- `LLMRuntime.run()` 返回值新增 `modelSpec: { contextWindow, maxOutputTokens, supportsTools }`
- `CompressionService` 构造时接受 `contextWindowSize` 参数，从 modelSpec 动态获取，不再硬编码

## Capabilities

### New Capabilities

- `provider-registry`: 复用 models.dev `ProviderInfo` 自动补全 Provider 配置。`ProviderManager` 根据 `id` 从 models.dev 缓存解析 baseUrl / type / envKeys / defaultModel。用户配置只需 `name`、`id`、`apiKey`、`model`。

### Modified Capabilities

- `cost-tracking`: `LLMRuntime.run()` 返回值新增 `modelSpec` 字段，包含 contextWindow、maxOutputTokens、supportsTools

## Impact

- `ProviderConfig` 简化：`baseUrl` 变为可选，缺失时从 models.dev 查询补全
- `hive.config.json` 的 provider 配置从 5+ 字段简化为 4 个必填字段
- **Breaking**: `CompressionService` 构造函数要求传入 contextWindowSize（默认值从硬编码 200000 改为动态获取）
- `ProviderManager` 新增 `getModelWithSpec()` 异步方法，返回 `{ model, spec }` 元组
- `LLMRuntime` 的 `RuntimeResult` 类型新增可选 `modelSpec` 字段

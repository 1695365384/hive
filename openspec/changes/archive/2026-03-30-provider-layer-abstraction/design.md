## Context

当前用户配置 provider 需要 `id`、`apiKey`、`model`、`baseUrl`（+ 可能还有 `type`）。`baseUrl` 是实现细节，用户不应该需要知道。

Provider 系统内部已有：
- `PROVIDER_TYPE_MAP` — provider ID → adapter type 的映射
- `STATIC_PROVIDERS` — models.dev 不可用时的 fallback 数据（包含 baseUrl、type、envKeys）
- `models.dev` — 动态加载 Provider 信息和 ModelSpec

`ProviderRegistryImpl` 已从 models.dev 动态加载 `ProviderInfo`（含 baseUrl、type、envKeys、defaultModel），但从未用于用户配置补全。用户填 `id: "glm"` 时，系统应该自动从 models.dev 缓存中补全 baseUrl。

`LLMRuntime` 返回的 `RuntimeResult` 不含 `modelSpec`，`CompressionService` 硬编码 `contextWindowSize: 200000`。

## Goals / Non-Goals

**Goals:**
- 用户配置简化为 4 个字段：`name`、`id`、`apiKey`、`model`
- 复用 models.dev `ProviderInfo`，`id` 自动解析 baseUrl/type/defaultModel/apiKey
- `RuntimeResult` 附带 `modelSpec`
- `CompressionService` 动态获取 contextWindowSize

**Non-Goals:**
- 不改 `LanguageModelV3` 类型
- 不做 provider 发现/自动检测（依赖 models.dev 已有数据）
- 不做 Vendor 层级抽象（简化为纯粹的 id → config 查找）
- 不改 `LLMRuntime.run()` 签名

## Decisions

### D1: 复用 models.dev ProviderInfo 做配置补全

**选择**: `ProviderManager` 加载外部配置时，调用 `getProviderInfoSync(id)` 获取 `ProviderInfo`，从中补全 `baseUrl`、`type`、`envKeys`、`defaultModel`。

```
用户配置: { id: "glm", apiKey: "...", model: "glm-5" }
                                ↓
ProviderManager.resolveFromRegistry():
  1. getProviderInfoSync("glm") → { baseUrl: "...", type: "openai-compatible", envKeys: ["GLM_API_KEY"] }
  2. 补全: config.baseUrl = info.baseUrl, config.type = info.type
  3. apiKey fallback: 从 info.envKeys 读取环境变量
  4. register(mergedConfig)
```

**理由**: 零新增数据源。models.dev 的 `ProviderInfo` 已包含所有需要的字段（baseUrl、type、envKeys、defaultModel），`ProviderRegistryImpl` 已有缓存机制和 `STATIC_PROVIDERS` fallback。只需在 `ProviderManager` 中加一个 `resolveFromRegistry()` 方法。

### D2: ProviderConfig 简化

**选择**: `baseUrl` 变为可选。`ProviderManager.loadExternalConfig()` 在 `baseUrl` 缺失时从 models.dev 查询补全。

### D3: modelSpec 附带到 RuntimeResult

`ProviderManager` 新增 `getModelWithSpec()` 异步方法，返回 `{ model, spec }`。`LLMRuntime.run()` 调用它并将 spec 附带到 `RuntimeResult.modelSpec`。原有 `getModel()` 保持不变（向后兼容）。

### D4: CompressionService 动态 contextWindowSize

`SessionCapabilityConfig` 新增 `contextWindowSize` 字段。Agent 初始化时传入模型的 contextWindow，经 `SessionManager` → `CompressionService` 使用。

## Risks / Trade-offs

- **自定义 provider** — 用户如果想用 models.dev 中没有的 provider，仍需手动填 `baseUrl`。这是合理的行为
- **models.dev 不可用** — 已有 `STATIC_PROVIDERS` fallback，常见 Provider（deepseek、glm、qwen 等）均有静态数据
- **`getModelWithSpec()` 异步** — 影响范围可控，只有 LLMRuntime 调用。原有 `getModel()` 同步方法保持不变

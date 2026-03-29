## Why

当前 Provider 系统存在三个核心问题：

**1. 无法表达同一厂商的不同产品线**

智谱 AI (GLM) 提供了四种不同的 API 入口：

| Provider ID | Base URL | 协议 | 用途 |
|-------------|----------|------|------|
| `glm` | `open.bigmodel.cn/api/paas/v4` | OpenAI-compatible | 通用 API（对话、视觉） |
| `glm-coding` | `open.bigmodel.cn/api/coding/paas/v4` | OpenAI-compatible | 代码套餐国内版 |
| `glm-coding-intl` | `api.z.ai/api/coding/paas/v4` | OpenAI-compatible | 代码套餐国际版 |
| `glm-anthropic` | `open.bigmodel.cn/api/anthropic` | Anthropic | 代码套餐 Anthropic 协议 |

目前只有一个 `glm` provider ID，无法区分这些产品线。用户需要手动修改 `baseUrl` 才能切换，且 `preprocessParams` 中的 GLM 特殊处理（移除 `reasoning_effort`）可能不适用于所有产品线。

**2. Provider 抽象层缺失**

- `PROVIDER_TYPE_MAP` 在 `adapters/index.ts` 里硬编码，新增 provider ID 需要修改两处（map + registry）
- `preprocessParams` 用 switch-case 硬编码每个 provider 的特殊逻辑
- 没有 vendor → variant 的层级关系，同一厂商的不同产品线无法共享配置（如 API Key）
- `ProviderConfig` 同时承载身份标识和运行时配置，职责不清

**3. ModelSpec 数据没有实际应用到运行时**

`models.dev` 返回的 `ModelSpec`（contextWindow、maxOutputTokens、supportsTools 等）虽然被 `ProviderManager` 获取并缓存，但从未传递给 `LLMRuntime`：

- `LLMRuntime.run()` 只调用 `providerManager.getModel()` 获取 `LanguageModelV3`，没有 `contextWindow` / `maxOutputTokens`
- `CompressionService` 使用硬编码的 `contextWindowSize: 200000`（写死为 Claude 的上下文窗口），而非从当前模型动态获取
- 当用户使用 GLM（128K 上下文）或 DeepSeek（64K 上下文）时，压缩阈值计算完全错误

## What Changes

### A. Provider 层抽象重构

引入 **Vendor** 和 **Provider Variant** 两级概念：

```
Vendor（厂商）
├── 共享：apiKey、envKeys、npmPackage
└── Variants（产品线）
    ├── glm          → 通用 API (open.bigmodel.cn/api/paas/v4)
    ├── glm-coding   → 代码套餐国内版
    ├── glm-coding-intl → 代码套餐国际版 (api.z.ai/api/coding/paas/v4)
    └── glm-anthropic → 代码套餐 Anthropic 协议
```

- 新增 `ProviderDefinition` 类型：声明 vendor 信息、variants 列表、每个 variant 的 baseUrl / type / defaultModel / preprocessRules
- `ProviderRegistry` 支持 `registerDefinition(definition)` 批量注册一个厂商的所有 variant
- `preprocessParams` 从 switch-case 改为声明式规则，每个 variant 可以定义自己的参数预处理
- `ProviderConfig` 新增可选 `vendorId` 字段，同 vendor 的 variant 共享 API Key

### B. ModelSpec 数据流贯通

将 `ModelSpec` 的关键指标传递到实际使用处：

- `LLMRuntime.run()` 返回值新增 `modelSpec: { contextWindow, maxOutputTokens, supportsTools }`
- `RuntimeConfig` 新增可选 `modelSpec` 字段，调用方可将 spec 传入供 LLM 运行时参考
- `CompressionService` 构造时接受 `contextWindowSize` 参数，不再依赖硬编码默认值
- `Agent` 初始化时从 `ProviderManager.getContextWindow()` 获取当前模型的上下文窗口，传入 `CompressionService`

### C. 智谱 GLM 多 Provider ID 注册

基于新的 Provider Definition，注册 GLM 的四个 variant：

```
glm              → open.bigmodel.cn/api/paas/v4        (OpenAI-compatible)
glm-coding       → open.bigmodel.cn/api/coding/paas/v4 (OpenAI-compatible)
glm-coding-intl  → api.z.ai/api/coding/paas/v4        (OpenAI-compatible)
glm-anthropic    → open.bigmodel.cn/api/anthropic       (Anthropic)
```

所有 variant 共享 `GLM_API_KEY` 环境变量。

> 注：硬编码清理（PROVIDER_TYPE_MAP、preprocessParams switch-case、getKnownProvidersSync、contextWindowSize 硬编码等）已拆到独立的 `dead-code-cleanup` change 中先期执行。

## Capabilities

### New Capabilities

- `provider-vendor`: 引入 Vendor（厂商）和 Provider Variant（产品线）两级抽象。`ProviderDefinition` 声明厂商的共享信息（apiKey、envKeys）和 variants 列表。ProviderRegistry 支持按厂商批量注册和管理。同 vendor 的 variant 自动共享 API Key。

### Modified Capabilities

- `env-fallback`: 环境变量预设从单一 provider ID 扩展为支持 vendor + variant。`GLM_API_KEY` 环境变量同时为 `glm`、`glm-coding`、`glm-coding-intl`、`glm-anthropic` 提供 apiKey。静态 fallback 数据同步更新。
- `cost-tracking`: `LLMRuntime.run()` 返回值新增 `modelSpec` 字段，包含 contextWindow、maxOutputTokens、supportsTools。调用方可据此进行费用预估和资源管理。

## Impact

- **依赖**: 需要先完成 `dead-code-cleanup` change（清理硬编码和死代码后，新抽象才能在干净基础上构建）
- **Breaking**: `STATIC_PROVIDERS` 中 `glm` 条目扩展为 4 个 variant
- **Breaking**: `CompressionService` 构造函数要求传入 contextWindowSize（默认值从硬编码 200000 改为动态获取）
- `ProviderManager` 的 `getModel()` 返回类型不变（仍为 `LanguageModelV3`），但内部增加了 ModelSpec 获取逻辑
- `LLMRuntime` 的 `RuntimeConfig` 和 `RuntimeResult` 类型新增可选字段
- 配置文件 `hive.config.json` 的 `provider.id` 现在支持 4 种 GLM variant

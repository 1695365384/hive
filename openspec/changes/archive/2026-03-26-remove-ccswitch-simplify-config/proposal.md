## Why

CC-Switch 作为外部依赖增加了用户的使用门槛，且其配置管理功能与 SDK 的定位不符。SDK 应该是一个纯粹的消费者，配置由外部应用传入，而不是自己去管理配置来源。简化配置系统可以让 SDK 更轻量、更易集成。

## What Changes

- **BREAKING** 移除 CC-Switch 依赖和相关代码
- **BREAKING** 移除本地配置文件自动加载（`providers.json` 自动发现）
- 配置改为完全由外部传入，通过构造函数参数
- 新增 JSON Schema 定义，供外部应用参考
- 保留环境变量作为 fallback（零配置场景）
- 导出配置类型和 Schema，方便外部应用使用

## Capabilities

### New Capabilities

- `external-config`: 外部配置传入机制，支持 JSON Schema 验证
- `env-fallback`: 环境变量 fallback 配置，支持约定式环境变量名

### Modified Capabilities

无现有 spec 需要修改。这是新增能力。

## Impact

### 代码变更

| 文件 | 变更 |
|:-----|:-----|
| `sources/cc-switch.ts` | 删除 |
| `sources/local-config.ts` | 删除 |
| `sources/index.ts` | 简化为只有 EnvSource |
| `ProviderManager.ts` | 改为从构造函数接收配置 |
| `ProviderCapability.ts` | 移除 `isCCSwitchInstalled()` |
| `types.ts` | 新增 `ExternalConfig` 类型 |
| 新增 `schemas/` | JSON Schema 文件 |

### API 变更

```typescript
// 旧 API（自动加载配置）
const agent = new Agent(); // 自动从 CC-Switch/providers.json 加载

// 新 API（外部传入配置）
const agent = new Agent({
  providers: [
    { id: 'glm', baseUrl: '...', apiKey: '...' },
  ],
  activeProvider: 'glm',
});
```

### 依赖变更

- 移除 `cc-switch` peerDependency
- 移除 `better-sqlite3` 运行时依赖（CC-Switch 使用）

### 向后兼容

- 环境变量模式保持兼容（`GLM_API_KEY` 等）
- `providers.json` 不再自动加载，但可通过代码手动传入

## Context

当前 SDK 的配置系统过于复杂，支持多个配置来源（CC-Switch SQLite、本地 JSON 文件、环境变量），并按优先级自动合并。这种设计虽然灵活，但增加了维护成本和用户理解难度。

**当前架构**:
```
ConfigSource Chain:
  1. CCSwitchSource (SQLite) → 移除
  2. LocalConfigSource (providers.json) → 移除自动发现
  3. EnvSource → 保留
```

**目标架构**:
```
配置来源:
  1. 外部传入 (构造函数) → 主要方式
  2. 环境变量 → fallback
```

## Goals / Non-Goals

**Goals:**
- 配置完全由外部应用控制，SDK 只是消费者
- 提供 JSON Schema 供外部应用参考
- 保持环境变量 fallback 用于零配置场景
- 简化代码，减少维护负担

**Non-Goals:**
- 不提供配置 GUI
- 不自动发现本地配置文件
- 不兼容 CC-Switch 数据库格式

## Decisions

### D1: 配置传入方式

**决定**: 通过 Agent 构造函数传入配置对象

**替代方案**:
1. ❌ 保持现有 ConfigSource 接口 - 过度设计
2. ❌ 只支持环境变量 - 不够灵活，无法配置多 Provider
3. ✅ 构造函数传入 - 简单直接，外部完全控制

**理由**:
- 外部应用通常有自己的配置管理（环境变量、配置中心等）
- SDK 不应该假设配置从哪里来

### D2: JSON Schema 位置

**决定**: Schema 文件放在 `src/schemas/` 目录，构建时复制到 `dist/schemas/`

**结构**:
```
src/schemas/
├── agent-config.json      # 顶层配置 Schema
├── provider-config.json   # Provider 配置 Schema
├── mcp-server-config.json # MCP 服务器 Schema
└── index.ts               # 导出 Schema URL 和类型
```

### D3: 环境变量约定

**决定**: 使用 `${PROVIDER_ID}_API_KEY` 约定

**示例**:
- `GLM_API_KEY` → Provider ID: `glm`
- `DEEPSEEK_API_KEY` → Provider ID: `deepseek`
- `ANTHROPIC_API_KEY` → Provider ID: `anthropic`

**baseUrl 推断**:
- 内置常见 Provider 的 baseUrl
- 未知 Provider 需要显式配置

### D4: 向后兼容策略

**决定**: 不做向后兼容，直接 breaking change

**理由**:
- SDK 还在早期阶段，用户量有限
- 迁移成本低（只需改初始化代码）
- 保持代码简洁

## Risks / Trade-offs

| 风险 | 影响 | 缓解措施 |
|:-----|:-----|:---------|
| 破坏现有用户代码 | High | 文档明确迁移指南 |
| 环境变量名冲突 | Low | 使用 Provider ID 作为前缀 |
| 外部应用不知道如何配置 | Medium | 提供完整 JSON Schema 和示例 |

## Migration Plan

### 用户迁移步骤

1. 移除 `cc-switch` 依赖（如有）
2. 修改 Agent 初始化代码：
   ```typescript
   // 旧代码
   const agent = new Agent();

   // 新代码
   const agent = new Agent({
     providers: [
       { id: 'glm', baseUrl: '...', apiKey: process.env.GLM_API_KEY },
     ],
   });
   ```
3. 或使用环境变量模式（无需改动，但需确保环境变量已设置）

### 回滚策略

如需回滚，用户可：
1. 锁定到上一个版本
2. 暂时使用环境变量模式

## Open Questions

1. ~~是否需要支持异步加载配置？~~ → 暂不需要，同步传入即可
2. ~~Schema 是否需要版本控制？~~ → 跟随 SDK 版本

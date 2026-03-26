# Migration Guide: v1.x to v2.0

This guide helps you migrate from the CC-Switch based configuration to the new simplified external configuration system.

## Breaking Changes

### 1. Agent Constructor Signature Changed

**Before (v1.x):**
```typescript
const agent = new Agent(
  skillConfig,      // SkillSystemConfig
  sessionConfig,    // SessionCapabilityConfig
  workspaceConfig,  // WorkspaceInitConfig | string
  timeoutConfig     // TimeoutConfig
);
```

**After (v2.0):**
```typescript
const agent = new Agent({
  externalConfig,   // ExternalConfig - external configuration
  skillConfig,      // SkillSystemConfig
  sessionConfig,    // SessionCapabilityConfig
  workspace,        // WorkspaceInitConfig | string
  timeout,          // TimeoutConfig
});
```

### 2. CC-Switch Removed

- `isCCSwitchInstalled()` method removed from Agent and ProviderCapability
- CC-Switch is no longer a peer dependency
- Configuration must be passed externally or via environment variables

### 3. Configuration Sources Simplified

- Only `EnvSource` is used for auto-detection
- Local config file auto-discovery removed
- External configuration takes highest priority

## Migration Steps

### Step 1: Update Agent Creation

If you were using positional parameters:

```typescript
// Before
const agent = createAgent(
  { skillsDir: './skills' },
  { enableCompression: true },
  './workspace'
);

// After
const agent = createAgent({
  skillConfig: { skillsDir: './skills' },
  sessionConfig: { enableCompression: true },
  workspace: './workspace'
});
```

### Step 2: Use External Configuration

Instead of relying on CC-Switch, pass configuration explicitly:

```typescript
import { createAgent, type ExternalConfig } from '@hive/core';

const config: ExternalConfig = {
  providers: [
    {
      id: 'glm',
      name: 'GLM (智谱)',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      apiKey: 'your-api-key',  // or use apiKeyEnv
      model: 'glm-5',
    },
    {
      id: 'deepseek',
      name: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com',
      apiKeyEnv: 'DEEPSEEK_API_KEY',  // read from env
    },
  ],
  activeProvider: 'glm',
};

const agent = createAgent({ externalConfig: config });
```

### Step 3: Environment Variable Fallback

If no external config is provided, the system auto-detects from environment:

```bash
# Set any of these environment variables
export GLM_API_KEY=xxx
export DEEPSEEK_API_KEY=xxx
export ANTHROPIC_API_KEY=xxx
export OPENAI_API_KEY=xxx
```

```typescript
// Auto-detection mode - no configuration needed
const agent = createAgent();
await agent.initialize();
// Provider is automatically configured based on available env vars
```

### Step 4: Remove CC-Switch References

Remove any code that checks for CC-Switch:

```typescript
// Before
if (agent.isCCSwitchInstalled()) {
  // ...
}

// After - no longer needed
// Use external config or env vars instead
```

## New Features

### JSON Schema Validation

Configuration can be validated against JSON Schema:

```typescript
import { validateAgentConfig, validateOrThrow } from '@hive/core';

const result = validateAgentConfig(config);
if (!result.valid) {
  console.error('Validation errors:', result.errors);
}

// Or throw on invalid
const validConfig = validateOrThrow(config, validateAgentConfig);
```

### Built-in Provider Presets

The following providers are auto-detected from environment variables:

| Provider | Env Variable | Base URL |
|----------|--------------|----------|
| GLM | `GLM_API_KEY` | https://open.bigmodel.cn/api/paas/v4 |
| DeepSeek | `DEEPSEEK_API_KEY` | https://api.deepseek.com |
| Qwen | `QWEN_API_KEY` | https://dashscope.aliyuncs.com/compatible-mode/v1 |
| Kimi | `KIMI_API_KEY` | https://api.moonshot.cn/v1 |
| Anthropic | `ANTHROPIC_API_KEY` | https://api.anthropic.com |
| OpenAI | `OPENAI_API_KEY` | https://api.openai.com/v1 |

## Full Example

```typescript
import { createAgent } from '@hive/core';

// Option 1: External config (recommended for production)
const agent = createAgent({
  externalConfig: {
    providers: [
      {
        id: 'my-provider',
        baseUrl: 'https://api.example.com',
        apiKey: process.env.MY_API_KEY,
        model: 'my-model',
      },
    ],
    activeProvider: 'my-provider',
  },
  workspace: './my-workspace',
});

// Option 2: Environment variables (development)
const agent = createAgent({
  workspace: './my-workspace',
});

await agent.initialize();
const response = await agent.chat('Hello!');
```

## Need Help?

If you encounter issues during migration:
1. Check the [README.md](./README.md) for updated API documentation
2. Review the [JSON Schema files](./src/schemas/) for configuration structure
3. Open an issue on GitHub with the `migration` label

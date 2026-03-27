# env-fallback Specification

## Purpose
TBD - created by archiving change remove-ccswitch-simplify-config. Update Purpose after archive.
## Requirements
### Requirement: Zero-configuration mode

The SDK SHALL support zero-configuration mode using environment variables only.

#### Scenario: Single provider from env
- **WHEN** user sets GLM_API_KEY environment variable
- **THEN** SDK SHALL auto-configure GLM provider with conventional baseUrl

#### Scenario: Multiple providers from env
- **WHEN** user sets multiple API keys (GLM_API_KEY, DEEPSEEK_API_KEY)
- **THEN** SDK SHALL auto-configure all detected providers

### Requirement: Conventional provider detection

The SDK SHALL detect providers from environment variables using naming convention.

#### Scenario: Standard naming convention
- **WHEN** environment variable matches pattern {PROVIDER}_API_KEY
- **THEN** SDK SHALL create provider with id={provider} (lowercase)

#### Scenario: Built-in provider base URLs
- **WHEN** detected provider matches known provider (glm, deepseek, anthropic, openai)
- **THEN** SDK SHALL use built-in baseUrl

#### Scenario: Unknown provider
- **WHEN** detected provider is not in known list
- **THEN** SDK SHALL NOT auto-configure (requires explicit config)

### Requirement: Built-in provider presets

The SDK SHALL maintain a registry of built-in provider presets for zero-config usage.

#### Scenario: GLM preset
- **WHEN** GLM_API_KEY is set
- **THEN** SDK SHALL use baseUrl: https://open.bigmodel.cn/api/paas/v4

#### Scenario: DeepSeek preset
- **WHEN** DEEPSEEK_API_KEY is set
- **THEN** SDK SHALL use baseUrl: https://api.deepseek.com

#### Scenario: Anthropic preset
- **WHEN** ANTHROPIC_API_KEY is set
- **THEN** SDK SHALL use baseUrl: https://api.anthropic.com

#### Scenario: OpenAI preset
- **WHEN** OPENAI_API_KEY is set
- **THEN** SDK SHALL use baseUrl: https://api.openai.com/v1

### Requirement: Priority between explicit config and env

Explicit configuration SHALL take priority over environment variables.

#### Scenario: Explicit config overrides env
- **WHEN** user provides explicit provider config AND environment variable exists
- **THEN** SDK SHALL use explicit config

#### Scenario: Env fills missing fields
- **WHEN** user provides provider config without apiKey but env variable exists
- **THEN** SDK SHALL use apiKey from environment variable


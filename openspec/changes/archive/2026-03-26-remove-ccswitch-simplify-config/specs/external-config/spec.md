## ADDED Requirements

### Requirement: Agent accepts external configuration

The Agent constructor SHALL accept an optional configuration object containing providers, MCP servers, and defaults.

#### Scenario: Create agent with providers
- **WHEN** user creates agent with providers array
- **THEN** agent SHALL use provided providers configuration

#### Scenario: Create agent without configuration
- **WHEN** user creates agent without configuration
- **THEN** agent SHALL fallback to environment variables

### Requirement: Provider configuration validation

The SDK SHALL validate provider configuration against JSON Schema before use.

#### Scenario: Valid provider config
- **WHEN** user provides valid provider config with required fields (id, baseUrl)
- **THEN** provider SHALL be registered successfully

#### Scenario: Missing required fields
- **WHEN** user provides provider config missing id or baseUrl
- **THEN** SDK SHALL throw validation error with field name

### Requirement: Multiple providers support

The SDK SHALL support multiple providers in a single configuration.

#### Scenario: Switch between providers
- **WHEN** user configures multiple providers and calls useProvider()
- **THEN** SDK SHALL switch active provider

#### Scenario: Default active provider
- **WHEN** user configures multiple providers without specifying activeProvider
- **THEN** SDK SHALL use first provider as active

### Requirement: API key resolution

The SDK SHALL resolve API key from multiple sources in priority order.

#### Scenario: Explicit API key
- **WHEN** provider config includes apiKey field
- **THEN** SDK SHALL use provided apiKey

#### Scenario: Environment variable fallback
- **WHEN** provider config has apiKeyEnv but no apiKey
- **THEN** SDK SHALL read API key from specified environment variable

#### Scenario: Conventional environment variable
- **WHEN** provider config has neither apiKey nor apiKeyEnv
- **THEN** SDK SHALL try ${ID}_API_KEY environment variable (uppercase)

### Requirement: MCP servers configuration

The SDK SHALL accept MCP server configuration through external config.

#### Scenario: Configure MCP servers
- **WHEN** user provides mcpServers in config
- **THEN** SDK SHALL register all MCP servers

#### Scenario: MCP server disabled
- **WHEN** MCP server config has enabled: false
- **THEN** SDK SHALL NOT start that MCP server

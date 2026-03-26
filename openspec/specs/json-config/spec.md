## ADDED Requirements

### Requirement: Load JSON configuration file

The system SHALL load configuration from `hive.config.json` in the working directory.

#### Scenario: Configuration file exists
- **WHEN** `hive.config.json` exists in the working directory
- **THEN** the system loads and parses the JSON configuration

#### Scenario: Configuration file missing
- **WHEN** `hive.config.json` does not exist
- **THEN** the system uses default configuration values

### Requirement: Validate configuration against JSON Schema

The system SHALL validate the loaded configuration against `hive.config.schema.json`.

#### Scenario: Valid configuration
- **WHEN** configuration matches the schema
- **THEN** the system proceeds with the validated configuration

#### Scenario: Invalid configuration
- **WHEN** configuration does not match the schema
- **THEN** the system logs an error and exits with non-zero status

### Requirement: Environment variable interpolation

The system SHALL support `${ENV_VAR}` syntax for reading values from environment variables.

#### Scenario: Environment variable set
- **WHEN** configuration contains `${GLM_API_KEY}` and `GLM_API_KEY=xxx` is set
- **THEN** the value is replaced with `xxx`

#### Scenario: Environment variable not set
- **WHEN** configuration contains `${GLM_API_KEY}` and `GLM_API_KEY` is not set
- **THEN** the value is replaced with empty string

### Requirement: Pass plugin configuration to OpenClaw plugins

The system SHALL pass `plugins[pluginName]` configuration as `api.config` to each plugin.

#### Scenario: Plugin has configuration
- **WHEN** `hive.config.json` contains `plugins["@larksuite/openclaw-lark"].channels.feishu.appId`
- **THEN** the plugin receives `api.config.channels.feishu.appId`

#### Scenario: Plugin has no configuration
- **WHEN** plugin is not listed in `plugins` section
- **THEN** the plugin receives empty object `{}`

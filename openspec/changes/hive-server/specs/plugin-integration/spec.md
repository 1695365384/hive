## ADDED Requirements

### Requirement: Load OpenClaw plugins via adapter

The system SHALL load OpenClaw-compatible plugins using the openclaw-adapter.

#### Scenario: Load @larksuite/openclaw-lark plugin
- **WHEN** system starts with @larksuite/openclaw-lark in plugin list
- **THEN** plugin SHALL be loaded via OpenClawPluginLoader
- **AND** plugin channels SHALL be registered with PluginHost
- **AND** plugin tools SHALL be available to agents

### Requirement: Register plugin channels with MessageBus

The system SHALL register plugin channels with the MessageBus for event routing.

#### Scenario: Channel receives message from bus
- **WHEN** MessageBus emits `message:received` event for a channel
- **THEN** corresponding channel plugin SHALL handle the message

### Requirement: Plugin tools are callable by agents

The system SHALL make plugin tools available to agents during execution.

#### Scenario: Agent calls plugin tool
- **WHEN** agent needs to call a tool provided by plugin (e.g., sendTextLark)
- **THEN** tool SHALL be invoked with correct parameters
- **AND** result SHALL be returned to agent

### Requirement: Plugin lifecycle management

The system SHALL manage plugin lifecycle (load, activate, deactivate).

#### Scenario: Activate plugin after load
- **WHEN** plugin is loaded successfully
- **THEN** system SHALL call plugin's activate() method

#### Scenario: Graceful shutdown
- **WHEN** server receives SIGTERM/SIGINT
- **THEN** system SHALL deactivate all plugins before exit

### Requirement: Plugin error handling

The system SHALL handle plugin errors gracefully without crashing the server.

#### Scenario: Plugin fails to load
- **WHEN** plugin throws error during load
- **THEN** system SHALL log error and continue with other plugins
- **AND** server SHALL still start

#### Scenario: Plugin tool throws error
- **WHEN** plugin tool execution fails
- **THEN** error SHALL be caught and returned to agent
- **AND** server SHALL continue running

### Requirement: Plugin configuration

The system SHALL support plugin-specific configuration.

#### Scenario: Pass config to plugin
- **WHEN** plugin has configuration in config file
- **THEN** config SHALL be passed to plugin during registration

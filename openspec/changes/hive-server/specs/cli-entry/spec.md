## ADDED Requirements

### Requirement: CLI starts interactive chat mode

The system SHALL provide an interactive CLI chat mode when run with `hive chat` command.

#### Scenario: Start chat mode
- **WHEN** user runs `hive chat`
- **THEN** system SHALL display welcome message and prompt for input

#### Scenario: Send message in chat mode
- **WHEN** user types a message and presses Enter
- **THEN** system SHALL display agent response

#### Scenario: Exit chat mode
- **WHEN** user types /exit or /quit
- **THEN** system SHALL exit chat mode gracefully

### Requirement: CLI starts HTTP server

The system SHALL provide a command to start the HTTP/WebSocket server.

#### Scenario: Start server with default config
- **WHEN** user runs `hive server`
- **THEN** system SHALL start HTTP server and display listening port

#### Scenario: Start server with custom port
- **WHEN** user runs `hive server --port 8080`
- **THEN** system SHALL start HTTP server on port 8080

### Requirement: CLI shows help and version

The system SHALL provide help and version commands.

#### Scenario: Show help
- **WHEN** user runs `hive --help`
- **THEN** system SHALL display available commands and options

#### Scenario: Show version
- **WHEN** user runs `hive --version`
- **THEN** system SHALL display version number

### Requirement: CLI loads plugins on startup

The system SHALL load configured plugins during server startup.

#### Scenario: Load plugins with server
- **WHEN** user runs `hive server --plugins @larksuite/openclaw-lark`
- **THEN** system SHALL load specified plugins and display loaded plugin names

### Requirement: CLI validates configuration

The system SHALL validate configuration before starting.

#### Scenario: Missing required config
- **WHEN** required configuration is missing (e.g., API key)
- **THEN** system SHALL display error message and exit with non-zero code

#### Scenario: Invalid config file
- **WHEN** config file is malformed
- **THEN** system SHALL display parse error and exit

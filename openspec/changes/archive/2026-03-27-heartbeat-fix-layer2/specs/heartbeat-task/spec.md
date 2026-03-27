## ADDED Requirements

### Requirement: Agent can execute a single heartbeat turn
The `Agent` class SHALL provide a `runHeartbeatOnce(config?: HeartbeatTaskConfig)` method that executes one proactive agent turn and returns a structured `HeartbeatResult`.

#### Scenario: Heartbeat with no pending tasks
- **WHEN** `runHeartbeatOnce()` is called
- **AND** the agent has nothing to report
- **THEN** the method SHALL return `HeartbeatResult` with `isOk: true`, `hasAlert: false`, and empty `content`

#### Scenario: Heartbeat with pending alert
- **WHEN** `runHeartbeatOnce()` is called
- **AND** the agent identifies tasks needing attention
- **THEN** the method SHALL return `HeartbeatResult` with `isOk: false`, `hasAlert: true`, and the alert text in `content`

#### Scenario: Heartbeat with custom prompt
- **WHEN** `runHeartbeatOnce({ prompt: "Check server health" })` is called
- **THEN** the system SHALL use the custom prompt instead of the default HEARTBEAT.md prompt

#### Scenario: Heartbeat with model override
- **WHEN** `runHeartbeatOnce({ model: "deepseek/deepseek-chat" })` is called
- **THEN** the system SHALL route the heartbeat turn to the specified model

### Requirement: HeartbeatTaskConfig defines heartbeat parameters
The system SHALL export a `HeartbeatTaskConfig` interface with the following fields:
- `interval: number` — heartbeat interval in milliseconds
- `prompt?: string` — custom heartbeat prompt (default: read HEARTBEAT.md, reply HEARTBEAT_OK if nothing pending)
- `model?: string` — optional model override for this heartbeat
- `lightContext?: boolean` — when true, use minimal context (not implemented in this change, reserved for future)
- `onResult?: (result: HeartbeatResult) => void` — callback for heartbeat result

#### Scenario: HeartbeatTaskConfig with minimal fields
- **WHEN** `runHeartbeatOnce({ interval: 1800000 })` is called
- **THEN** the system SHALL use default prompt and default model

### Requirement: HeartbeatResult provides structured output
The system SHALL export a `HeartbeatResult` interface with:
- `isOk: boolean` — whether the agent replied HEARTBEAT_OK
- `hasAlert: boolean` — whether there is actionable content (inverse of isOk)
- `content: string` — the agent's response text (empty when isOk)
- `usage?: { input: number; output: number }` — token usage if available

#### Scenario: Parse HEARTBEAT_OK response
- **WHEN** the agent returns a message starting with "HEARTBEAT_OK"
- **THEN** `HeartbeatResult.isOk` SHALL be `true` and `content` SHALL be empty string

#### Scenario: Parse alert response
- **WHEN** the agent returns a message that does not start with "HEARTBEAT_OK"
- **THEN** `HeartbeatResult.hasAlert` SHALL be `true` and `content` SHALL contain the full response

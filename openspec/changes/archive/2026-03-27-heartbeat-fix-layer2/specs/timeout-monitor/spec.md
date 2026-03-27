## ADDED Requirements

### Requirement: Stall detection supports abort action
The `HeartbeatConfig` interface SHALL include an `action` field accepting `'warn'` or `'abort'`. When `action` is `'abort'`, the heartbeat system SHALL abort the currently executing promise via `AbortController` when stall is detected.

#### Scenario: Warn on stall (default)
- **WHEN** `HeartbeatConfig.action` is `'warn'` or undefined
- **AND** the time since last activity exceeds `stallTimeout`
- **THEN** the system SHALL emit `timeout:stalled` hook event and continue execution

#### Scenario: Abort on stall
- **WHEN** `HeartbeatConfig.action` is `'abort'`
- **AND** the time since last activity exceeds `stallTimeout`
- **THEN** the system SHALL emit `timeout:stalled` hook event AND abort the running promise with a `TimeoutError` of type `'stalled'`

### Requirement: WorkflowCapability has timeout protection
The `WorkflowCapability` SHALL wrap its workflow execution with heartbeat monitoring and execution timeout from `TimeoutCapability`.

#### Scenario: Workflow completes within timeout
- **WHEN** a workflow execution completes before `executionTimeout`
- **THEN** the system SHALL stop heartbeat and return the workflow result

#### Scenario: Workflow exceeds execution timeout
- **WHEN** a workflow execution exceeds `executionTimeout`
- **THEN** the system SHALL stop heartbeat and throw a `TimeoutError` of type `'execution'`

#### Scenario: Workflow stalls
- **WHEN** no SDK activity is detected for longer than `stallTimeout` during workflow execution
- **THEN** the system SHALL emit `timeout:stalled` hook event

### Requirement: Sub-agent supports optional timeout
The `AgentExecuteOptions` interface SHALL include an optional `timeout` field. When provided, the `AgentRunner` SHALL enforce the timeout using `AbortController`.

#### Scenario: Sub-agent completes within timeout
- **WHEN** `AgentExecuteOptions.timeout` is set to 30000
- **AND** the sub-agent completes in 20 seconds
- **THEN** the runner SHALL return the agent result normally

#### Scenario: Sub-agent exceeds timeout
- **WHEN** `AgentExecuteOptions.timeout` is set to 30000
- **AND** the sub-agent does not complete within 30 seconds
- **THEN** the runner SHALL abort the execution and return an error result

#### Scenario: Sub-agent without timeout
- **WHEN** `AgentExecuteOptions.timeout` is undefined
- **THEN** the runner SHALL execute without time limit (current behavior preserved)

### Requirement: Duplicated heartbeat setup is consolidated
The `Agent` class SHALL use a single private `withHeartbeat` method to wrap chat/chatStream execution with heartbeat and timeout logic, eliminating code duplication.

#### Scenario: chat and chatStream share heartbeat logic
- **WHEN** `Agent.chat()` or `Agent.chatStream()` is called
- **THEN** both SHALL delegate to the same `withHeartbeat` private method for heartbeat lifecycle management

### Requirement: stallTimeout default is increased
The default `stallTimeout` in `TimeoutCapability` SHALL be 120000ms (2 minutes) instead of 60000ms, to reduce false positives with slow LLM providers.

#### Scenario: Default stallTimeout value
- **WHEN** no `TimeoutConfig.stallTimeout` is provided
- **THEN** the effective `stallTimeout` SHALL be 120000ms

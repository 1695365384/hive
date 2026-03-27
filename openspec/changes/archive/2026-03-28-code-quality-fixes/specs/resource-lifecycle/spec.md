## ADDED Requirements

### Requirement: TimeoutCapability cleans up timers on dispose
TimeoutCapability SHALL implement a `dispose()` method that clears all active timers (heartbeatTimer, stallTimer, executionTimer).

#### Scenario: dispose clears heartbeat timer
- **WHEN** `dispose()` is called on an active TimeoutCapability with heartbeat running
- **THEN** the heartbeat interval timer SHALL be cleared
- **AND** no further heartbeat callbacks SHALL fire

#### Scenario: dispose clears stall timer
- **WHEN** `dispose()` is called on an active TimeoutCapability with stall detection running
- **THEN** the stall detection interval timer SHALL be cleared

#### Scenario: dispose is idempotent
- **WHEN** `dispose()` is called multiple times
- **THEN** no error SHALL be thrown
- **AND** subsequent calls SHALL be no-ops

### Requirement: AuditHooks cleans up flush timer on dispose
AuditHooks SHALL implement a `dispose()` method that clears the batch flush timer.

#### Scenario: dispose clears flush timer
- **WHEN** `dispose()` is called on an active AuditHooks instance
- **THEN** the flush interval timer SHALL be cleared
- **AND** any buffered logs SHALL be flushed before cleanup

### Requirement: AgentContext disposes all capabilities on close
AgentContext SHALL call `dispose()` on all capabilities that implement the disposable interface when the context is closed.

#### Scenario: Context close disposes TimeoutCapability
- **WHEN** AgentContext.close() is called
- **THEN** TimeoutCapability.dispose() SHALL be invoked

#### Scenario: Context close disposes AuditHooks
- **WHEN** AgentContext.close() is called with audit hooks registered
- **THEN** AuditHooks.dispose() SHALL be invoked

### Requirement: IDisposable interface is defined
A `IDisposable` interface SHALL be defined with a `dispose(): void` method. Capabilities with resources to clean up SHALL implement this interface.

#### Scenario: Interface definition
- **WHEN** inspecting the types module
- **THEN** an `IDisposable` interface with `dispose(): void` SHALL be exported

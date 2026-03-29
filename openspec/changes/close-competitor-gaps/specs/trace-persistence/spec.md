## ADDED Requirements

### Requirement: Trace events persist to session storage
Dispatcher SHALL write the complete DispatchTraceEvent array to session storage after dispatch completes.

#### Scenario: Successful dispatch persists trace
- **WHEN** dispatch completes successfully
- **THEN** the full trace array SHALL be stored in the current session's metadata

#### Scenario: Failed dispatch still persists trace
- **WHEN** dispatch fails with an error
- **THEN** all trace events collected before failure SHALL still be persisted

### Requirement: Trace includes per-phase timing
Each DispatchTraceEvent SHALL include `duration` (ms) for start→complete and phase-level events.

#### Scenario: Trace event has duration
- **WHEN** trace event of type dispatch.complete is recorded
- **THEN** event SHALL include `duration` field representing total dispatch time in milliseconds

### Requirement: Trace query by session
SessionManager SHALL support retrieving trace events for a given session.

#### Scenario: Retrieve traces for session
- **WHEN** caller requests traces for a session ID
- **THEN** SessionManager SHALL return all DispatchTraceEvent arrays stored for that session

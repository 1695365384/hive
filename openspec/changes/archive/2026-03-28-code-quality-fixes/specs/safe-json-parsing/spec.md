## ADDED Requirements

### Requirement: JSON.parse is wrapped with error handling
All `JSON.parse` calls in the codebase SHALL be wrapped in try-catch blocks or use a safe parsing utility function. Parse failures SHALL produce meaningful error messages or safe defaults.

#### Scenario: Corrupted session metadata
- **WHEN** session metadata in database contains invalid JSON
- **THEN** the system SHALL NOT throw an unhandled exception
- **AND** a safe default (empty object `{}`) SHALL be used as fallback

#### Scenario: Corrupted workspace config
- **WHEN** workspace config file contains invalid JSON
- **THEN** an error SHALL be thrown with message containing "Invalid JSON" and the file path

### Requirement: Repeated JSON.parse on same value is eliminated
When the same string value is parsed multiple times, it SHALL be parsed once and the result reused.

#### Scenario: SessionRepository compression_state parsed once
- **WHEN** reading a session with compression_state
- **THEN** `JSON.parse(sessionRow.compression_state)` SHALL be called at most once per read operation

### Requirement: Safe parse utility function exists
A shared `safeJsonParse<T>(json: string, fallback: T): T` utility function SHALL be available for use across the codebase.

#### Scenario: Utility handles malformed JSON
- **WHEN** `safeJsonParse('invalid', {})` is called
- **THEN** the fallback value `{}` SHALL be returned
- **AND** no exception SHALL be thrown

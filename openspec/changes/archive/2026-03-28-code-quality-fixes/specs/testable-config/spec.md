## ADDED Requirements

### Requirement: Config uses lazy initialization
`apps/server/src/config.ts` SHALL NOT execute `loadConfig()` at module import time. Configuration SHALL be loaded on first access via a getter function.

#### Scenario: Import does not trigger file I/O
- **WHEN** a module imports from `config.ts`
- **THEN** no file system read SHALL occur until `getConfig()` is called

#### Scenario: Config is cached after first load
- **WHEN** `getConfig()` is called multiple times
- **THEN** `loadConfig()` SHALL be executed only once

### Requirement: Config supports test reset
A `resetConfig()` function SHALL be exported to allow tests to clear the cached configuration and force re-loading.

#### Scenario: Test resets config
- **WHEN** `resetConfig()` is called in a test
- **THEN** the next `getConfig()` call SHALL re-execute `loadConfig()`
- **AND** the previous cached config SHALL be discarded

### Requirement: DatabaseManager supports test isolation
DatabaseManager SHALL provide a `resetInstances()` static method to clear all cached instances, enabling test isolation.

#### Scenario: Tests can reset singleton
- **WHEN** `DatabaseManager.resetInstances()` is called
- **THEN** all cached DatabaseManager instances SHALL be removed
- **AND** subsequent `getInstance()` calls SHALL create fresh instances

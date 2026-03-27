## ADDED Requirements

### Requirement: ILogger interface is defined
An `ILogger` interface SHALL be defined with methods: `debug`, `info`, `warn`, `error`. Each method accepts a message string and optional additional arguments.

#### Scenario: Interface is exported
- **WHEN** inspecting the core package exports
- **THEN** `ILogger` SHALL be exported from the package

### Requirement: ProviderManager accepts optional logger
ProviderManager constructor SHALL accept an optional `ILogger` parameter. When not provided, a no-op logger SHALL be used as default.

#### Scenario: ProviderManager with custom logger
- **WHEN** ProviderManager is constructed with a logger instance
- **THEN** all log output SHALL be routed through the provided logger

#### Scenario: ProviderManager without logger
- **WHEN** ProviderManager is constructed without a logger
- **THEN** no output SHALL be produced (no-op logger)
- **AND** no `console.error` or `console.warn` calls SHALL exist in ProviderManager

### Requirement: No direct console usage in library code
Source files under `packages/core/src/` SHALL NOT contain `console.log`, `console.error`, or `console.warn` calls, except in `cli.ts` (which is a CLI entry point, not library code).

#### Scenario: ProviderManager has no console calls
- **WHEN** inspecting ProviderManager.ts
- **THEN** zero occurrences of `console.log`, `console.error`, or `console.warn` SHALL be found

#### Scenario: Provider sources have no console calls
- **WHEN** inspecting `packages/core/src/providers/sources/` and `packages/core/src/providers/metadata/`
- **THEN** zero occurrences of `console.log`, `console.error`, or `console.warn` SHALL be found

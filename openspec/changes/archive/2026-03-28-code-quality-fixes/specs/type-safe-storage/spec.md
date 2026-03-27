## ADDED Requirements

### Requirement: Database row types are defined
Each database table SHALL have a corresponding TypeScript interface defining its column types. These interfaces SHALL be used for all query result typing.

#### Scenario: SessionRow interface exists
- **WHEN** inspecting the storage module
- **THEN** a `SessionRow` interface SHALL be defined with fields matching the `sessions` table schema (id, created_at, updated_at, title, metadata, compression_state)

#### Scenario: MessageRow interface exists
- **WHEN** inspecting the storage module
- **THEN** a `MessageRow` interface SHALL be defined with fields matching the `messages` table schema (id, session_id, role, content, timestamp, token_count)

### Requirement: No `as any` in storage layer
SessionRepository and MemoryRepository SHALL NOT use `as any` type assertions. All query results SHALL be typed using the defined row interfaces.

#### Scenario: SessionRepository uses typed queries
- **WHEN** inspecting SessionRepository.ts
- **THEN** zero occurrences of `as any` SHALL be found
- **AND** all `.get()` and `.all()` calls SHALL use generic type parameters

#### Scenario: MemoryRepository uses typed queries
- **WHEN** inspecting MemoryRepository.ts
- **THEN** zero occurrences of `as any` SHALL be found

### Requirement: Non-null assertions are eliminated
SessionCapability SHALL NOT use non-null assertion operator (`!.`) to access sessionManager. Instead, guard clauses SHALL validate initialization state before access.

#### Scenario: Guard clause before sessionManager access
- **WHEN** SessionCapability.createSession() is called before init()
- **THEN** an Error SHALL be thrown with message containing "not initialized"

#### Scenario: No non-null assertions in SessionCapability
- **WHEN** inspecting SessionCapability.ts
- **THEN** zero occurrences of `!.` SHALL be found

### Requirement: SessionManager validates current session before mutation
SessionManager methods that access `currentSession` SHALL validate it exists before operating.

#### Scenario: addMessage without active session
- **WHEN** addMessage() is called when no session is active
- **THEN** an Error SHALL be thrown with a descriptive message

### Requirement: Test file naming is consistent
All test files SHALL use kebab-case naming convention (e.g., `timeout-capability.test.ts` not `TimeoutCapability.test.ts`).

#### Scenario: All test files follow naming convention
- **WHEN** listing all `*.test.ts` files in the project
- **THEN** all filenames SHALL match `/^[a-z0-9-]+\.test\.ts$/`

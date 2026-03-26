## 1. Storage Layer Foundation

- [x] 1.1 Create `packages/core/src/storage/` directory structure
- [x] 1.2 Implement `Database.ts` - SQLite connection with WAL mode
- [x] 1.3 Implement `MigrationRunner.ts` - version tracking and migration execution
- [x] 1.4 Create migration `001-initial.ts` - sessions, messages, memories tables + indexes
- [ ] 1.5 Write unit tests for Database and MigrationRunner

## 2. Session Repository

- [x] 2.1 Implement `SessionRepository.ts` with interface `ISessionRepository`
- [x] 2.2 Implement `save()` - INSERT or REPLACE session + messages in transaction
- [x] 2.3 Implement `load()` - SELECT session + JOIN messages, parse dates
- [x] 2.4 Implement `delete()` - DELETE with CASCADE
- [x] 2.5 Implement `list()` - SELECT with group filter and pagination
- [x] 2.6 Implement `getMostRecent()` - ORDER BY updated_at DESC LIMIT 1
- [ ] 2.7 Write unit tests for SessionRepository

## 3. Memory Repository

- [x] 3.1 Implement `MemoryRepository.ts` with interface `IMemoryRepository`
- [x] 3.2 Implement `set()` - INSERT or REPLACE with timestamps
- [x] 3.3 Implement `get()` - SELECT by key
- [x] 3.4 Implement `getAll()` - SELECT all as Record
- [x] 3.5 Implement `getByTag()` - JSON contains query
- [x] 3.6 Implement `delete()` - DELETE by key
- [ ] 3.7 Write unit tests for MemoryRepository

## 4. Integration

- [x] 4.1 Refactor `SessionStorage.ts` to use `SessionRepository` internally
- [x] 4.2 Update `memory-tools.ts` to use `MemoryRepository`
- [x] 4.3 Update `WorkspaceManager.ts` to add `dbFile` path
- [x] 4.4 Add `storage/` exports to `src/index.ts`
- [x] 4.5 Update `SessionCapability.ts` for new architecture
- [x] 4.6 Update `SessionManager.ts` for new architecture
- [x] 4.7 Update `Agent.ts` - remove workspace methods
- [x] 4.8 Create `tests/helpers/mock-repository.ts`
- [x] 4.9 Fix all test files (588 tests passing)

## 5. Migration Tool

- [ ] 5.1 Create `packages/core/src/storage/migrate.ts` - JSON to SQLite migration
- [ ] 5.2 Implement JSON session reader
- [ ] 5.3 Implement batch insert with validation
- [ ] 5.4 Add `hive migrate` CLI command
- [ ] 5.5 Write migration tests with sample JSON data

## 6. Documentation & Cleanup

- [ ] 6.1 Update CLAUDE.md with new storage architecture
- [ ] 6.2 Add storage section to README.md
- [ ] 6.3 Remove unused `memory/` directory from WorkspaceManager
- [ ] 6.4 Add database file to `.gitignore`

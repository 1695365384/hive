## ADDED Requirements

### Requirement: .gitignore covers all sensitive and generated files
`.gitignore` SHALL include patterns for `.hive/` directory (SQLite databases), `*.env` files (except `.env.example`), and common build artifacts. These patterns SHALL prevent sensitive runtime data from being committed.

#### Scenario: .hive directory is ignored
- **WHEN** a developer creates `.hive/hive.db` in the project
- **THEN** `git status` SHALL NOT show the file as untracked

#### Scenario: .env files are ignored
- **WHEN** a developer copies `.env.example` to `.env`
- **THEN** `git status` SHALL NOT show `.env` as untracked

#### Scenario: .env.example is NOT ignored
- **WHEN** a developer adds a new `.env.example` file
- **THEN** `git status` SHALL show `.env.example` as untracked

### Requirement: Previously tracked sensitive files are removed from Git index
Files that were previously committed but should be ignored SHALL be removed from the Git index using `git rm --cached` without deleting local copies.

#### Scenario: Database file removed from index
- **WHEN** `git rm --cached packages/core/.hive/hive.db` is executed
- **THEN** the file SHALL still exist on disk
- **AND** `git status` SHALL show it as deleted (staged)

### Requirement: No database or env files in repository
After cleanup, the repository SHALL NOT contain any `.db`, `.db-shm`, `.db-wal`, or `.env` files (except `.env.example`).

#### Scenario: Verification after cleanup
- **WHEN** running `git ls-files | grep -E '\.(db|env)$'`
- **THEN** the output SHALL be empty

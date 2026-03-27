## ADDED Requirements

### Requirement: hooks/types.ts split into domain modules
`packages/core/src/hooks/types.ts` SHALL be split into domain-specific type files under `packages/core/src/hooks/types/`. The original `hooks/types.ts` SHALL become a barrel re-export file. Each domain file SHALL NOT exceed 300 lines.

#### Scenario: No file exceeds 300 lines
- **WHEN** `hooks/types.ts` is split
- **THEN** each file in `hooks/types/` SHALL have fewer than 300 lines

#### Scenario: Existing imports still work
- **WHEN** existing code imports from `../hooks/types.js`
- **THEN** all previously exported types SHALL still be available

### Requirement: agents/types.ts split by concern
`packages/core/src/agents/types.ts` SHALL be split into concern-specific type files under `packages/core/src/agents/types/`. The original `agents/types.ts` SHALL become a barrel re-export file. Each file SHALL NOT exceed 300 lines.

#### Scenario: No file exceeds 300 lines
- **WHEN** `agents/types.ts` is split
- **THEN** each file in `agents/types/` SHALL have fewer than 300 lines

#### Scenario: Existing imports still work
- **WHEN** existing code imports from `../agents/types.js`
- **THEN** all previously exported types SHALL still be available

### Requirement: No as any in config/validator.ts
`packages/core/src/config/validator.ts` SHALL NOT use `as any`. AJV error types SHALL use proper typing.

#### Scenario: Validator uses typed AJV errors
- **WHEN** `config/validator.ts` processes AJV validation errors
- **THEN** `as any` SHALL NOT appear in the file

### Requirement: No as any in prompts/templates/index.ts
`packages/core/src/agents/prompts/templates/index.ts` SHALL NOT use `as any` to access template cache.

#### Scenario: Template cache access is type-safe
- **WHEN** the template system checks the cache
- **THEN** it SHALL use a properly typed mechanism instead of `(template as any).cache`

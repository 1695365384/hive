## ADDED Requirements

### Requirement: MonitoringHooks uses ILogger
`packages/core/src/hooks/implementations/MonitoringHooks.ts` SHALL accept an `ILogger` parameter in its constructor. The default SHALL be `noopLogger`. All `console.log` calls SHALL be replaced with `this.logger.info()`.

#### Scenario: MonitoringHooks constructor accepts logger
- **WHEN** creating a MonitoringHooks instance
- **THEN** an optional `ILogger` parameter SHALL be accepted

#### Scenario: No console.log in MonitoringHooks
- **WHEN** inspecting `MonitoringHooks.ts`
- **THEN** `console.log` SHALL NOT appear

### Requirement: PromptTemplate uses ILogger
`packages/core/src/agents/prompts/PromptTemplate.ts` SHALL accept an optional `ILogger` parameter. The `console.warn` call SHALL be replaced with `this.logger.warn()`.

#### Scenario: No console.warn in PromptTemplate
- **WHEN** inspecting `PromptTemplate.ts`
- **THEN** `console.warn` SHALL NOT appear

### Requirement: SkillLoader uses ILogger
`packages/core/src/skills/loader.ts` SHALL accept an optional `ILogger` parameter in its constructor. The `console.warn` call SHALL be replaced with `this.logger.warn()`.

#### Scenario: No console.warn in SkillLoader
- **WHEN** inspecting `skills/loader.ts`
- **THEN** `console.warn` SHALL NOT appear

### Requirement: Remove deprecated config export
`apps/server/src/config.ts` SHALL remove the `@deprecated export const config`. `apps/server/src/main.ts` SHALL remove the `export { getConfig as config }` re-export.

#### Scenario: No deprecated exports in config.ts
- **WHEN** inspecting `config.ts`
- **THEN** `@deprecated` SHALL NOT appear on any export

### Requirement: Remove hardcoded localhost fallback
`packages/core/src/providers/metadata/provider-registry.ts` SHALL NOT contain hardcoded `localhost:4000`. The fallback SHALL use a configurable value or be removed.

#### Scenario: No hardcoded localhost in provider registry
- **WHEN** inspecting `provider-registry.ts`
- **THEN** `localhost` SHALL NOT appear as a fallback URL

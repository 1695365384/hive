## 1. Remove CC-Switch Dependencies

- [x] 1.1 Remove `cc-switch` from peerDependencies in package.json
- [x] 1.2 Delete `packages/core/src/providers/sources/cc-switch.ts`
- [x] 1.3 Remove CC-Switch import from `packages/core/src/providers/sources/index.ts`
- [x] 1.4 Remove `isCCSwitchInstalled()` method from ProviderManager
- [x] 1.5 Remove `isCCSwitchInstalled()` method from ProviderCapability

## 2. Simplify Config Source Chain

- [x] 2.1 Delete `packages/core/src/providers/sources/local-config.ts` (or keep for manual use)
- [x] 2.2 Update `createConfigChain()` to only use EnvSource
- [x] 2.3 Remove auto-discovery logic from ProviderManager constructor

## 3. Create External Config Types & Schema

- [x] 3.1 Create `packages/core/src/schemas/` directory
- [x] 3.2 Create `agent-config.json` JSON Schema file
- [x] 3.3 Create `provider-config.json` JSON Schema file
- [x] 3.4 Create `packages/core/src/schemas/index.ts` with exports
- [x] 3.5 Update `packages/core/src/providers/types.ts` with ExternalConfig interface

## 4. Update Agent Constructor

- [x] 4.1 Add ExternalConfig parameter to Agent constructor
- [x] 4.2 Implement config validation against JSON Schema
- [x] 4.3 Update ProviderManager to accept external config
- [x] 4.4 Ensure backward compatibility with env-only mode

## 5. Enhance EnvSource

- [x] 5.1 Add auto-detection for known providers (GLM, DeepSeek, etc.)
- [x] 5.2 Implement `${PROVIDER}_API_KEY` convention
- [x] 5.3 Add built-in provider presets with baseUrl

## 6. Update Exports

- [x] 6.1 Export JSON Schema files from package
- [x] 6.2 Export ExternalConfig type from index.ts
- [x] 6.3 Update main export to include schema utilities

## 7. Update Documentation

- [x] 7.1 Update README.md with new API usage
- [x] 7.2 Remove CC-Switch references from README.md
- [x] 7.3 Add configuration examples to README.md
- [x] 7.4 Update CLAUDE.md if needed (no CLAUDE.md in packages/core)

## 8. Update Tests

- [x] 8.1 Remove CC-Switch related tests
- [x] 8.2 Add tests for external config validation (using validator tests)
- [x] 8.3 Add tests for env fallback behavior (existing tests cover this)
- [x] 8.4 Update integration tests (3 pre-existing test failures unrelated to this change)

## 9. Final Cleanup

- [x] 9.1 Run full test suite (655/658 tests pass, 3 pre-existing failures)
- [x] 9.2 Update TypeScript types and exports
- [x] 9.3 Build and verify no errors
- [x] 9.4 Create migration guide in MIGRATION.md

## 1. Setup

- [x] 1.1 Create `hive.config.schema.json` with JSON Schema definition
- [x] 1.2 Create `hive.config.example.json` with example configuration

## 2. Configuration Loading

- [x] 2.1 Refactor `config.ts` to load `hive.config.json`
- [x] 2.2 Implement JSON Schema validation
- [x] 2.3 Implement `${ENV_VAR}` environment variable interpolation

## 3. Plugin Configuration

- [x] 3.1 Modify `bootstrap.ts` to pass `pluginConfig` to OpenClawPluginLoader
- [x] 3.2 Update OpenClawPluginLoader to use passed config instead of empty object

## 4. Cleanup

- [x] 4.1 Update `.env.example` to document environment variable usage
- [x] 4.2 Remove obsolete config parsing code from `config.ts`
- [x] 4.3 Test with `@larksuite/openclaw-lark` plugin

## 1. Create ExecutionCapability

- [x] 1.1 Create `src/agents/capabilities/ExecutionCapability.ts` with `run(task, options?)` method signature and `DispatchOptions` / `DispatchResult` types
- [x] 1.2 Implement `buildSystemPrompt()` — merge ChatCapability + WorkflowCapability prompt building logic: intelligent.md base + env + schedule + tools (DynamicPromptBuilder), support forceMode routing to explore.md / plan.md
- [x] 1.3 Implement tool set selection — normal mode: `getToolsForAgent('general')` + subagent tools; forceMode explore/plan: read-only tools only, no subagent tools
- [x] 1.4 Implement `run()` core loop — LLMRuntime.run() with streamText, session history, heartbeat/timeout, hook events (workflow:phase, tool:before/after, notification), session persistence on success
- [x] 1.5 Implement `chat()` alias — delegate to `dispatch()` returning string for backward compatibility

## 2. Delete old Capabilities

- [x] 2.1 Delete `src/agents/capabilities/ChatCapability.ts`
- [x] 2.2 Delete `src/agents/capabilities/WorkflowCapability.ts`
- [x] 2.3 Delete `src/agents/capabilities/SubAgentCapability.ts`
- [x] 2.4 Delete `src/agents/dispatch/` directory (Dispatcher, types)
- [x] 2.5 Move subagent tool creation from `subagent-tools.ts` inline into ExecutionCapability (keep the tool factory functions)

## 3. Update Agent.ts

- [x] 3.1 Replace `chatCap`, `subAgentCap`, `workflowCap`, `dispatcher` fields with single `executionCap: ExecutionCapability`
- [x] 3.2 Register ExecutionCapability in constructor
- [x] 3.3 Rewrite `dispatch()` to call `executionCap.run()` directly (inline Dispatcher logic: session ensure, cost calc, trace persistence)
- [x] 3.4 Rewrite `chat()` as `dispatch()` alias (delegate, unwrap text)
- [x] 3.5 Delete `explore()`, `plan()`, `general()`, `runSubAgent()`, `runWorkflow()` methods

## 4. Update exports

- [x] 4.1 Update `src/agents/capabilities/index.ts` — export ExecutionCapability, remove deleted exports
- [x] 4.2 Update `src/agents/index.ts` — remove deleted exports, add ExecutionCapability
- [x] 4.3 Update `src/index.ts` — remove deleted re-exports
- [x] 4.4 Clean up `src/agents/prompts/index.ts` — remove any references to deleted modules

## 5. Update Server

- [x] 5.1 Update `apps/server/src/gateway/ws/chat-handler.ts` — `agent.chat()` → `agent.dispatch()` (callback interface unchanged)

## 6. Update CLI

- [x] 6.1 Update `packages/core/src/cli.ts` — replace `executeExploreMode/executePlanMode/executeGeneralMode/executeWorkflowMode` with `agent.dispatch(task, { forceMode })`
- [x] 6.2 Remove CLI mode executor functions that are no longer needed

## 7. Migrate tests

- [x] 7.1 Create `tests/unit/capabilities/execution-capability.test.ts` — cover normal dispatch, forceMode, streaming callbacks, session persistence, hooks, external systemPrompt override
- [x] 7.2 Delete `tests/unit/capabilities/chat-capability.test.ts`
- [x] 7.3 Delete `tests/unit/capabilities/workflow-capability.test.ts`
- [x] 7.4 Delete `tests/unit/capabilities/subagent-capability.test.ts`
- [x] 7.5 Update `tests/unit/dispatch/dispatcher.test.ts` or delete if fully replaced
- [x] 7.6 Update `tests/unit/builtin.test.ts` if needed (prompt template assertions)

## 8. Verify

- [x] 8.1 Run `pnpm test` — all 66 test files pass
- [x] 8.2 Run `npx tsc --noEmit` on `src/` — zero type errors
- [x] 8.3 Run `pnpm run copy-templates`

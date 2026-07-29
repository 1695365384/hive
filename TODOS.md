# TODOS

## P2 — Dual-tool stack → pi CustomTool only

**What:** Author new tools as pi CustomTool; retire Vercel `ai` `Tool` shells; shrink ToolRegistry to Hive extension bridge.

**Why:** Live kernel is already pi; maintaining AI SDK Tool + bridge doubles every tool change and confuses the mental model.

**Context:** Start at `packages/core/src/agents/core/hive-tool-bridge.ts` and `packages/core/src/tools/built-in/*`. Kernel uses pi builtins + customTools. Deferred from CEO arch-truth cleanup 2026-07-28 (HOLD SCOPE).

**Effort:** L (human) → M with CC
**Priority:** P2
**Depends on:** Architecture truth cleanup (#152)

## P2 — waitForProviderReady after ConfigPage provider save

- **What:** After `config.update` changes provider, await agent ready or show an honest restart/ready banner (SetupWizard already has `waitForProviderReady`).
- **Why:** Hero/verify can look healthy while the agent is still restarting — commercial trust gap.
- **Context:** Deferred from CEO review 2026-07-17 provider-settings-commercial. Do after the UI polish wedge ships.
- **Effort:** M (human) → S with CC
- **Depends on:** Provider settings commercial polish PR

## P3 — Remove deprecated TaskRouter public exports (breaking)

**What:** On next breaking/major bump, drop `TaskRouter`, `defaultTaskRouter`, `validateWorkerSpawn`, named/office/schedule spawn builders from `@bundy-lmw/hive-core` public exports. Keep `isOfficeTask` / `hasNoArtifactIntent` (and labels if still needed).

**Why:** Finish the deprecate-in-place story from #152 so grep stops pointing at a dead dispatch router.

**Context:** AgentLoop/ServerImpl do not call TaskRouter. Public API was intentionally kept for semver in the arch-truth cleanup.

**Effort:** M (human) → S with CC
**Priority:** P3
**Depends on:** #152 deprecate JSDoc landed

## P3 — Move LanguageSwitcher to General settings tab

- **What:** Remove language control from Provider (`ConfigPage`); place under General/plugins IA.
- **Why:** Provider tab should be AI config only.
- **Context:** Deferred from same CEO review; not load-bearing for visual polish.
- **Effort:** S
- **Depends on:** none

## Done — Goal SQLite persistence (2026-07-20)
- Goals table migration v5; GoalRepository + GoalStore.attachPersistence
- Server hydrate on start (active→blocked after restart)
- WS `chat.getGoal`; desktop restores blocked banner on session load
- WS client waits for reconnect before failing requests (softens restart flash)
- Verified: cancel → restart → getGoal blocked → continueGoal ok

## Done - Specialist workers librarian/metis/momus/oracle (2026-07-21)
- Added delegatable workers: librarian, metis, momus, oracle
- Wired AgentType, CORE_AGENTS, tool whitelists, templates, coordinator routing, desktop labels
- Complex pipeline: Explore/Librarian → Metis → Plan → Momus → General (+ Oracle when needed)

## Done — Hard-route named Worker types (2026-07-21)
- named-worker scenario priority 200; explicit「请用 librarian」etc. hard-delegates
- validateSpawn rejects explore substitutes; Coordinator force-recovery if missing


## Done — Workspace root includes repo (2026-07-21)
- security getAllowedRoots always unions process.cwd() + HIVE_WORKING_DIR + HIVE_HOME
- desktop spawn sets HIVE_WORKING_DIR to project root; bootstrap addAllowedRoot(cwd, HIVE_HOME)


## Done — Chat Send aria-label (2026-07-21)
- chat-composer__send / attach buttons expose aria-label from i18n

## Done — Honor no-artifact intent (2026-07-21)
- hasNoArtifactIntent blocks office creation + office verifier + Coordinator prompt constraint

## Done — Session write workspace (2026-07-21)
- Each chat session writes under `~/.hive/sessions/<id>/workspace`
- Read still allowed for repo cwd / HIVE_WORKING_DIR / HIVE_HOME
- AsyncLocalStorage binds tools (file/bash/glob/grep/send-file) + Coordinator prompt Working Directory

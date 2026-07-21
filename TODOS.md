# TODOS

## P2 — waitForProviderReady after ConfigPage provider save

- **What:** After `config.update` changes provider, await agent ready or show an honest restart/ready banner (SetupWizard already has `waitForProviderReady`).
- **Why:** Hero/verify can look healthy while the agent is still restarting — commercial trust gap.
- **Context:** Deferred from CEO review 2026-07-17 provider-settings-commercial. Do after the UI polish wedge ships.
- **Effort:** M (human) → S with CC
- **Depends on:** Provider settings commercial polish PR

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

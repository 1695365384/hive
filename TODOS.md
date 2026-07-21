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

## P2 — Hard-route named Worker types (librarian/metis/momus/oracle)

- **What:** If user explicitly names a worker type, enforce first dispatch type (not prompt-only).
- **Why:** QA 2026-07-21 ISSUE-002 — asked librarian, got explore-only.
- **Effort:** M
- **Depends on:** specialist workers commit

## P2 — Workspace root for desktop chat should include repo (or clearer path UX)

- **What:** Explore/file tools currently jail to server cwd/.hive; README at repo root fails.
- **Why:** QA 2026-07-21 ISSUE-004
- **Effort:** M

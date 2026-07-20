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

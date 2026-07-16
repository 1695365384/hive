---
name: hive-motion
description: >
  Choose Hive Desktop shell motion presets (Anime.js) for collaboration UI —
  worker cards, activity dock, route chips, ask-user options. Use when the user
  wants flashy enter/celebrate effects in chat, or when emitting motionId hints.
  Do NOT invent Anime.js API calls or inject <script> into chat markdown.
  For standalone animated HTML decks (not Office PPT), prefer a separate HTML
  artifact with a vendored/esm anime bundle; shell presets stay catalog-only.
---

# Hive Motion

Desktop runs **Anime.js v4** inside a sandbox. You only pick **allowlisted** `motionId`s.

## Shell presets (allowlist)

| motionId | When to use |
|----------|-------------|
| `activity-dock-enter` | Status dock appears / run starts |
| `route-chip-enter` | Coordinator route / delegate chip shows |
| `worker-card-enter` | Worker lane or parallel workers mount |
| `ask-user-options` | Ask-user options should stagger in |
| `success-pulse` | Soft celebrate on completed card / dock |

Unknown ids are ignored. Do not invent new ids in prompts.

## Rules

1. **Never** put `<script>` or raw `animate(...)` in chat markdown.
2. Prefer letting Desktop map events (`worker-start`, dock show) → presets automatically.
3. If you suggest motion in a plan, name the `motionId` from the table above.
4. Respect reduced motion: Desktop no-ops presets when `prefers-reduced-motion: reduce`.
5. **Office PPT** (officecli) is unrelated. Animated **HTML demo decks** are a different path (artifact HTML), not these shell ids.

## Scene → preset cheat sheet

| Product moment | motionId |
|----------------|----------|
| Multi-worker kickoff | `worker-card-enter` |
| Long wait status bar | `activity-dock-enter` |
| Route to explore ∥ general | `route-chip-enter` |
| Need user pick A/B/C | `ask-user-options` |
| Worker finished well | `success-pulse` |

## Anti-patterns

- Animating `document.body` or infinite spin that hides text
- Asking for custom easing curves / arbitrary anime options JSON
- Confusing officecli `.pptx` with HTML motion artifacts

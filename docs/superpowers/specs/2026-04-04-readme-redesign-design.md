# README Redesign Design

**Date:** 2026-04-04
**Status:** Approved
**Scope:** README.md complete rewrite

## Problem Statement

Current README (484 lines / 19KB) has four critical issues:

1. **OpenClaw-negative content dominates** — "Why leave OpenClaw" + "Core advantages" (each attacking OC) = 155 lines (32%) appears before Quick Start
2. **Hive's own value is buried** — Users must scroll past 155 lines of OC criticism to see "what can Hive do"
3. **No visual demo** — No GIF, screenshot, or live example showing the workflow in action
4. **Too long and verbose** — 484 lines with low information density, repetitive patterns ("天然X" x6)

## Design Decisions

### Approach: Brand Rebuild (Option B)

Rewrite from scratch with a use-case-driven structure, Vercel-style professional branding, bilingual (EN + CN), ~200 lines target.

### Target Audience

- Chinese developers seeking a simpler, cheaper Agent framework (possibly OC refugees)
- Global developers evaluating Agent SDKs for their tech stack

### Brand Tone

High-end, professional (Vercel style). Technical credibility over competitor attacks.

## Information Architecture

```
1. Hero (~20 lines)
   - Logo + tagline (bilingual)
   - One-liner install command
   - Badges (TypeScript, Node 18+, test count, MIT)
   - Nav links to own sections (NOT "why leave OC")

2. Feature Cards (~40 lines)
   - 6 bilingual cards with emoji + EN title + CN subtitle + one-line description
   - Features: Intelligent Routing, Built-in Cost Control, Permission Layers,
     Chinese LLM First-Class, Zero-Config Deploy, Plugin Ecosystem
   - NO competitor comparisons in this section

3. Quick Start (~35 lines)
   - Step 1: Install (npm i @bundy-lmw/hive-core)
   - Step 2: Configure (env var, bilingual)
   - Step 3: Dispatch (real TypeScript code with syntax-highlighted comments)
   - Step 4: Server (optional, HTTP service)

4. Demo GIF (~5 lines)
   - Placeholder for workflow execution demo
   - TODO comment for future screenshot/GIF

5. API Surface (~15 lines)
   - Core Agent methods in a code block:
     dispatch(), chat(), runWorkflow(), explore(), plan(), general()

6. Architecture (~20 lines)
   - Streamlined ASCII diagram with Chinese annotations
   - Remove duplicate Capability list (already in Feature Cards)

7. Providers (~20 lines)
   - Chinese LLM table (GLM, DeepSeek, Qwen, Kimi, ERNIE)
   - Global LLM table (Anthropic, OpenAI, Azure, OpenRouter, Together)
   - Bilingual section headers
   - Remove "add custom provider" paragraph (move to docs)

8. Migrating from OpenClaw (collapsed, ~10 lines visible)
   - <details> collapsed by default
   - Condensed comparison table (key dimensions only)
   - Brief migration steps
   - This is the ONLY place OC is mentioned

9. Development (~10 lines)
   - Core commands table only (install, build, test, start)
   - Remove CLI section (merged into Quick Start optional step)
   - Remove "Related Projects" section

10. FAQ (collapsed, ~15 lines visible)
    - Reduce from 7 to 4 core questions
    - All in <details> tags
    - Remove "Is Hive just an OC replacement?" (covered in Migration)
    - Remove "How to create custom skills?" (move to docs)

11. License + Contributing (~5 lines)
    - MIT license link
    - Contributing guidelines link
```

## Key Changes from Current README

| Aspect | Current | New |
|--------|---------|-----|
| Total lines | 484 | ~200 |
| OC-related content | 155 lines (32%) | 10 lines collapsed (5%) |
| Content before Quick Start | 155 lines of OC criticism | 60 lines of Hero + Features |
| Feature presentation | 6 "天然X" long paragraphs | 6 bilingual cards |
| Code examples | HTTP curl only | TypeScript SDK + HTTP |
| Brand positioning | "OpenClaw 替代品" | "The Multi-Agent SDK for TypeScript" |
| Architecture diagram | 30 lines, no Chinese | 20 lines, bilingual annotations |
| FAQ count | 7 (some redundant) | 4 (core only) |
| Demo | None | Placeholder for GIF |
| Language | Chinese only | Bilingual (EN + CN) |

## Files to Modify

- `README.md` — Complete rewrite
- `package.json` (root) — Add `description`, `keywords`, `repository` fields (optional, separate task)
- `LICENSE` — Create MIT license file (currently missing, separate task)

## Out of Scope

- Actual demo GIF/screenshot creation (placeholder only)
- package.json metadata improvements
- LICENSE file creation
- GitHub issue/PR templates
- `.superpowers/brainstorm/` cleanup (add to .gitignore)

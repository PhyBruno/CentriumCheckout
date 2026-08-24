# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Layout: this repo uses `.specs/`, not root `CONTEXT.md` / `docs/adr/`

CentriumCheckout is spec-driven (Spec Kit — see `CLAUDE.md` and `SPECKIT.md` at the repo root) and was pre-code as of 2026-08. All domain documentation lives under `.specs/`:

```
.specs/
├── project/
│   ├── PROJECT.md        ← project overview, source of truth
│   ├── STATE.md           ← architectural decisions, numbered AD-NNN (this repo's ADR log)
│   ├── ROADMAP.md         ← roadmap / sequencing
│   └── PENDENCIES.md      ← consolidated open pendencies/edge cases across features + infra
├── codebase/
│   ├── ARCHITECTURE.md
│   ├── STACK.md
│   ├── INTEGRATIONS.md
│   └── CONCERNS.md
├── features/
│   └── <feature-slug>/spec.md   ← one spec per feature (Spec Kit `/speckit.specify` output)
└── quick/                        ← quick, ungrouped notes
```

There is no root `CONTEXT.md`, `CONTEXT-MAP.md`, or `docs/adr/` in this repo — don't look for them.

## Before exploring, read these

- **`.specs/project/PROJECT.md`** — project overview and source of truth
- **`.specs/project/STATE.md`** — architectural decisions (AD-NNN). This is this repo's ADR log; read entries relevant to the area you're about to work in.
- **`.specs/codebase/ARCHITECTURE.md`, `STACK.md`, `INTEGRATIONS.md`** — codebase-level context (stack, architecture, external integrations)
- **`.specs/features/<feature-slug>/spec.md`** — read the spec for the feature you're touching, if one exists
- **`.specs/project/PENDENCIES.md`** — known open pendencies/edge cases; check before proposing new work that might duplicate or contradict them

If a file doesn't exist yet, proceed silently — don't flag its absence or suggest creating it upfront.

## Use the glossary's / spec's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in the relevant `.specs/features/<feature-slug>/spec.md` or `.specs/project/PROJECT.md`. Don't drift to synonyms.

If the concept you need isn't documented yet, that's a signal: either you're inventing language the project doesn't use (reconsider), or there's a real gap worth noting in `.specs/project/PENDENCIES.md`.

## Flag AD conflicts

If your output contradicts an existing AD entry in `.specs/project/STATE.md`, surface it explicitly rather than silently overriding:

> _Contradicts AD-018 (Boneyard/Goey Toast as real npm deps), but worth reopening because…_

## Spec-Driven Development note

New features, bugfixes, and refactors in this repo go through the Spec Kit sequence (`/speckit.specify` → `/speckit.tasks` → `/speckit.implement`). Engineering skills that create issues/tickets should point back to the relevant `.specs/features/<feature-slug>/spec.md` rather than duplicating spec content in the issue body.

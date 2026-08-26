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
│   └── <feature-slug>/spec.md   ← one spec per feature (Spec Kit `/speckit-specify` output)
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

## Ao corrigir uma decisão superada, não anexe a correção no final

Quando uma decisão registrada em `.specs/` (um `AD-NNN` de `STATE.md`, um requisito de `spec.md`, uma nota de `PENDENCIES.md`/`CONCERNS.md`) é substituída por uma decisão posterior, **nunca** deixe o texto antigo (agora errado) como a primeira coisa que se lê, com a correção só anexada ao final do parágrafo (ex.: "`...será feito assim...` **Correção (data, AD-NNN):** ...na verdade não é mais assim."). Um leitor — humano ou IA — que pare de ler no meio do parágrafo (comum em varredura rápida, resumo automático ou contexto truncado) sai com a informação errada, o que gera ambiguidade e pode causar erro de implementação.

Em vez disso:

- **Sempre que possível, reescreva o trecho para que ele já declare o estado atual como frase principal**, movendo o histórico da decisão anterior para uma cláusula secundária (ex.: "O sistema SHALL fazer X. **Corrigido em 2026-08-25 (AD-NNN):** a abordagem anterior, Y, foi descartada."). Ver `.specs/project/STATE.md`, AD-060 sobre AD-031, como precedente já usado neste repo.
- Quando o trecho antigo precisa ser preservado por completo (registro histórico de um AD em `STATE.md`), abra o item com uma marcação em negrito no INÍCIO — não no fim — sinalizando a correção antes do texto obsoleto (ex.: "**[CORRIGIDO em 2026-08-25 pela AD-NNN — ver a frase em negrito ao final para o mecanismo atual]** ...texto histórico..."), e repita a afirmação corrigida em negrito na própria frase que a substitui, não só numa nota apensada.
- No título do `AD-NNN` original, anexe uma nota curta da correção entre parênteses (mesmo padrão já usado em AD-031: "corrigido em `<data>` pela AD-NNN — `<resumo de uma linha>`") — o título costuma ser lido mesmo quando o corpo não é.
- Sempre reescreva também qualquer outro lugar que cite a mesma informação (ver seção "Use the glossary's / spec's vocabulary" acima) — uma correção parcial, feita só num arquivo, recria o mesmo risco de ambiguidade nos demais.

## Spec-Driven Development note

New features, bugfixes, and refactors in this repo go through the Spec Kit sequence (`/speckit-specify` → `/speckit-tasks` → `/speckit-implement`) — the real CLI, installed in `.specify/` since 2026-08-26, not just documented convention. Engineering skills that create issues/tickets should point back to the relevant `.specs/features/<feature-slug>/spec.md` rather than duplicating spec content in the issue body.

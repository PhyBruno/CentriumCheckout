<!-- dgc-policy-v11 -->
# CentriumCheckout (CheckoutWEB)

## Project Context

Checkout web para operadores de caixa do ERP Centrium — SPA React acessada exclusivamente via redirecionamento a partir do ERP, cobrindo identificação de cliente, inserção de produtos, precificação, pagamento e finalização/suspensão de NFCe. O ERP é a fonte de verdade (produtos, clientes, pagamentos, NFCe); o Checkout só orquestra a venda e calcula preço em tempo real. Visão completa: `.specs/project/PROJECT.md`.

**Stack:** React + Vite, TypeScript `strict`, Zustand + Immer (venda em andamento, sem `persist`), TanStack Query (cache do ERP), Zod (validação de fronteira), Dexie/IndexedDB (só bootstrap do tenant), shadcn/ui + Boneyard + Goey Toast (UI). Sem backend próprio — consome direto a API do ERP. 100% Docker (dev e produção). Detalhes: `.specs/codebase/STACK.md`.

**Arquitetura:** SPA sem persistência de carrinho em F5 (Zustand sem `persist`); credenciais/`access_token` em cookie `HttpOnly`; TEF e impressão rodam fora do container, na máquina do PDV. Detalhes: `.specs/codebase/ARCHITECTURE.md`.

**Estado do projeto:** pré-código — stack e arquitetura decididas em `.specs/`, scaffolding ainda não criado (ver `.specs/project/STATE.md` para decisões arquiteturais numeradas AD-NNN e pendências).

**Convenções e regras de código:** ainda a definir quando o scaffolding existir (ver `.specs/project/ROADMAP.md`). **Regras de processo (git workflow, gates obrigatórios) já estão definidas em `rules.md` na raiz do repo.**

**Commit + push obrigatórios ao final de cada tarefa:** ao concluir uma tarefa coerente (não a cada edição individual de arquivo), sempre fazer `git commit` e `git push` na branch da tarefa, sem esperar o usuário pedir — pedido explícito do usuário (2026-08-25). Regra completa (branch/worktree, mensagens de commit, exceções) em `rules.md`, seção "Fim de tarefa: commit + push obrigatórios".

## Spec-Driven Development (Obrigatório)

Este projeto usa **[Spec Kit](https://github.com/github/spec-kit)** como framework de desenvolvimento orientado por especificação. Toda nova feature, bugfix, ou refatoração deve começar com a sequência de commands obrigatória:

1. **`/speckit.specify`** — Defina requisitos formais, comportamentos esperados, invariantes e casos de limite **antes** de qualquer implementação
2. **`/speckit.tasks`** — Gere tarefas decompostas em dependência topológica (Setup → Foundational → Feature → Testing)
3. **`/speckit.implement`** — Execute tarefas na ordem, com contexto de especificação injetado em cada passo

**Por quê:** Este projeto começou em pré-código (`.specs/`); Spec Kit garante que toda implementação futura mantenha a rastreabilidade entre requisito-design-implementação, reduzindo ambiguidade e retrabalho.

**📖 Guia operacional completo:** Ver `SPECKIT.md` na raiz do repo para sequência exata, exemplos e troubleshooting.

**Combinação com outras skills:**

- **Ao especificar:** Nenhuma outra skill é acionada automaticamente — `tlc-spec-driven` (skill global) cobre o processo genérico, mas `specify` é sua materialização declarativa.
- **Ao gerar tarefas:** `/speckit.tasks` sai de um `speckit.json` — não usa outras skills para gerar; é puro sequenciamento de dependência.
- **Ao implementar (`/speckit.implement`):** Aqui SIM, acionam-se as skills relevantes conforme tipo de tarefa:
  - **Componente React ou hook** → Ativa `ecc:react-build`, `ecc:react-review`, `vitest-testing-library-react` (skill de projeto)
  - **Lógica de precificação** → `money-precision` (skill de projeto, maior risco)
  - **State management (Zustand)** → `zustand-immer-state` (skill de projeto)
  - **Validação de entrada** → `zod-boundary-validation` (skill de projeto)
  - **Query de dados (TanStack)** → `tanstack-query-checkout` (skill de projeto)
  - **Persistência (Dexie)** → `dexie-bootstrap-cache` (skill de projeto)
  - **TypeScript strict** → `typescript-strict` (skill de projeto) — obrigatória antes de qualquer `git push`
  - **Testes end-to-end** → `ecc:e2e-testing` (skill global)
  - **Security** → `owasp-security` (skill global) — obrigatória antes de merge para `main`

**MCPs/plugins que aumentam Spec Kit:**

- **`genexus`** (user scope) — Ao descrever endpoints/contracts de API nos requisitos, consulte direto a KB GenExus do ERP para confirmar contratos atuais (ex.: AD-023/AD-024 em `.specs/project/PENDENCIES.md`)
- **`context7`** (user scope) — Ao especificar padrões de React/Vite/TS/Zod, busque docs atuais das versões fixadas neste projeto (React 19, Zod 4, Zustand 5)
- **`dual-graph`** (project scope, local MCP) — Contexto semântico do repo injeta ao `specify` sugestões de padrões já usados

**Não acionadas por Spec Kit (use manualmente conforme necessário):**

- `ecc:tdd-workflow` — É complementar a `speckit.implement`, não automático. Se a tarefa gerada por Spec Kit tiver critérios de aceitação testáveis, ative RED/GREEN/checkpoint via `ecc:tdd-workflow` dentro daquela tarefa.
- `superpowers:brainstorming`, `superpowers:test-driven-development` — Usados fora de Spec Kit, para exploração antes de `specify`.
- **Skills globais genéricas** (`ecc:frontend-patterns`, `ecc:error-handling`, etc.) — Use quando `speckit.implement` indicar a tarefa, não preventivamente.

# Dual-Graph Context Policy

This project uses a local dual-graph MCP server for efficient context retrieval.

## MANDATORY: Adaptive graph_continue rule

**Call ``graph_continue`` ONLY when you do NOT already know the relevant files.**

### Call ``graph_continue`` when:
- This is the first message of a new task / conversation
- The task shifts to a completely different area of the codebase
- You need files you haven't read yet in this session

### SKIP ``graph_continue`` when:
- You already identified the relevant files earlier in this conversation
- You are doing follow-up work on files already read (verify, refactor, test, docs, cleanup, commit)
- The task is pure text (writing a commit message, summarising, explaining)

**If skipping, go directly to ``graph_read`` on the already-known ``file::symbol``.**

## When you DO call graph_continue

1. **If ``graph_continue`` returns ``needs_project=true``**: call ``graph_scan`` with ``pwd``. Do NOT ask the user.

2. **If ``graph_continue`` returns ``skip=true``**: fewer than 5 files  -  read only specifically named files.

3. **Read ``recommended_files``** using ``graph_read``.
   - Always use ``file::symbol`` notation (e.g. ``src/auth.ts::handleLogin``)  -  never read whole files.
   - ``recommended_files`` entries that already contain ``::`` must be passed verbatim.

4. **Obey confidence caps:**
   - ``confidence=high`` -> Stop. Do NOT grep or explore further.
   - ``confidence=medium`` -> ``fallback_rg`` at most ``max_supplementary_greps`` times, then ``graph_read`` at most ``max_supplementary_files`` more symbols. Stop.
   - ``confidence=low`` -> same as medium. Stop.

## Session State (compact, update after every turn)

Maintain a short JSON block in your working memory. Update it after each turn:

``````json
{
  "files_identified": ["path/to/file.py"],
  "symbols_changed": ["module::function"],
  "fix_applied": true,
  "features_added": ["description"],
  "open_issues": ["one-line note"]
}
``````

Use this state  -  not prose summaries  -  to remember what's been done across turns.

## Token Usage

A ``token-counter`` MCP is available for tracking live token usage.

- Before reading a large file: ``count_tokens({text: "<content>"})`` to check cost first.
- To show running session cost: ``get_session_stats()``
- To log completed task: ``log_usage({input_tokens: N, output_tokens: N, description: "task"})``

## Rules

- Do NOT use ``rg``, ``grep``, or bash file exploration before calling ``graph_continue`` (when required).
- Do NOT do broad/recursive exploration at any confidence level.
- ``max_supplementary_greps`` and ``max_supplementary_files`` are hard caps  -  never exceed them.
- Do NOT call ``graph_continue`` more than once per turn.
- Always use ``file::symbol`` notation with ``graph_read``  -  never bare filenames.
- After edits, call ``graph_register_edit`` with changed files using ``file::symbol`` notation.

## Context Store

Whenever you make a decision, identify a task, note a next step, fact, or blocker during a conversation, append it to ``.dual-graph/context-store.json``.

**Entry format:**
``````json
{"type": "decision|task|next|fact|blocker", "content": "one sentence max 15 words", "tags": ["topic"], "files": ["relevant/file.ts"], "date": "YYYY-MM-DD"}
``````

**To append:** Read the file -> add the new entry to the array -> Write it back -> call ``graph_register_edit`` on ``.dual-graph/context-store.json``.

**Rules:**
- Only log things worth remembering across sessions (not every minor detail)
- ``content`` must be under 15 words
- ``files`` lists the files this decision/task relates to (can be empty)
- Log immediately when the item arises  -  not at session end

## Session End

When the user signals they are done (e.g. "bye", "done", "wrap up", "end session"), proactively update ``CONTEXT.md`` in the project root with:
- **Current Task**: one sentence on what was being worked on
- **Key Decisions**: bullet list, max 3 items
- **Next Steps**: bullet list, max 3 items

Keep ``CONTEXT.md`` under 20 lines total. Do NOT summarize the full conversation  -  only what's needed to resume next session.

# Pre-Production Security Requirements

**MANDATORY SKILL BEFORE ANY PRODUCTION DEPLOYMENT**

The skill `/owasp-security` must be invoked before any system is deployed to production. This skill performs comprehensive OWASP compliance analysis, security vulnerability detection, and compliance validation.

**Activation points:**
- Before any code merge to `main`/`master` branch destined for production
- Before container image push to production registry
- Before database migrations to production environment
- In CI/CD pipelines as a mandatory gate step

Invoke with: `/owasp-security` or include it in the pre-production checklist workflow.

## Agent skills

### Issue tracker

Issues tracked in GitHub Issues (`PhyBruno/CentriumCheckout`), via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Domain docs

Domain documentation lives under `.specs/` (not root `CONTEXT.md`/`docs/adr/`) — project-level specs, codebase docs, and per-feature specs. See `docs/agents/domain.md`.

**Ao corrigir uma decisão superada em `.specs/`, nunca deixe a correção só anexada ao final do parágrafo** — um leitor (humano ou IA) que pare de ler no meio pega a informação errada, o que gera ambiguidade e pode causar erro de implementação. Regra completa (como reescrever/sinalizar corretamente, precedente já usado em `STATE.md`) em `docs/agents/domain.md`, seção "Ao corrigir uma decisão superada, não anexe a correção no final" — pedido explícito do usuário (2026-08-25).

### Fluxo de desenvolvimento com IA

Sequência padrão (plugins/skills obrigatórios, ordem SDD → requisitos → grilling/brainstorming → implementação, defaults de stack) e o que foi mapeado de reaproveitável em `C:\CentriumIA`. See `docs/agents/fluxo-ia.md`.


<!-- dgc-policy-v11 -->
# CentriumCheckout (CheckoutWEB)

## Project Context

Checkout web para operadores de caixa do ERP Centrium — SPA React acessada exclusivamente via redirecionamento a partir do ERP, cobrindo identificação de cliente, inserção de produtos, precificação, pagamento e finalização/suspensão de NFCe. O ERP é a fonte de verdade (produtos, clientes, pagamentos, NFCe); o Checkout só orquestra a venda e calcula preço em tempo real. Visão completa: `.specs/project/PROJECT.md`.

**Stack:** React + Vite, TypeScript `strict`, Zustand + Immer (venda em andamento, sem `persist`), TanStack Query (cache do ERP), Zod (validação de fronteira), Dexie/IndexedDB (só bootstrap do tenant), shadcn/ui + Boneyard + Goey Toast (UI). Sem backend próprio — consome direto a API do ERP. 100% Docker (dev e produção). Detalhes: `.specs/codebase/STACK.md`.

**Arquitetura:** SPA sem persistência de carrinho em F5 (Zustand sem `persist`); credenciais/`access_token` em cookie `HttpOnly`; TEF e impressão rodam fora do container, na máquina do PDV. Detalhes: `.specs/codebase/ARCHITECTURE.md`.

**Estado do projeto:** pré-código — stack e arquitetura decididas em `.specs/`, scaffolding ainda não criado (ver `.specs/project/STATE.md` para decisões arquiteturais numeradas AD-NNN e pendências).

**Convenções e regras de código:** ainda a definir quando o scaffolding existir (ver `.specs/project/ROADMAP.md`), **exceto** a exigência de arquitetura SOLID (Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, Dependency Inversion), já fixada em `.specs/project/STATE.md` (AD-085) e obrigatória desde já para todo código que vier a ser escrito. **Regras de processo (git workflow, gates obrigatórios) já estão definidas em `rules.md` na raiz do repo.**

**Commit + push obrigatórios ao final de cada tarefa:** ao concluir uma tarefa coerente (não a cada edição individual de arquivo), sempre fazer `git commit` e `git push` na branch da tarefa, sem esperar o usuário pedir — pedido explícito do usuário (2026-08-25). Regra completa (branch, mensagens de commit, exceções) em `rules.md`, seção "Fim de tarefa: commit + push obrigatórios".

## Spec-Driven Development (Obrigatório)

Este projeto usa o **CLI real do [Spec Kit](https://github.com/github/spec-kit)** (instalado em `.specify/` desde 2026-08-26, integração Claude Code, skills `speckit-*` em `.claude/skills/`) como framework de desenvolvimento orientado por especificação. A constitution do projeto já está ratificada em `.specify/memory/constitution.md` (v1.0.0). Toda nova feature, bugfix, ou refatoração deve começar com a sequência de skills obrigatória (invocadas como `/speckit-nome`, com hífen — não `/speckit.nome`):

1. **`/speckit-specify`** — Defina requisitos formais, comportamentos esperados, invariantes e casos de limite **antes** de qualquer implementação
2. **`/speckit-tasks`** — Gere tarefas decompostas em dependência topológica (Setup → Foundational → Feature → Testing)
3. **`/speckit-implement`** — Execute tarefas na ordem, com contexto de especificação injetado em cada passo

**Por quê:** Este projeto começou em pré-código (`.specs/`); Spec Kit garante que toda implementação futura mantenha a rastreabilidade entre requisito-design-implementação, reduzindo ambiguidade e retrabalho.

**📖 Guia operacional completo:** Ver `SPECKIT.md` na raiz do repo para sequência exata, exemplos e troubleshooting.

**Combinação com outras skills:**

- **Ao especificar:** Nenhuma outra skill é acionada automaticamente — `tlc-spec-driven` (skill global) cobre o processo genérico, mas `specify` é sua materialização declarativa.
- **Ao gerar tarefas:** `/speckit-tasks` gera `tasks.md` a partir de `spec.md`/`plan.md` da feature — não usa outras skills para gerar; é puro sequenciamento de dependência.
- **Ao implementar (`/speckit-implement`):** Aqui SIM, acionam-se as skills relevantes conforme tipo de tarefa:
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

- `ecc:tdd-workflow` — É complementar a `speckit-implement`, não automático. Se a tarefa gerada por Spec Kit tiver critérios de aceitação testáveis, ative RED/GREEN/checkpoint via `ecc:tdd-workflow` dentro daquela tarefa.
- `superpowers:brainstorming`, `superpowers:test-driven-development` — Usados fora de Spec Kit, para exploração antes de `specify`.
- **Skills globais genéricas** (`ecc:frontend-patterns`, `ecc:error-handling`, etc.) — Use quando `speckit-implement` indicar a tarefa, não preventivamente.

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

### Referência visual (design)

Para **qualquer** tela (componente novo, restyle, ícone, espaçamento, cor, fonte, modal, estado de loading/vazio), a fonte de verdade visual **sempre** deve ser buscada via **MCP do Pencil** primeiro (`get_editor_state` com `include_schema: true`, depois `batch_get`/`get_screenshot`/`get_variables`/`snapshot_layout` sobre o nó da tela real em `design/CentriumCheckout.pen`) — nunca inferir/adivinhar o visual a partir do resto do código ou de bom senso genérico de design, e nunca parar só no export estático quando o MCP está disponível.

- `get_editor_state(include_schema: true)` primeiro, pra ter o schema do `.pen` e a lista de nós de topo (frames de tela, componentes reutilizáveis).
- `batch_get` com `nodeIds`/`patterns` (por nome do frame/nó) e `readDepth`/`searchDepth` altos o bastante pra trazer a árvore inteira da tela — inclusive estados que o export estático pode não deixar óbvios (ex.: variante "skeleton" de loading, como a "Entrada rápida de produto skeleton" encontrada ao lado da versão normal).
- `get_screenshot` do nó pra conferência visual antes e depois da implementação — é assim que se pega detalhe que só aparece no recorte renderizado (ex.: o botão de inserir da barra rápida é um retângulo 70×46 com `cornerRadius:100` — pílula, não círculo — algo fácil de ler errado só pelos valores brutos).
- `design/HTML - Pencil/CentriumCheckout.html` (export estático) continua útil como **referência secundária**/grep rápido entre muitas telas de uma vez (`data-pencil-name`, `data-icon-name`, `style` inline) — mas é um snapshot, pode ficar defasado; o MCP reflete o `.pen` real.
- Ícones: `data-icon-name="..."` (no export) / propriedade `icon` de nós `type: "icon"` (no MCP) com `library: "lucide"` — o nome bate 1:1 com o export de `lucide-react` (ex.: `pencil` → `Pencil`, `trash-2` → `Trash2`).
- Cor, raio, espaçamento: sempre mapeados para o token equivalente em `src/client/styles/global.css` (nunca hex solto no componente) — no MCP, variáveis do `.pen` (`$cb-blue`, `$surface-strong` etc.) já correspondem 1:1 aos tokens (`--primary`, `--secondary` etc.), consulte `get_variables` se a correspondência não for óbvia.

**Fontes (regra fixa, não inferir nem trocar sem necessidade):** o produto usa exatamente duas famílias, self-hospedadas via `@fontsource/inter` e `@fontsource/geist-mono` (`src/client/styles/global.css`, `@import` no topo do arquivo — sem CDN externo, coerente com "100% Docker" de `STACK.md`) — nunca confiar em `font-family: Inter` sem o peso carregado, porque sem o `@fontsource` importado a fonte nunca resolve e cai no fallback do sistema (Segoe UI no Windows), visualmente distinto do design.
- `font-sans` (Inter) → texto geral: labels, nomes, texto corrido. É o padrão do `body`, raramente precisa da classe explícita.
- `font-mono` (Geist Mono) → todo valor tabular/numérico: preço, quantidade, desconto, total, código de produto/barras, contadores de página. Nunca a mesma fonte para os dois grupos.
- Pesos já carregados: 400/500/600 para as duas famílias (`@import '@fontsource/inter/{400,500,600}.css'` e o equivalente para `geist-mono`) — se precisar de outro peso, adicione o `@import` correspondente, não deixe cair num peso não carregado.

**Por quê:** achado real da feature 003 (2026-09-02) — a grid do carrinho implementada divergia do Pencil em ícone (texto puro em vez de `Pencil`/`Trash2`) e em fonte (nem Inter nem Geist Mono estavam de fato carregadas, caindo no fallback do sistema) porque a implementação nunca consultou o export antes de escrever o componente; corrigido no mesmo dia instalando os dois `@fontsource` e mapeando os tokens. Elevado a "MCP do Pencil primeiro" depois que o modal de busca de produto (`ModalBuscaProduto.tsx`) foi corrigido usando o MCP direto — achou detalhe (proporção real do botão de inserir, variante de skeleton) que o export estático sozinho não deixava claro. Pedido explícito do usuário (2026-09-02) para fixar as duas checagens como obrigatórias e evitar repetição do mesmo problema.

### TypeScript LSP

Plugin `typescript-lsp` (listado em `docs/agents/fluxo-ia.md`) expõe a ferramenta `LSP`, com checagem de sintaxe/tipos TypeScript em tempo real. Use-a para navegação e verificação de código — `documentSymbol`, `goToDefinition`, `findReferences`, `hover`, `goToImplementation`, `prepareCallHierarchy`/`incomingCalls`/`outgoingCalls` — em vez de grep/leitura completa de arquivo, sempre que for localizar símbolos, checar referências ou confirmar tipos em arquivos `.ts`/`.tsx`. Não substitui o gate `typescript-strict` (`tsc`) obrigatório antes de `git push`.



# Fluxo Padrão de Desenvolvimento com IA

Como Bruno desenvolve com IA (Claude Code) neste e em outros projetos (ex.: `CentriumIA`). Documento de processo — não é specs de domínio (isso continua em `.specs/`, ver `domain.md`) nem regras de git (isso continua em `rules.md`).

## 0. Setup obrigatório antes de começar

### Plugins (escopo `user`, `~/.claude/settings.json` → `enabledPlugins`)

| Plugin | Papel |
|---|---|
| `engram@engram` | Memória persistente entre sessões (decisões, bugs, convenções) |
| `context7@claude-plugins-official` | Documentação atualizada de linguagem/biblioteca (evita basear-se em conhecimento desatualizado) |
| `typescript-lsp@claude-plugins-official` | Checagem de sintaxe/tipos TypeScript em tempo real |
| `ecc@ecc` (Everything Claude Code) | Pacote de agentes/skills; inclui o MCP `ecc:chrome-devtools`, usado para testes via Playwright |
| `superpowers@claude-plugins-official` | Processo (brainstorming, TDD, debugging sistemático, writing-plans) |
| `mattpocock-skills@claude-plugins-official` | Inclui a skill `grilling` ("grill-me") |
| `ui-ux-pro-max@ui-ux-pro-max-skill` | Base de estilos, paletas e ícones para UI |

Confirmados instalados nos dois repos auditados (`CentriumCheckout` e `CentriumIA`).

**Github Spec Kit** não é um plugin de marketplace — é instalado por projeto via `specify init` (CLI oficial, `uvx --from git+https://github.com/github/spec-kit.git specify init --here`), que cria `.specify/` e as skills `speckit-*`: `/speckit-constitution` → `/speckit-specify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`, documentados em `SPECKIT.md` na raiz de cada repo. Confirmado instalado desta forma em `CentriumCheckout` desde 2026-08-26; verificar se `CentriumIA` já recebeu a mesma instalação antes de assumir paridade.

**Mapeamento de docs/contexto:** "graperoot" = MCP local **`dual-graph`** (`.dual-graph/` por projeto, política descrita no próprio `CLAUDE.md`) — confirmado pelo usuário em 2026-08-25.

### Skills obrigatórias (confirmadas na lista de skills desta sessão)

- `ui-ux-pro-max` — design de UI/UX, paletas, tipografia, ícones
- `superpowers` (em especial `brainstorming`, `systematic-debugging`, `test-driven-development`, `writing-plans`)
- `mattpocock-skills` (em especial `grilling` — o "grill-me")
- `ecc` (Everything Claude Code) — dezenas de skills de stack/review/testes, acionadas conforme o tipo de tarefa
- `owasp-security` — instalada em escopo `user` (`~/.claude/commands/owasp-security/SKILL.md`); obrigatória antes de qualquer deploy em produção
- `tlc-spec-driven` — planejamento SDD adaptativo (Specify → Design → Tasks → Execute), stack-agnóstico. Origem: [skills.rest/skill/tlc-spec-driven](https://skills.rest/skill/tlc-spec-driven)

## 1. Sequência de trabalho

1. **Mapear necessidades** — visão geral, stack, restrições do projeto.
2. **Dividir as pastas no padrão SDD** — usar em todo projeto novo:

   ```
   .specs/
   ├── project/                       PROJECT · ROADMAP · STATE (ADR log AD-NNN) · PENDENCIES
   ├── codebase/                      ARCHITECTURE · STACK · INTEGRATIONS · CONCERNS
   ├── features/<feature-slug>/       spec.md (+ design.md/tasks.md em projetos "Spec-Anchored")
   └── quick/                         notas rápidas, ainda não agrupadas
   ```

   Estrutura idêntica confirmada em `CentriumCheckout` e `CentriumIA`. O `CentriumIA` opera em modo **Spec-Anchored** (nenhum Execute sem `spec.md` + `tasks.md` aprovados) — vale considerar o mesmo grau de rigor para features de maior risco.

3. **Escrever requisitos** combinando `tlc-spec-driven` (fases Specify → Design → Tasks → Execute) com as skills do Spec Kit (`/speckit-specify` → `/speckit-tasks` → `/speckit-implement`).
4. **Revisar antes de implementar:**
   - `mattpocock-skills:grilling` ("grill-me") — estressar o plano/decisão com perguntas difíceis antes de codar
   - `superpowers:brainstorming` — explorar intenção, requisitos e alternativas de design
5. **Implementar** (`/speckit-implement`), acionando as skills de domínio pertinentes por tipo de tarefa (componente → skill de framework/review, lógica sensível → skill dedicada, etc. — ver exemplo já registrado no `CLAUDE.md` deste repo).
6. **Gates finais** antes de merge/deploy: type-check limpo, `owasp-security` antes de qualquer produção.

## 2. Padrões técnicos por default

Válidos para todo projeto novo, salvo decisão registrada em contrário (ADR/`STATE.md`):

- **Linguagem:** TypeScript
- **Banco de dados:** PostgreSQL
- **Infraestrutura:** Docker Swarm
- **Ícones:** **Lucide** (`lucide-react`), stroke 1.5–2px, sem emoji — padrão explícito em `CentriumIA` (`CLAUDE.md`, regra de design nº 5) e confirmado como dependência real em `apps/web/package.json`
- **Design de UI:** arquivo `.pen` (via Pencil MCP, nunca `Read`/`Edit` direto — é encriptado) como fonte de verdade visual, com export HTML/CSS/JS versionado como espelho textual de implementação. Presente também neste repo (`design/CentriumCheckout.pen`).

## 3. CI/CD e Git

Regra padrão em todo projeto (detalhe completo em `rules.md` — este documento só resume, `rules.md` é a fonte de verdade):

- **Nunca commitar direto em `main`/`master`.** Toda alteração (feature, fix, doc, chore) acontece em branch dedicada, nomeada pela natureza da mudança (ex.: `docs/fluxo-ia`, `feat/carrinho-precificacao`).
- **Branch/worktree por tarefa.** Antes de tocar em qualquer arquivo para uma tarefa nova, verificar a branch/worktree atual; se estiver em `main`/`master` (ou numa branch de outra tarefa), criar branch e **worktree dedicado** antes de editar (`git worktree add ../<repo>-<tarefa> -b <tipo>/<tarefa>`) — evita perder estado não commitado ao trabalhar em paralelo. Ver skill `superpowers:using-git-worktrees`.
- **Commit + push obrigatórios ao final de cada tarefa.** Ao concluir uma tarefa coerente (não a cada edição individual de arquivo), sempre `git commit` + `git push` na branch da tarefa, sem esperar o usuário pedir — nunca deixar trabalho concluído sem commit.
- **Merge só via PR revisado**, nunca push direto para `main`/`master`, mesmo por conveniência.

## 4. Reaproveitamento observado em `C:\CentriumIA`

Monorepo `pnpm` + Turborepo (`apps/`, `packages/`, `services/`).

| Área | Tecnologia confirmada |
|---|---|
| Frontend | Next.js 15 + React 19 |
| Banco de dados | Prisma 5.22 + PostgreSQL (`@testcontainers/postgresql` para testes) |
| Testes | Vitest |
| Gráficos/relatórios | `recharts`, `@react-pdf/renderer`, `sharp` |
| Outros | `lucide-react` (ícones), `openai` SDK, `node-cron` |
| Lint/config compartilhado | `packages/config` (eslint, tsconfig, vitest) |

**Skill de projeto reaproveitável encontrada:** `kpi-dashboard-design` (`.claude/skills/kpi-dashboard-design/SKILL.md`, escopo local do projeto) — orienta seleção de KPIs, layout de dashboard executivo e escolha de gráfico. Único skill de projeto além das globais/plugins; candidata a copiar para outros projetos que precisem de dashboards de KPI.

**Convenções de processo do `CentriumIA` que vale considerar adotar aqui também:**
- **API First:** todo endpoint/contrato nasce como OpenAPI 3.1 (rotas HTTP) ou tipos TypeScript (módulos internos) antes de código; frontend consome mocks (MSW) antes do backend pronto.
- **Documentação de código:** JSDoc obrigatório em todo símbolo exportado; cada `packages/*` tem `README.md` com propósito, exports públicos e como rodar testes.
- **Resolução obrigatória de issues de revisão:** toda issue de review (qualquer severidade) termina Corrigida ou Won't-fix documentado (com justificativa em `STATE.md`/`tasks.md`) antes de avançar de task.
- **Git é mais permissivo que aqui:** commit + push imediato após qualquer alteração, sem abrir PR automaticamente (aguarda pedido explícito). Este repo (`CentriumCheckout`) já é mais rígido — exige branch/worktree dedicado por tarefa e merge só via PR revisado (`rules.md`).

## Pendências

Nenhuma no momento — as duas dúvidas anteriores (identidade de "graperoot" e origem do `tlc-spec-driven`) foram confirmadas pelo usuário em 2026-08-25.

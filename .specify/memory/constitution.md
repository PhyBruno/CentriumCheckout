<!--
Sync Impact Report
- Version change: 1.0.0 → 1.0.1 (patch: wording clarification, no principle redefinition)
- Modified principles: none
- Modified sections: Development Workflow — "Branch/worktree por alteração" item rewritten to
  remove `git worktree` entirely; user decision 2026-08-31 discontinues worktree usage, all work
  (including parallel task isolation) now uses a plain dedicated branch in the same working
  directory. Removes the prior distinction between "início de tarefa nova" (worktree required)
  and "continuação de trabalho em andamento" (plain branch allowed) — that distinction no longer
  applies since both cases now use a plain branch.
- Added sections: none
- Removed sections: none
- Templates requiring follow-up: none — no template references worktree
- Deferred placeholders: none
-->

# CentriumCheckout Constitution

## Core Principles

### I. Spec-Driven Development (NON-NEGOTIABLE)
Toda feature, bugfix, refatoração ou mudança de dependência MUST começar pela sequência
`/speckit-specify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`, sem exceção.
Nenhum código de aplicação é escrito antes de existir uma especificação correspondente.
Especificações de produto e domínio vivem em `.specs/` (`project/`, `codebase/`, `features/`);
os artefatos do fluxo Spec Kit (spec/plan/tasks por feature) vivem em `.specify/`. Rastreabilidade
requisito → design → implementação é obrigatória e não pode ser reconstruída retroativamente.
**Rationale:** o projeto começou em pré-código deliberadamente para evitar ambiguidade e
retrabalho; pular a especificação anula essa garantia.

### II. Arquitetura SOLID (NON-NEGOTIABLE)
Todo código MUST respeitar Single Responsibility, Open/Closed, Liskov Substitution, Interface
Segregation e Dependency Inversion (decisão arquitetural AD-085, `.specs/project/STATE.md`).
Um componente, hook, store ou módulo com mais de uma razão para mudar MUST ser decomposto antes
do merge. **Rationale:** 100% do código deste projeto é gerado por IA sem histórico de
manutenção humana prévia; SOLID é o mecanismo de contenção contra acoplamento acidental que um
gerador de código introduz sem essa disciplina.

### III. ERP como Fonte Única de Verdade
O Checkout NUNCA duplica, cacheia com autoridade, ou reimplementa lógica de negócio que pertence
ao ERP Centrium (produtos, clientes, pagamentos, emissão de NFCe). O Checkout MUST se limitar a
orquestrar a venda e calcular precificação em tempo real. Persistência local é restrita a cache
de leitura (TanStack Query) e bootstrap do tenant (Dexie/IndexedDB) — nunca a estado de venda
que sobreviva além da sessão do navegador. **Rationale:** duplicar fonte de verdade cria
divergência entre Checkout e ERP, que é a causa mais cara de bug neste domínio (venda fiscal).

### IV. Tipagem Estrita e Validação de Fronteira
TypeScript `strict` é obrigatório em todo o código; `any`, `as` e `!` não justificados MUST ser
tratados como erro de review, não como estilo. Toda entrada de dado externo — resposta da API do
ERP, query params de sessão, formulários do operador — MUST ser validada com Zod na fronteira
antes de entrar no domínio da aplicação. **Rationale:** com 100% do código gerado por IA, o
maior risco não é bug de lógica, é alucinação de contrato de API; tipagem forte + validação de
fronteira é a mitigação declarada em `.specs/project/PROJECT.md`.

### V. Precisão Monetária Inegociável
Nenhum cálculo de preço, desconto, imposto ou pagamento MUST usar aritmética de ponto flutuante
sem tratamento explícito de precisão. Toda regra de precificação (incluindo faixas de
quantidade) MUST ser auditável e coberta por teste antes de ser considerada concluída.
**Rationale:** erro de centavo em NFCe é discrepância fiscal, não apenas bug de UI — o custo de
falha aqui é regulatório, não cosmético.

### VI. Sem Estado de Venda Persistido no Cliente
O estado da venda em andamento (Zustand + Immer) MUST permanecer em memória, sem `persist`; um
F5 durante a venda MUST exigir confirmação explícita do operador (beforeunload) e não deve
recuperar silenciosamente um carrinho parcial divergente do ERP. Integrações de TEF e impressão
MUST rodar fora do container, na máquina do PDV, nunca no processo do frontend web.
**Rationale:** decisão arquitetural deliberada para impedir que o Checkout finalize uma venda a
partir de um estado local que já divergiu do que o ERP tem como verdade.

## Additional Constraints

- **Containerização total:** a aplicação MUST rodar 100% via Docker tanto em desenvolvimento
  quanto em produção (`.specs/codebase/ARCHITECTURE.md`).
- **Sem backend próprio de domínio:** o Checkout consome a API do ERP diretamente; a única
  exceção permitida é um BFF mínimo de sessão/autenticação (AD-022), que MUST NOT crescer para
  conter lógica de negócio.
- **Stack fixada:** React + Vite, TypeScript `strict`, Zustand + Immer, TanStack Query, Zod,
  Dexie apenas para bootstrap, shadcn/ui + Boneyard + Goey Toast — mudanças de stack MUST passar
  por uma nova especificação (`/speckit-specify`), não por decisão ad hoc durante implementação.
- **Correção de decisão superada em `.specs/`:** nunca anexar a correção apenas ao final do
  parágrafo original — reescrever ou sinalizar no ponto onde o leitor encontraria a informação
  desatualizada (ver `docs/agents/domain.md`).

## Development Workflow

- **Branch por alteração:** toda mudança (feature, fix, doc, chore) MUST acontecer em branch
  dedicada, no mesmo diretório de trabalho; nunca commit direto em `master`. Isolamento de
  trabalho em paralelo (múltiplas tarefas simultâneas) também usa branch simples — `git worktree`
  MUST NOT ser usado (descontinuado por decisão do usuário em 2026-08-31).
- **Merge via PR revisado:** merge em `master` só ocorre via PR revisado, nunca via push direto,
  mesmo quando tecnicamente possível.
- **Commit + push obrigatórios ao fim de tarefa:** ao concluir uma tarefa coerente, commitar e
  dar push na branch da tarefa sem esperar o usuário pedir. Mudanças não relacionadas
  encontradas no working tree MUST ficar fora do commit da tarefa atual.
- **Mensagens de commit:** padrão `<tipo>: <descrição>` (`docs:`, `chore:`, `feat:`, `fix:`),
  referenciando o AD-NNN relevante quando a mudança decorre de uma decisão em
  `.specs/project/STATE.md`.
- **Gates obrigatórios antes de push/merge:** `typescript-strict` (`npx tsc --noEmit`) antes de
  qualquer push; `/owasp-security` obrigatório antes de merge a `main`/deploy em produção/push de
  imagem para registry de produção/migração de banco em produção.

## Governance

Esta constitution tem precedência sobre convenções informais documentadas em `CLAUDE.md` e
`rules.md` sempre que houver conflito direto; nos demais casos, `CLAUDE.md` e `rules.md`
continuam como referência operacional detalhada, e esta constitution como o conjunto mínimo
inegociável.

**Emendas:** qualquer mudança de princípio MUST passar por `/speckit-constitution` novamente,
nunca por edição manual direta do arquivo. Versionamento semântico:
- **MAJOR:** remoção ou redefinição incompatível de princípio existente.
- **MINOR:** novo princípio ou seção adicionada, ou expansão material de princípio existente.
- **PATCH:** esclarecimento de redação, correção de erro, refinamento não semântico.

**Conformidade:** todo PR MUST verificar aderência aos princípios acima antes de aprovação;
complexidade que viole um princípio MUST ser justificada explicitamente na descrição do PR ou
recusada. Uso de `CLAUDE.md` para orientação operacional de desenvolvimento no dia a dia
permanece válido e é o lugar onde esta constitution é referenciada.

**Version**: 1.0.1 | **Ratified**: 2026-08-26 | **Last Amended**: 2026-08-31

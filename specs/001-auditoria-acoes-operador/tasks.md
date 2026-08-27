---

description: "Task list template for feature implementation"
---

# Tasks: Auditoria de Ações do Operador

**Input**: Design documents from `/specs/001-auditoria-acoes-operador/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/auditoria-events.md, quickstart.md (todos presentes)

**Tests**: Solicitados explicitamente pela seção "Testing" do `plan.md` (Vitest + Testing Library) e pela "Project Structure" (`tests/unit/domain/auditoria/`) — incluídos abaixo.

**Organization**: Tarefas agrupadas por user story (ambas Priority: P1 em `spec.md`, na ordem em que aparecem na spec) para permitir implementação e teste independentes.

## Escopo desta feature (importante)

Este plano é dono apenas do **slice de auditoria**, da **união de tipos de evento** e da **serialização para o campo `Log`** (ver `plan.md`, "Structure Decision"). Os pontos de disparo (`registrarEventoAuditoria(...)`) dentro das features de negócio consumidoras — 003 (carrinho), 004 (finalização/suspensão), 005 (cliente), 008 (pagamento), 012 (vendedor) — **não são tarefas deste `tasks.md`**; são implementados pelos planos dessas features, referenciando o contrato em `contracts/auditoria-events.md`. Por isso os "Independent Test" abaixo são testes unitários do módulo em si, não os cenários ponta a ponta de `quickstart.md` (que só podem ser validados depois que as features consumidoras existirem).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência de tarefas incompletas)
- **[Story]**: A qual user story a tarefa pertence (US1, US2)
- Caminhos de arquivo exatos incluídos em cada descrição

## Path Conventions

Conforme `plan.md`, "Project Structure":

- `src/client/stores/vendaStore.ts` — store combinado (Zustand+Immer) da venda em andamento
- `src/client/stores/slices/auditoriaSlice.ts` — slice desta feature
- `src/client/domain/auditoria/eventos.ts` — união discriminada + factory functions
- `src/client/domain/auditoria/serializarLog.ts` — serialização para o campo `Log`
- `tests/unit/domain/auditoria/` — testes unitários

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Inicialização da estrutura de diretórios desta feature

- [ ] T001 Criar estrutura de diretórios: `src/client/stores/`, `src/client/stores/slices/`, `src/client/domain/auditoria/`, `tests/unit/domain/auditoria/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Tipos base, store combinado e mecanismo de registro/reinício do slice — necessários para as duas user stories

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase estar completa

- [ ] T002 [P] Definir tipos base `EventoAuditoriaBase<TTipo, TDetalhes>`, `EventoAuditoriaSemTimestamp`, `HistoricoAuditoriaVenda` e o evento `VENDA_INICIADA` (`{ origem: 'NOVA' | 'RASCUNHO' | 'DAV' }`) + sua factory function em `src/client/domain/auditoria/eventos.ts`
- [ ] T003 [P] Criar `vendaStore.ts` combinando slice creators via Zustand+Immer `create()`, sem `persist` (AD-006), pronto para ser estendido pelas features 003/004/005/008/012 com seus próprios slices, em `src/client/stores/vendaStore.ts`
- [ ] T004 Implementar `auditoriaSlice.ts`: estado `eventos: EventoAuditoria[]`, `registrarEventoAuditoria(evento)` (atribui `new Date().toISOString()` e faz `push`), `resetarAuditoria(origem)` (zera o array e já registra `VENDA_INICIADA`) em `src/client/stores/slices/auditoriaSlice.ts` (depende de T002, T003)
- [ ] T005 Teste unitário de `VENDA_INICIADA` + `resetarAuditoria`: array zerado, evento inicial correto por `origem`, `timestamp` ISO 8601, nunca herda histórico de sessão anterior (FR-008) em `tests/unit/domain/auditoria/eventos.spec.ts` (depende de T004)

**Checkpoint**: Slice base pronto — eventos podem ser registrados e uma sessão de venda pode ser iniciada/reiniciada.

---

## Phase 3: User Story 1 - Registrar evento a cada ação relevante da venda (Priority: P1) 🎯 MVP

**Goal**: Dispatcher tipado + as 13 factory functions de eventos de ação (cliente, vendedor, produto, pagamento) que as features de negócio (003, 005, 008, 012) vão consumir via `registrarEventoAuditoria`.

**Independent Test**: Para cada tipo de evento de ação, chamar a factory correspondente e `registrarEventoAuditoria`, e verificar no array do slice o `tipo`, o shape de `detalhes` e o `timestamp` ISO 8601 estritamente crescente — testável sem depender das features consumidoras (003/005/008/012) ainda não implementadas.

### Implementation for User Story 1

- [ ] T006 [US1] Implementar factories de cliente/vendedor em `eventos.ts`: `CLIENTE_SELECIONADO`, `CLIENTE_CRIADO`, `CLIENTE_TROCADO`, `VENDEDOR_SELECIONADO`, `VENDEDOR_TROCADO` em `src/client/domain/auditoria/eventos.ts` (depende de T002)
- [ ] T007 [US1] Implementar factories de produto em `eventos.ts`: `PRODUTO_INSERIDO`, `PRODUTO_ALTERADO`, `PRODUTO_CANCELADO` — `precoUnitario`/`desconto`/`valorAnterior`/`valorNovo` em centavos inteiros, sem recálculo (Constitution V) em `src/client/domain/auditoria/eventos.ts` (depende de T006, mesmo arquivo)
- [ ] T008 [US1] Implementar factories de pagamento em `eventos.ts`: `CONDICAO_PAGAMENTO_APLICADA`, `FORMA_PAGAMENTO_APLICADA`, `FORMA_PAGAMENTO_REMOVIDA`, `VALE_DEVOLUCAO_USADO`, `PAGAMENTO_RECUSADO` em `src/client/domain/auditoria/eventos.ts` (depende de T007, mesmo arquivo)
- [ ] T009 [US1] Teste unitário dos 13 tipos de evento de ação (shape de `detalhes` por tipo, `timestamp` ISO 8601, push via `registrarEventoAuditoria`) em `tests/unit/domain/auditoria/eventos.spec.ts` (depende de T008 e T005, mesmo arquivo)

**Checkpoint**: User Story 1 completa e testável de forma independente — todos os 13 tipos de evento de ação disponíveis para as features consumidoras.

---

## Phase 4: User Story 2 - Entregar o histórico da venda ao ERP na finalização/suspensão (Priority: P1)

**Goal**: Eventos terminais (`FATURAMENTO_FALHOU`, `VENDA_FINALIZADA`, `VENDA_SUSPENSA`), descarte pós-sucesso e serialização do array para o campo `Log`, consumidos pela feature 004 ao montar o payload de `FaturarNFCe`.

**Independent Test**: Acumular eventos arbitrários no slice (via factories da Fase 2/3 ou eventos sintéticos de teste), simular a sequência de finalização, e verificar que `serializarLogAuditoria` produz uma string JSON round-trip parseável terminando em `VENDA_FINALIZADA`/`VENDA_SUSPENSA`; simular falha de rede e confirmar que `descartarAuditoria` não é chamado e que a próxima serialização inclui o `FATURAMENTO_FALHOU` da tentativa anterior (FR-006/FR-007).

### Implementation for User Story 2

- [ ] T010 [US2] Implementar factories de finalização em `eventos.ts`: `FATURAMENTO_FALHOU` (`{ operacao: 'FATURAR' | 'SUSPENDER' }`), `VENDA_FINALIZADA`, `VENDA_SUSPENSA` em `src/client/domain/auditoria/eventos.ts` (depende de T008, mesmo arquivo)
- [ ] T011 [US2] Implementar `descartarAuditoria()` (esvazia o array sem registrar evento; só deve ser chamado após entrega bem-sucedida ao ERP) em `src/client/stores/slices/auditoriaSlice.ts` (depende de T004)
- [ ] T012 [P] [US2] Implementar `serializarLogAuditoria(eventos)` (`JSON.stringify` puro, sem dependência do slice) em `src/client/domain/auditoria/serializarLog.ts`
- [ ] T013 [US2] Teste unitário dos 3 tipos de evento de finalização em `tests/unit/domain/auditoria/eventos.spec.ts` (depende de T010 e T009, mesmo arquivo)
- [ ] T014 [US2] Teste de integração em `tests/unit/domain/auditoria/serializarLog.spec.ts`: ordem cronológica estritamente crescente, round-trip `JSON.stringify`/`JSON.parse`, e cenário de reenvio após `FATURAMENTO_FALHOU` sem reset do array (FR-006/FR-007, AUDIT-09) (depende de T011, T012)

**Checkpoint**: User Story 2 completa — histórico pronto para ser consumido pela feature 004 no payload de `FaturarNFCe`.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Verificações finais que atravessam as duas user stories

- [ ] T015 [P] Rodar a suíte completa (`eventos.spec.ts` + `serializarLog.spec.ts`) e confirmar compilação limpa em TypeScript `strict` (sem `any`)
- [ ] T016 Revisão de responsabilidade única (Constitution II/SOLID): confirmar que `auditoriaSlice.ts`/`eventos.ts` não contêm regra de negócio de cliente/vendedor/produto/pagamento — só recebem `detalhes` já normalizados
- [ ] T017 Registrar como pendência de integração a execução dos Cenários 1–4 de `quickstart.md`, que só podem ser validados ponta a ponta depois que as features consumidoras (003/004/005/008/012) implementarem seus próprios call sites de `registrarEventoAuditoria` — não bloqueia o fechamento desta feature (FR-009, mecanismo sem tela própria)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Sem dependências — pode começar imediatamente
- **Foundational (Phase 2)**: Depende da conclusão do Setup — BLOQUEIA as duas user stories
- **User Story 1 (Phase 3)**: Depende da conclusão da Fase 2 (usa `EventoAuditoriaBase` de T002 e `registrarEventoAuditoria` de T004)
- **User Story 2 (Phase 4)**: Depende da conclusão da Fase 2; T010 depende de T008 (mesmo arquivo `eventos.ts`, mas nenhuma factory de US2 depende do *conteúdo* das factories de US1 — só da ordem de edição do arquivo compartilhado)
- **Polish (Phase 5)**: Depende de todas as user stories desejadas estarem completas

### User Story Dependencies

- **User Story 1 (P1)**: Pode começar após a Fase 2 — sem dependência funcional de US2
- **User Story 2 (P1)**: Pode começar após a Fase 2 — funcionalmente independente de US1 (a serialização funciona sobre qualquer array de eventos, inclusive vazio); a dependência T010→T008 é só de arquivo compartilhado (`eventos.ts`), não de acoplamento de lógica

### Dentro de cada User Story

- Factories antes dos testes que as cobrem
- `eventos.ts` é editado sequencialmente entre T002 → T006 → T007 → T008 → T010 (mesmo arquivo, sem paralelismo entre essas tarefas)
- `eventos.spec.ts` é editado sequencialmente entre T005 → T009 → T013 (mesmo arquivo)
- `serializarLog.ts`/`serializarLog.spec.ts` são arquivos próprios, paralelizáveis entre si e com o restante de US2

### Parallel Opportunities

- T002 e T003 podem rodar em paralelo (arquivos diferentes, sem dependência mútua)
- T012 (`serializarLog.ts`) pode rodar em paralelo com T010/T011 (arquivos diferentes)
- T015 (rodar suíte de testes) pode rodar em paralelo com T016 (revisão de código) na fase de Polish

---

## Parallel Example: Foundational

```bash
# Lançar T002 e T003 juntos (arquivos diferentes, sem dependência mútua):
Task: "Definir tipos base e evento VENDA_INICIADA em src/client/domain/auditoria/eventos.ts"
Task: "Criar vendaStore.ts combinando slice creators em src/client/stores/vendaStore.ts"
```

## Parallel Example: User Story 2

```bash
# Lançar T012 em paralelo com T010/T011 (arquivo próprio, sem dependência):
Task: "Implementar serializarLogAuditoria() em src/client/domain/auditoria/serializarLog.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Completar Fase 1: Setup
2. Completar Fase 2: Foundational (CRITICAL — bloqueia as duas stories)
3. Completar Fase 3: User Story 1
4. **PARAR e VALIDAR**: rodar `eventos.spec.ts` e confirmar os 14 tipos de evento (1 foundational + 13 de ação) cobertos
5. Nesse ponto, as features 005/008/012 já podem começar a integrar seus call sites de `registrarEventoAuditoria`, mesmo antes de US2 estar pronta

### Incremental Delivery

1. Setup + Foundational → base do slice pronta
2. Adicionar User Story 1 → testar isoladamente → factories de ação disponíveis para 003/005/008/012
3. Adicionar User Story 2 → testar isoladamente → serialização para `Log` disponível para a feature 004
4. Cada story soma valor sem quebrar a anterior — não há acoplamento funcional entre US1 e US2, só compartilhamento de arquivo (`eventos.ts`/`eventos.spec.ts`)

### Nota sobre integração com outras features

Este `tasks.md` fecha no módulo de domínio + slice. A validação ponta a ponta (Cenários 1–4 de `quickstart.md`) só é possível depois que as features 003, 004, 005, 008 e 012 tiverem implementado seus próprios call sites de `registrarEventoAuditoria`, referenciando `contracts/auditoria-events.md` — acompanhar via T017.

---

## Notes

- `[P]` = arquivos diferentes, sem dependência entre si
- `[Story]` mapeia a tarefa à user story correspondente para rastreabilidade
- Sem Zod nesta feature — nenhum dado cruza fronteira externa entrando na aplicação (ver `data-model.md`, "Validação")
- Sem TanStack Query nem Dexie — não há dado de servidor a cachear nem configuração de tenant (ver `plan.md`, "Primary Dependencies")
- Nenhuma tela própria (FR-009) — não há tarefas de UI/componente React nesta feature

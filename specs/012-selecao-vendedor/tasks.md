---

description: "Task list template for feature implementation"
---

# Tasks: Seleção de Vendedor

**Input**: Design documents from `specs/012-selecao-vendedor/` (`plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/erp-vendedor-api.md`, `contracts/vendedor-domain-api.md`, `quickstart.md`)

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: Incluídos — `plan.md` § Testing e `quickstart.md` definem 2 camadas explícitas (integração do slice, E2E). Sem camada de domínio puro: esta feature não tem nenhuma função computável isolada (`plan.md` § Structure Decision).

**Organization**: Uma única user story (US1, P1) — não há segunda story nesta spec.

**⚠️ Ordem de implementação e dependências cruzadas**: esta feature depende de **002** (scaffolding + proxy autenticado `/api/erp/*` + `SessaoUsuario` em Dexie) e **001** (`vendaStore.ts`, slice `auditoria`, `registrarEventoAuditoria`, mesmo call site de `resetarAuditoria` que passa a chamar `inicializarVendedorPadrao`). A integração com **008** (`podeMutarCarrinho()`, injetado na composição do `vendaStore`) é consumida por contrato de injeção (Dependency Inversion) — `vendedorSlice` nunca importa `pagamentoSlice`/`carrinhoSlice`/`clienteSlice`. A action pública `trocarVendedor` é consumida por **011** (retomada de rascunho via `CarregarNFCe`, MUST passar `origem: 'RASCUNHO'` explicitamente — `004` não chama `CarregarNFCe`, não é consumidora desta action) e por **006** (importação de DAV, que já reservou a chamada de 2 argumentos em `specs/006-importacao-dav/contracts/importacao-domain-api.md` — continua válida porque `origem` é opcional com default `'DAV'`) — os call sites que invocam `trocarVendedor` a partir desses fluxos são responsabilidade das fases Design/Tasks dessas features, **fora do escopo** deste `tasks.md` (`plan.md` § Scale/Scope). O call site de 011 já está escrito (`specs/011-recuperacao-nfce/tasks.md` T022, correção 2026-09-01 da auditoria de lacunas). A verificação end-to-end de que `CheckoutFaturarNFCe` envia `vendedorCodigo` corretamente (T015) depende do payload de finalização já implementado pela feature 004; o **bloqueio do botão "Finalizar" quando `vendedorAtual === null`** (`FR-006`, `SC-003`) é, pelo mesmo motivo, responsabilidade da feature 004 — este `tasks.md` só garante que o estado (`vendedorAtual`) fica correto para essa feature consumir.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência de tarefas incompletas)
- **[Story]**: A qual user story a tarefa pertence (US1)
- Caminhos de arquivo exatos em cada descrição

## Path Conventions

Extensão da árvore já proposta pela feature 002 (ver `plan.md` § Structure Decision — sexta feature a estendê-la):

```text
src/client/stores/slices/       # vendedorSlice.ts, combinado em vendaStore.ts (feature 001)
src/client/services/vendedor/   # vendedorQueries.ts
src/client/features/vendedor/   # ModalBuscaVendedor.tsx, CampoVendedorVenda.tsx
src/shared/schemas/             # vendedor.schema.ts
tests/integration/ | tests/e2e/
```

**⚠️ Consulta ao Pencil MCP obrigatória para tarefas de UI (CLAUDE.md § "Referência visual (design)")**: toda tarefa desta lista que cria ou altera saída visual (tela, componente, modal, layout, ícone, estado de loading/vazio) está marcada abaixo com "consultar o Pencil MCP antes de implementar" — a fonte de verdade do visual é sempre o Pencil MCP (`get_editor_state(include_schema:true)` → `batch_get`/`get_screenshot`/`get_variables`/`snapshot_layout` sobre o nó real da tela em `design/CentriumCheckout.pen`), nunca o código existente nem senso genérico de design. Tarefas afetadas: T013, T014.

---

## Phase 1: Setup

**Purpose**: Criar os diretórios específicos desta feature sobre a árvore já existente (002/001).

- [X] T001 Criar estrutura de diretórios desta feature: `src/client/services/vendedor/`, `src/client/features/vendedor/` (`src/client/stores/slices/` e `src/shared/schemas/` já existem, criados pelas features 001/002)

**Checkpoint**: Diretórios prontos — depende de `src/client/` já existir (Fase 1 da 002) e `src/client/stores/vendaStore.ts` já existir (Foundational da 001).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema de fronteira e o núcleo do slice (estado + pré-seleção do default) — usados pela única user story.

**⚠️ CRITICAL**: A user story não pode começar até esta fase terminar.

- [X] T002 [P] Implementar `src/shared/schemas/vendedor.schema.ts` (Zod): `CheckoutListaVendedores { PaginaAtual, RegistrosPorPagina, TotalRegistros, TotalPaginas, Vendedores: VendedoresItem[] }` e `VendedoresItem { VendedorCodigo, VendedorNome, VendedorCGC, VendedorFone }` — exatamente os campos de `contracts/erp-vendedor-api.md` (confirmado contra `Fluxograma - Diagrama - Alinhamentos/ApiCentriumOAuth.yaml`, schema `CheckoutListaVendedores.Vendedores_Vendedores`), sem inventar `Ativo`/`Status`/campo de função (AD-103)
- [X] T003 Implementar núcleo de `src/client/stores/slices/vendedorSlice.ts`: estado `VendedorState { vendedorAtual: VendedorVenda | null; houveEscolhaExplicita: boolean }` (`data-model.md` §2) + `inicializarVendedorPadrao(sessaoUsuario)` — lê `SessaoUsuario.VendedorCodigo`/`VendedorNome` **sem chamada de rede**; `vendedorAtual = null` quando `VendedorCodigo` vazio (`FR-006`/`VEND-07`); chamado uma única vez no mesmo call site de `resetarAuditoria`/`inicializarClientePadrao` (features 001/005); combinado em `vendaStore.ts` — depende de T002
- [X] T004 [P] Integration test `tests/integration/vendedorSlice.spec.ts`: `inicializarVendedorPadrao({ VendedorCodigo: 7, VendedorNome: 'Fulano' })` produz `vendedorAtual = { codigo: 7, nome: 'Fulano', origem: 'DEFAULT' }`, nenhum evento de auditoria, nenhuma chamada a `GetListaVendedores`; `VendedorCodigo` vazio/zero → `vendedorAtual === null` — `FR-005`, `FR-006`, `research.md` D3
- [X] T005 [P] Integration test `tests/integration/vendedorSlice.spec.ts`: `inicializarVendedorPadrao({ VendedorCodigo: 7, VendedorNome: 'Fulano', UsuarioCodigo: 99 })` (operador logado com código diferente do vendedor) produz `vendedorAtual.codigo === 7`, nunca `99` — confirma por teste, não só por design de tipo, que `VendedorVenda` nunca deriva de `UsuarioCodigo` — `FR-008`, `SC-001`, `data-model.md` I6

**Checkpoint**: Schema e núcleo do slice prontos — a user story ainda não expõe UI nem ações de seleção/troca.

---

## Phase 3: User Story 1 - Selecionar o vendedor que atendeu o cliente final (Priority: P1) 🎯 MVP

**Goal**: Operador busca e seleciona o vendedor que atendeu o cliente final (distinto do operador logado); a venda registra esse vendedor na finalização; a troca com carrinho populado é permitida até haver pagamento aprovado.

**Independent Test**: Buscar um vendedor por nome parcial, selecioná-lo, finalizar a venda e confirmar que o vendedor registrado é o selecionado, não o operador autenticado; confirmar que uma venda recém-iniciada, sem interação com a busca, já começa com um vendedor associado.

### Tests for User Story 1

- [X] T006 [P] [US1] Integration test `tests/integration/vendedorSlice.spec.ts`: `selecionarVendedor({ codigo: 10, nome: 'Ciclana' })` numa venda nova (sem escolha explícita anterior) dispara `VENDEDOR_SELECIONADO` com `{ codigoVendedor: 10, nome: 'Ciclana' }` — `data-model.md` §4, `research.md` D6
- [X] T007 [P] [US1] Integration test `tests/integration/vendedorSlice.spec.ts`: com carrinho **já populado** (≥1 linha ativa) e `podeMutarCarrinho()` retornando `true`, selecionar um vendedor, depois `selecionarVendedor` de um segundo vendedor dispara `VENDEDOR_TROCADO` com `{ codigoVendedorAnterior, codigoVendedorNovo }`, sem reprecificar nenhuma linha (diferente de cliente/`TipoPreco=9`) — `FR-012`, `data-model.md` §4, `research.md` D6, `plan.md` Constraints
- [X] T008 [P] [US1] Integration test `tests/integration/vendedorSlice.spec.ts`: com `podeMutarCarrinho()` injetado retornando `false`, `selecionarVendedor` é no-op — `vendedorAtual` inalterado, nenhum evento disparado — `FR-013`, `VEND-09`, AD-043
- [X] T009 [P] [US1] Integration test `tests/integration/vendedorSlice.spec.ts`: `trocarVendedor({ codigo, nome: null }, 'RASCUNHO')` sobrescreve `vendedorAtual` incondicionalmente (inclusive com `podeMutarCarrinho()` retornando `false`), nunca dispara evento de auditoria, não altera `houveEscolhaExplicita`; chamar sem o segundo argumento aplica o default `'DAV'` (compatibilidade com a chamada de 2 argumentos já reservada pela feature 006) — `data-model.md` I3, `research.md` D4, `contracts/vendedor-domain-api.md`

### Implementation for User Story 1

- [X] T010 [US1] Implementar `selecionarVendedor(vendedor)` em `vendedorSlice.ts` (T003): consulta `podeMutarCarrinho()` (dependência injetada, feature 008) antes de mutar — no-op com toast (Goey Toast) se `false` (I4); decide `VENDEDOR_SELECIONADO` vs. `VENDEDOR_TROCADO` via `houveEscolhaExplicita` (`research.md` D6); dispara `registrarEventoAuditoria` (feature 001) — depende de T003
- [X] T011 [US1] Implementar `trocarVendedor(vendedor, origem = 'DAV')` em `vendedorSlice.ts` (T003): sobrescreve `vendedorAtual` incondicionalmente com a `origem` recebida (segundo parâmetro opcional, default `'DAV'` — `contracts/vendedor-domain-api.md`), nunca dispara evento, não altera `houveEscolhaExplicita` — depende de T003
- [X] T012 [P] [US1] Implementar `useBuscaVendedores(txtBusca, pagina)` em `src/client/services/vendedor/vendedorQueries.ts`: `GET /api/erp/GetListaVendedores`, valida a resposta via T002 (Constitution IV), `enabled: txtBusca.length >= SessaoUsuario.QtdMinCharParaConsulta` (piso lido da sessão, nunca hardcodado — AD-024), `staleTime: 0` — depende de T002
- [X] T013 [US1] Implementar `src/client/features/vendedor/ModalBuscaVendedor.tsx`: busca por nome (skeleton Boneyard enquanto carrega, T012), sem chip/filtro de status (`AD-103`); clicar numa linha monta `{ codigo: VendedorCodigo, nome: VendedorNome }` **diretamente** do item da lista (`research.md` D1 — sem segunda chamada) e chama `selecionarVendedor` (T010); fecha o modal sem exigir confirmação separada; buscar sem resultado mantém o vendedor atual e permite fechar normalmente (`FR-010`); fechar sem selecionar mantém o vendedor atual (`FR-011`) — depende de T012, T010 — **consultar o Pencil MCP antes de implementar** (`get_editor_state(include_schema: true)`, depois `batch_get`/`get_screenshot`/`get_variables`/`snapshot_layout` sobre o nó real da tela em `design/CentriumCheckout.pen`; nunca inferir o visual do código existente ou de senso genérico de design — CLAUDE.md § "Referência visual (design)")
- [X] T014 [P] [US1] Implementar `src/client/features/vendedor/CampoVendedorVenda.tsx`: exibe `vendedorAtual.nome`, ou `"Vendedor #<codigo>"` quando `nome === null` (`AD-095`/`research.md` D4); sem indicador de `origem` (`AD-053`) — depende de T003 — **consultar o Pencil MCP antes de implementar** (CLAUDE.md § "Referência visual (design)")
- [X] T015 [US1] E2E `tests/e2e/selecao-vendedor.spec.ts` (`quickstart.md`, Cenários 1-6): vendedor default pré-selecionado sem interação; inserir ao menos um item no carrinho, então buscar e selecionar um vendedor diferente do default (`VENDEDOR_SELECIONADO`, `FR-012` — troca permitida com carrinho populado); selecionar um terceiro vendedor (`VENDEDOR_TROCADO`); finalizar a venda e confirmar que `CheckoutFaturarNFCe` envia `vendedorCodigo = vendedorAtual.codigo`, nunca `sessaoUsuario.UsuarioCodigo` (`FR-007`, depende do payload de finalização da feature 004); empresa sem vendedor default → `vendedorAtual = null`, UI exige seleção manual antes de finalizar (`FR-006`, bloqueio implementado pela feature 004 — este teste só confirma que `vendedorAtual` chega `null` a tempo de a 004 bloquear); busca sem resultado mantém a seleção e fecha sem bloqueio; troca bloqueada após pagamento aprovado, com toast informando o bloqueio — `FR-001` a `FR-006`, `FR-010` a `FR-013`

**Checkpoint**: User Story 1 funcional e testável de forma independente — feature completa (`FR-001` a `FR-015`; `FR-009` e `FR-014` cobertos por `trocarVendedor`/`selecionarVendedor`, T010/T011; `FR-015` é um requisito negativo, sem tarefa própria — nenhum formulário de cadastro é criado por este `tasks.md`).

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: Gates finais e verificações manuais que o E2E não cobre.

- [X] T016 Rodar `npx tsc --noEmit` e confirmar zero erros de tipo — gate obrigatório da Constitution (`Development Workflow`)
- [ ] T017 Rodar o Cenário 7 de `quickstart.md` manualmente (mock de `trocarVendedor({ codigo, nome: null }, 'RASCUNHO')`, simulando o call site futuro de `CarregarNFCe`): confirmar que `CampoVendedorVenda.tsx` (T014) exibe `"Vendedor #<codigo>"` até o operador reabrir `ModalBuscaVendedor.tsx` (T013) e reselecionar; confirmar ausência visual do chip/filtro "Ativo" (AD-103); confirmar que F5 no meio da venda descarta `vendedorAtual` (Constitution VI)

  **Estado em 2026-09-05**: continua **pendente como passagem manual**, mas as três checagens já têm cobertura automatizada equivalente — o que resta é a conferência visual do operador, não a verificação do comportamento:
  - `"Vendedor #<codigo>"` com `nome: null`: coberto por `tests/e2e/importacao-dav.spec.ts` ("cliente e vendedor do documento entram na venda"), que exercita o **mesmo** caminho de renderização com `origem: 'DAV'` — o call site de `CarregarNFCe` (origem `'RASCUNHO'`) só difere no segundo argumento, e `tests/integration/vendedorSlice.spec.ts` cobre essa diferença. A retomada real com nome disponível está em `tests/e2e/recuperacao-nfce.spec.ts`.
  - Ausência do chip/filtro "Ativo" e da coluna "Status" (AD-103): asserção explícita em `tests/e2e/selecao-vendedor.spec.ts` ("a busca não expõe filtro nem coluna de status, nem subtítulo de função").
  - F5 descarta `vendedorAtual`: garantido por construção — o slice entra no `vendaStore`, que não tem `persist` (AD-006/Constitution VI); não há caminho de gravação a testar.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Depende de 002 (Fase 1) e 001 (Foundational, `vendaStore.ts`) — fora desta feature
- **Foundational (Phase 2)**: Depende do Setup — BLOQUEIA a user story
- **User Story (Phase 3)**: Depende do Foundational (T003)
- **Polish (Phase 4)**: Depende da user story completa

### User Story Dependencies

- **US1 (P1)**: Depende de Foundational (T002, T003); MVP standalone — única story da feature, cobre busca, seleção, troca e bloqueio

### Within the User Story

- Tests antes da implementação correspondente
- Núcleo do slice (Foundational) antes das actions `selecionarVendedor`/`trocarVendedor`
- Actions do slice antes da UI que as consome (`ModalBuscaVendedor.tsx`)
- Story completa antes do checkpoint

### Parallel Opportunities

- T002 (schema) não depende de nada — pode iniciar imediatamente
- T004, T005 (testes Foundational) em paralelo entre si, desde que rodem após T003 estar implementado (são testes do comportamento de T003)
- T006–T009 (testes US1) em paralelo entre si
- T012, T014 (arquivos independentes de T010/T011/T013) em paralelo

---

## Parallel Example: Foundational

```bash
# Schema Zod (sem dependências) pode começar antes de tudo:
Task: "Implementar vendedor.schema.ts em src/shared/schemas/vendedor.schema.ts"
```

## Parallel Example: User Story 1 (testes)

```bash
# Os 4 testes de integração de vendedorSlice.spec.ts (arquivos/blocos independentes):
Task: "Integration test VENDEDOR_SELECIONADO em tests/integration/vendedorSlice.spec.ts"
Task: "Integration test VENDEDOR_TROCADO com carrinho populado em tests/integration/vendedorSlice.spec.ts"
Task: "Integration test bloqueio pós-pagamento em tests/integration/vendedorSlice.spec.ts"
Task: "Integration test trocarVendedor incondicional em tests/integration/vendedorSlice.spec.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Completar Phase 1: Setup (pressupõe 002 e 001 já implementadas)
2. Completar Phase 2: Foundational (bloqueia tudo)
3. Completar Phase 3: User Story 1
4. **PARAR e VALIDAR**: vendedor default pré-selecionado, busca, seleção, troca (com carrinho populado) e bloqueio pós-pagamento funcionando isoladamente
5. Nesse ponto a feature está completa — não há segunda story

### Incremental Delivery

1. Setup + Foundational → base pronta (schema, núcleo do slice)
2. US1 → validar isoladamente (busca, seleção, troca, bloqueio pós-pagamento) — feature completa (MVP = feature inteira)
3. Polish → gates finais e verificações manuais

### Parallel Team Strategy

Com mais de um desenvolvedor: completar Setup + Foundational juntos; depois um desenvolvedor segue com `selecionarVendedor`/`ModalBuscaVendedor.tsx` (T010, T012, T013), outro prepara `trocarVendedor`/`CampoVendedorVenda.tsx` (T011, T014) em paralelo — ambos dependem só de T003, sem dependência cruzada entre si.

---

## Notes

- [P] = arquivos diferentes, sem dependências
- [Story] mapeia cada tarefa à user story correspondente para rastreabilidade
- Verificar que os testes falham antes de implementar (TDD onde aplicável) — prioridade no núcleo do slice (`vendedorSlice.ts`)
- Commit após cada tarefa ou grupo lógico
- Parar no checkpoint da Phase 3 para validar a story isoladamente
- `podeMutarCarrinho()` (T010) é uma dependência injetada (Dependency Inversion) — `vendedorSlice.ts` nunca importa `pagamentoSlice`/`carrinhoSlice`/`clienteSlice`, mesmo padrão já usado por carrinho (003) e cliente (005)
- Os call sites que invocam `trocarVendedor` a partir de `CarregarNFCe` (011, com `origem: 'RASCUNHO'` — não 004, que nunca chama `CarregarNFCe`) e da importação de DAV (006, usa o default `'DAV'`) são responsabilidade das fases Design/Tasks dessas features — este `tasks.md` só implementa a action pública (T011); o bloqueio do botão "Finalizar" quando `vendedorAtual === null` (`FR-006`, `SC-003`) é responsabilidade da feature 004 — mesma lógica de escopo

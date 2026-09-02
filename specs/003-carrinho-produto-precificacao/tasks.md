---

description: "Task list template for feature implementation"
---

# Tasks: Carrinho, Busca/Inserção de Produto e Motor de Precificação

**Input**: Design documents from `specs/003-carrinho-produto-precificacao/` (`plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/erp-produto-api.md`, `contracts/precificacao-domain-api.md`, `quickstart.md`)

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: Incluídos — `plan.md` § Testing declara a lógica de precificação como "cobertura prioritária declarada em `.specs/codebase/STACK.md`", e `quickstart.md` define 3 camadas de teste (domínio puro, slice, E2E) com arquivos-alvo explícitos.

**Organization**: Tarefas agrupadas pelas 4 user stories da spec (todas P1) — US1 (busca por termo livre), US2 (inserção direta por código conhecido), US3 (preço sempre correto, sem recálculo manual), US4 (item cancelado permanece rastreável).

**⚠️ Ordem de implementação** (dependência cruzada, mesmo padrão de `specs/002-autenticacao-sessao-bootstrap/tasks.md`): esta feature depende de **002** (scaffolding do projeto + proxy autenticado `/api/erp/*`) e de **001** (`vendaStore.ts`, criado na Foundational da 001 — `carrinhoSlice.ts` desta feature é **combinado** nele, import direto, não injeção). **Ordem**: 002 (Fases 1-2) → 001 → **003** → 002 (Fase 5, US3, que lê o carrinho criado aqui). As dependências de `podeMutarCarrinho()` (feature 008) e `clienteAtual()` (feature 005) são diferentes: chegam por **injeção de dependência** (`CarrinhoDeps`, ver `contracts/precificacao-domain-api.md`), não por import — esta feature pode ser implementada e testada por completo com stubs (`() => true`/`() => false`), sem esperar 005/008 existirem; só a integração final com os valores reais fica pendente.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência de tarefas incompletas)
- **[Story]**: A qual user story a tarefa pertence (US1, US2, US3, US4)
- Caminhos de arquivo exatos em cada descrição

## Path Conventions

Extensão da árvore já proposta pela feature 002 (ver `plan.md` § Structure Decision — terceira feature a estendê-la):

```text
src/client/domain/precificacao/   # camada pura — sem React/Zustand/Query
src/client/stores/slices/          # carrinhoSlice.ts, combinado em vendaStore.ts (feature 001)
src/client/services/produto/       # queries TanStack + mapper
src/client/features/carrinho/      # UI (modal, entrada rápida, grid, mobile, edição)
src/shared/schemas/                # produto.schema.ts
tests/unit/domain/precificacao/ | tests/integration/ | tests/e2e/
```

**⚠️ Consulta ao Pencil MCP obrigatória para tarefas de UI (CLAUDE.md § "Referência visual (design)")**: toda tarefa desta lista que cria ou altera saída visual (tela, componente, modal, layout, ícone, estado de loading/vazio) está marcada abaixo com "consultar o Pencil MCP antes de implementar" — a fonte de verdade do visual é sempre o Pencil MCP (`get_editor_state(include_schema:true)` → `batch_get`/`get_screenshot`/`get_variables`/`snapshot_layout` sobre o nó real da tela em `design/CentriumCheckout.pen`), nunca o código existente nem senso genérico de design. Tarefas afetadas: T015, T016, T017, T021, T022, T023, T035, T036.

---

## Phase 1: Setup

**Purpose**: Criar os diretórios específicos desta feature sobre a árvore já existente (002/001).

- [ ] T001 Criar estrutura de diretórios desta feature: `src/client/domain/precificacao/`, `src/client/services/produto/`, `src/client/features/carrinho/` (`src/client/stores/slices/` já existe, criado pela feature 001)

**Checkpoint**: Diretórios prontos — depende de `src/client/` já existir (Fase 1 da 002) e `src/client/stores/vendaStore.ts` já existir (Foundational da 001).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Tipos monetários, validação de fronteira, motor de preço puro e o esqueleto do slice — usados por todas as 4 user stories.

**⚠️ CRITICAL**: Nenhuma user story pode começar até esta fase terminar.

- [ ] T002 [P] Implementar `src/client/domain/precificacao/dinheiro.ts`: `Centavos` (branded), `centavos()`, `somar()`, `multiplicarPorQuantidade()` (`arredondar(preço × qtd ÷ 1000)`), `aplicarPercentual()`, `distribuirPorMaiorResto()` (AD-072), `calcularTotalLinha()` (única forma de obter o valor de uma linha — `data-model.md` §1, I9)
- [ ] T003 [P] Implementar `src/client/domain/precificacao/quantidade.ts`: `Milesimos` (branded), `milesimosDeUnidades()`, `formatarQuantidade()`
- [ ] T004 [P] Criar `src/shared/schemas/produto.schema.ts` (Zod): `SDTCheckout_GetProduto` e `CheckoutListaProdutos` — converte `PrecoVenda`/`PrecoVenda1..5`/`PrecoMinimo` (double) para `Centavos` (`Math.round(v*100)`), `QtdMinimaPreco2..5` para `Milesimos`, restringe `ProdutoPesavelEditavel` a `z.enum(['S','B','','E'])` (Constitution IV, `contracts/erp-produto-api.md`)
- [ ] T005 Implementar `src/client/services/produto/produtoMapper.ts`: mapeia `SDTCheckout_GetProduto` validado (T004) para `SnapshotPrecoProduto` (`data-model.md` §2) — depende de T004
- [ ] T006 Implementar `fetchProduto` (`GET /api/erp/GetProduto`) em `src/client/services/produto/produtoQueries.ts` — parâmetros `Empresa`/`Codigoproduto`/`Tipocodproduto` (`SessaoUsuario.UsuarioTipoCodigoProduto`, AD-033)/`Tipopreco`/`Codcliente`/`Listapreco` (só quando `TipoPreco=9`); `queryKey: ['produto', codigoProduto, tipoCodProduto, tipoPreco, listaPreco ?? null]`, `staleTime: Infinity` (`CART-03`) — depende de T004, T005; consome o proxy `/api/erp/*` da feature 002
- [ ] T007 Implementar `src/client/domain/precificacao/tabelaPreco.ts`: `resolvePrecoUnitario(tipoPreco, snapshot, quantidadeAgregada)` — `1..7,9,10,11` retorna `snapshot.precoBase`; `8` resolve faixa flat por `QtdMinimaPreco2..5`/`PrecoVenda1..5` (limiar `0` = não configurada); lança erro de domínio fora de `1..11` — depende de T002, T003
- [ ] T008 Implementar `src/client/domain/precificacao/reprecificacao.ts`: `repricarSku(linhas, codigoProduto, tipoPreco)` — função pura; agrega quantidade das linhas ativas não-congeladas do SKU (I2/I3 de `data-model.md`), chama T007 uma vez, aplica a **todas** as linhas ativas não-congeladas do SKU (`CART-06`), linhas canceladas/congeladas/outros SKUs retornam por identidade — depende de T007
- [ ] T009 Implementar `src/client/stores/slices/carrinhoSlice.ts`: estado `linhas: LinhaCarrinho[]`; `CarrinhoDeps` injetado (`podeMutarCarrinho()`, `tipoPrecoAtual()`, `clienteAtual()` — ver nota de dependência cruzada acima); `inserirItem`, `editarItem`, `cancelarItem`, `limparCarrinho`; cada mutação chama T008 e emite o evento de auditoria correspondente via dispatcher da feature 001 (`PRODUTO_INSERIDO`/`PRODUTO_ALTERADO`/`PRODUTO_CANCELADO`); seletores `linhasAtivas`/`quantidadeAgregada`/`totalBruto`/`totalLinha`/`totalVenda` (nunca campos armazenados) — depende de T002, T006, T007, T008; combinado em `vendaStore.ts` (feature 001)
- [ ] T010 [P] Unit test `tests/unit/domain/precificacao/dinheiro.spec.ts`: soma/multiplicação sem drift de ponto flutuante; `distribuirPorMaiorResto` — soma das parcelas sempre exatamente o total; `calcularTotalLinha` com quantidade inteira/fracionária, desconto > total bruto → piso `0`, desconto `0` → `preço × quantidade` (`FR-016`, AD-072, I8)
- [ ] T011 [P] Unit test `tests/unit/domain/precificacao/quantidade.spec.ts`: conversão e formatação de `Milesimos`
- [ ] T012 [P] Unit test `tests/unit/shared/produto.schema.spec.ts`: `SDTCheckout_GetProduto`/`CheckoutListaProdutos` válidos e inválidos, conversão double→Centavos/Milesimos, `ProdutoPesavelEditavel` fora do enum é erro de fronteira

**Checkpoint**: Domínio puro, validação de fronteira e slice básico prontos — inserção mínima é possível (ainda sem UI).

---

## Phase 3: User Story 1 - Busca de produto por termo livre (Priority: P1) 🎯 MVP

**Goal**: Operador busca por termo livre, vê candidatos, seleciona um — a linha é montada sempre via `GetProduto` (AD-091/D1), nunca a partir do resultado da busca.

**Independent Test**: Buscar um termo parcial e confirmar que os candidatos retornados incluem o produto esperado; selecionar um candidato e confirmar que a informação de preço fica disponível sem nova busca.

### Tests for User Story 1

- [ ] T013 [US1] Integration test: seleção no modal de busca nunca monta `LinhaCarrinho` a partir de `GetListaProdutos` — sempre dispara `fetchProduto`/`GetProduto` para o `CodigoProduto` selecionado (AD-091) em `tests/integration/carrinhoSlice.spec.ts`

### Implementation for User Story 1

- [ ] T014 [P] [US1] Implementar `useBuscaProdutos` (`GET /api/erp/GetListaProdutos`) em `src/client/services/produto/produtoQueries.ts` — só dispara quando `Txtbusca.length >= SessaoUsuario.QtdMinCharParaConsulta` (AD-024, piso vem do ERP, nunca hardcoded)
- [ ] T015 [US1] Implementar `src/client/features/carrinho/ModalBuscaProduto.tsx` (`CART-01`): busca com skeleton Boneyard, lista paginada; seleção de candidato chama `fetchProduto` (T006), nunca monta a linha do resultado da busca — **consultar o Pencil MCP antes de implementar** (`get_editor_state(include_schema: true)`, depois `batch_get`/`get_screenshot`/`get_variables`/`snapshot_layout` sobre o nó real da tela em `design/CentriumCheckout.pen`; nunca inferir o visual do código existente ou de senso genérico de design — CLAUDE.md § "Referência visual (design)")
- [ ] T016 [P] [US1] Implementar `src/client/features/carrinho/GridItens.tsx`: grid desktop exibindo linhas ativas do carrinho (base para riscar cancelada, estendido em US4) — **consultar o Pencil MCP antes de implementar** (CLAUDE.md § "Referência visual (design)")
- [ ] T017 [P] [US1] Implementar `src/client/features/carrinho/ListaItensMobile.tsx`: mesma fonte de estado do carrinho, layout mobile — **consultar o Pencil MCP antes de implementar** (CLAUDE.md § "Referência visual (design)")
- [ ] T018 [US1] E2E — busca (quickstart, Camada 3, passos 2-4): termo abaixo do mínimo não dispara `GetListaProdutos`; termo completo lista com skeleton; seleção insere via `GetProduto` — em `tests/e2e/carrinho-precificacao.spec.ts`

**Checkpoint**: User Story 1 funcional e testável de forma independente — busca e seleção completas (FR-001).

---

## Phase 4: User Story 2 - Inserção direta por código conhecido (Priority: P1)

**Goal**: Operador bipa ou digita um código conhecido — com ou sem quantidade — e o item entra na venda sem passar pela busca; produto pesável deriva quantidade/preço da etiqueta; produto editável abre edição antes de inserir.

**Independent Test**: Bipar/digitar um código conhecido e confirmar que o item entra sem passar por tela de busca; reinserir o mesmo produto e confirmar reuso sem nova consulta; testar `codigo*quantidade` e código simples.

### Tests for User Story 2

- [ ] T019 [P] [US2] Unit test `tests/unit/domain/precificacao/codigoProduto.spec.ts`: `"001234*3"` → `COM_QTD`; `"001234"` → `SIMPLES` (quantidade 1); EAN-13 válido iniciado em `2` → `BALANCA`; DV inválido cai em `SIMPLES`; `quantidadePesavel` com `precoVenda <= 0` lança (`FR-004`, `FR-013`, AD-028/AD-029/AD-076)

### Implementation for User Story 2

- [ ] T020 [US2] Implementar `src/client/domain/precificacao/codigoProduto.ts`: `interpretarEntradaCodigo` (ordem `*` → balança (13 dígitos, prefixo `2`, DV EAN-13 válido) → simples, D6), `quantidadePesavel` (`round(trunc(valorEtiqueta/precoVenda,5),3)`, AD-076) — depende de T002, T003
- [ ] T021 [US2] Implementar `src/client/features/carrinho/EntradaRapidaProduto.tsx` (`CART-02`): campo de código/bipagem + TAB/Enter, usa T020 para classificar a entrada, chama `fetchProduto` (T006) e `inserirItem` (T009) — **consultar o Pencil MCP antes de implementar** (CLAUDE.md § "Referência visual (design)")
- [ ] T022 [US2] Implementar `src/client/features/carrinho/EdicaoItemEditavel.tsx`: fluxo `'E'` — foco pula para campos editáveis (preço/unidade/quantidade/desconto), insere só ao acionar `+` (`FR-014`); `'S'`/`'B'` insere direto somente-leitura com quantidade/preço da etiqueta/balança (`FR-013`/`FR-015`); `''` insere direto somente-leitura (`FR-015`) — compartilhado pelo caminho de busca (US1) e código direto (US2) — **consultar o Pencil MCP antes de implementar** (CLAUDE.md § "Referência visual (design)")
- [ ] T023 [US2] Wire bloqueio de inserção de produto pesável sem `PrecoVenda` disponível: toast de aviso, nenhuma linha inserida, foco permanece no campo (`FR-013`) — **consultar o Pencil MCP antes de implementar** (CLAUDE.md § "Referência visual (design)")
- [ ] T024 [US2] Integration test: reinserir o mesmo SKU não gera nova chamada a `GetProduto` (`staleTime: Infinity`, `CART-03`) em `tests/integration/carrinhoSlice.spec.ts`
- [ ] T025 [US2] E2E — código direto (quickstart, Camada 3, passos 7-9): `codigo*3` insere quantidade 3, código simples insere quantidade 1, EAN-13 de balança deriva quantidade/preço com campos somente-leitura, produto `'E'` não insere ao TAB — em `tests/e2e/carrinho-precificacao.spec.ts`

**Checkpoint**: User Stories 1 e 2 funcionam juntas — os dois caminhos de inserção completos (FR-002 a FR-004, FR-013 a FR-015).

---

## Phase 5: User Story 3 - Preço sempre correto, sem recálculo manual (Priority: P1)

**Goal**: O preço de cada item reflete automaticamente a regra de precificação correta, recalculado a cada mutação relevante, sem ação manual do operador.

**Independent Test**: Inserir quantidade suficiente para cruzar uma faixa de preço e confirmar que todas as unidades do produto passam a valer o preço da faixa; cancelar parte da quantidade e confirmar que o preço volta à faixa inferior.

### Tests for User Story 3

- [ ] T026 [P] [US3] Unit test `tests/unit/domain/precificacao/tabelaPreco.spec.ts`: um caso por `TipoPreco` de `1` a `11`; para `8`, quantidade abaixo/igual/acima de cada limiar; limiar `0` ignorado como faixa não configurada (`FR-005`, `FR-006`, AD-059/AD-060)
- [ ] T027 [P] [US3] Unit test `tests/unit/domain/precificacao/reprecificacao.spec.ts`: cruzar faixa recalcula todas as linhas ativas do SKU; cancelamento derruba as remanescentes para a faixa inferior; linha congelada não é alterada nem entra no agregado (D3); linhas de outros SKUs retornam inalteradas por identidade

### Implementation for User Story 3

- [ ] T028 [US3] Implementar desconto de convênio: `aplicarPercentual` (T002) sobre o total bruto da linha com o `DescontoConvenio` do cliente atual (AD-023) — cliente default sempre fator `1` (AD-108); recalculado junto com `repricarSku`
- [ ] T029 [US3] Implementar `reprecificarPorTrocaDeCliente()` no `carrinhoSlice` (T009): chama T008 para cada SKU distinto com linha ativa não-congelada quando `TipoPreco = 9` ou o `DescontoConvenio` do cliente muda (`FR-018`) — sem evento de auditoria próprio (auditado pela feature 005 como `CLIENTE_TROCADO`)
- [ ] T030 [US3] Wire `editarItem(idLinha, 'quantidade', ...)` no `carrinhoSlice` (T009) para chamar `repricarSku` (`FR-007`)
- [ ] T031 [US3] Integration test — cenário de aceitação central (quickstart, Camada 1): inserir 3un (preço 1000) → inserir +3un em nova linha (agregado 6, cruza faixa, ambas linhas passam a 900) → cancelar a 2ª linha (agregado volta a 3, remanescente volta a 1000, linha cancelada permanece no array) — em `tests/integration/carrinhoSlice.spec.ts`
- [ ] T032 [US3] E2E — faixa de preço (quickstart, Camada 3, passo 5): bipar/digitar quantidade que cruza o limiar → todas as linhas do SKU exibem o novo preço — em `tests/e2e/carrinho-precificacao.spec.ts`

**Checkpoint**: User Stories 1, 2 e 3 funcionam juntas — motor de precificação completo (FR-005 a FR-008, FR-018, SC-001, SC-002).

---

## Phase 6: User Story 4 - Item cancelado permanece rastreável (Priority: P1)

**Goal**: Cancelar um item por engano não o remove da lista — ele permanece visível, marcado como cancelado, excluído dos cálculos, sem exigir supervisor.

**Independent Test**: Cancelar um item e confirmar que permanece visível marcado como cancelado, e que o total da venda não o inclui.

### Tests for User Story 4

- [ ] T033 [US4] Integration test: linha cancelada preservada no array (`linhas.length` inalterado), excluída de `quantidadeAgregada`/`totalVenda` (`FR-009`) em `tests/integration/carrinhoSlice.spec.ts`
- [ ] T034 [US4] Integration test: `cancelarItem` (T009) executa sem nenhum prompt de supervisor/reautenticação (`FR-012`, AD-065) em `tests/integration/carrinhoSlice.spec.ts`

### Implementation for User Story 4

- [ ] T035 [US4] Estender `GridItens.tsx` (T016): linha com `cancelada = true` exibida riscada, permanece visível (`CART-08`) — **consultar o Pencil MCP antes de implementar** (CLAUDE.md § "Referência visual (design)")
- [ ] T036 [US4] Wire ação de cancelar na UI (`GridItens.tsx`/`ListaItensMobile.tsx`) chamando `cancelarItem` (T009) — sem modal de confirmação/supervisor — **consultar o Pencil MCP antes de implementar** (CLAUDE.md § "Referência visual (design)")
- [ ] T037 [US4] E2E — cancelamento (quickstart, Camada 3, passos 6 e 10): cancelar → linha riscada e visível, demais linhas do SKU recalculadas, subtotal exclui a cancelada; repetir no layout mobile — em `tests/e2e/carrinho-precificacao.spec.ts`

**Checkpoint**: As 4 user stories funcionam de forma independente e integrada — feature completa (FR-009, FR-012, SC-003).

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Fechamento das dependências injetadas (D8), integração com fim de venda, e gates finais.

- [ ] T038 [P] Wire `podeMutarCarrinho()` como predicado injetado consumido por `editarItem`/`cancelarItem` (T009) — stub `() => true` até a feature 008 (pagamento) fornecer a implementação real; **dependência por injeção, não por import** (D8) — não bloqueia esta feature
- [ ] T039 [P] Integration test: bloqueio pós-pagamento via predicado injetado `() => false` — `editarItem`/`cancelarItem` viram no-op, `linhas` inalterado (`FR-010`) em `tests/integration/carrinhoSlice.spec.ts`
- [ ] T040 Wire invalidação do cache de produto (`queryClient.removeQueries({ queryKey: ['produto'] })`) e `limparCarrinho()` (T009) nos dois únicos momentos permitidos: finalização e suspensão da venda — integração real fica pendente da feature 004 (só chama os hooks já prontos aqui)
- [ ] T041 Rodar `npx tsc --noEmit` e confirmar zero erros de tipo — gate obrigatório da Constitution (`Development Workflow`)
- [ ] T042 Rodar as 3 camadas de `quickstart.md` (domínio puro, slice, E2E) e confirmar o critério de aceite da feature

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Depende de 002 (Fase 1) e 001 (Foundational, `vendaStore.ts`) — fora desta feature
- **Foundational (Phase 2)**: Depende do Setup — BLOQUEIA todas as user stories
- **User Stories (Phase 3-6)**: Todas dependem do Foundational
  - US1 pode começar assim que Phase 2 terminar
  - US2 pode começar em paralelo a US1 (arquivos distintos), mas ambas escrevem eventualmente em `carrinhoSlice.ts`/`GridItens.tsx` — coordenar merges
  - US3 depende de T009 (slice) e adiciona comportamento sobre `editarItem`/`reprecificarPorTrocaDeCliente` — pode começar em paralelo a US1/US2
  - US4 depende de T016 (`GridItens.tsx`, US1) e T009 (`cancelarItem`, Foundational)
- **Polish (Phase 7)**: Depende das 4 user stories completas

### User Story Dependencies

- **US1 (P1)**: Depende de Foundational; sem dependência de outras stories
- **US2 (P1)**: Depende de Foundational; sem dependência de outras stories
- **US3 (P1)**: Depende de Foundational (T009); integração completa (troca de cliente) pressupõe feature 005 real (aqui testável com stub)
- **US4 (P1)**: Depende de Foundational (T009) e de US1 (T016, `GridItens.tsx`, para estender com o estado riscado)

### Within Each User Story

- Tests antes da implementação correspondente, onde aplicável
- Módulos de domínio puro antes das actions do slice que os usam
- Slice antes dos componentes de UI que o consomem
- Story completa antes do checkpoint

### Parallel Opportunities

- T002–T004 (Foundational) em paralelo
- T010–T012 (testes Foundational) em paralelo
- T014, T016, T017 em paralelo dentro de US1 (arquivos diferentes)
- T019 (teste) pode rodar assim que T020 estiver pronto; T020 não é `[P]` com T019 (mesma cobertura, mas arquivos diferentes — pode paralelizar a escrita do teste enquanto a implementação avança)
- T026–T027 (testes US3) em paralelo
- T038–T039 (Polish) em paralelo

---

## Parallel Example: User Story 1

```bash
# Query de busca e componentes de exibição (arquivos diferentes):
Task: "Implementar useBuscaProdutos em src/client/services/produto/produtoQueries.ts"
Task: "Implementar GridItens.tsx em src/client/features/carrinho/GridItens.tsx"
Task: "Implementar ListaItensMobile.tsx em src/client/features/carrinho/ListaItensMobile.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Completar Phase 1: Setup (pressupõe 002 e 001 já implementadas)
2. Completar Phase 2: Foundational (bloqueia tudo)
3. Completar Phase 3: User Story 1
4. **PARAR e VALIDAR**: busca e seleção de produto funcionando isoladamente
5. Nesse ponto o operador só insere via busca (US2 ainda não existe) — suficiente para validar o motor de preço básico

### Incremental Delivery

1. Setup + Foundational → base pronta (domínio puro + slice + Zod)
2. US1 → validar isoladamente (busca)
3. US2 → validar isoladamente + em conjunto com US1 (dois caminhos de inserção)
4. US3 → validar isoladamente + em conjunto (motor de preço correto nos dois caminhos)
5. US4 → validar isoladamente + em conjunto (cancelamento rastreável) — feature completa

### Parallel Team Strategy

Com mais de um desenvolvedor: completar Setup + Foundational juntos; depois um desenvolvedor segue com US1 (busca), outro com US2 (código direto) em paralelo; US3 (motor de preço) e US4 (cancelamento) podem avançar assim que Foundational terminar, coordenando merges em `carrinhoSlice.ts`.

---

## Notes

- [P] = arquivos diferentes, sem dependências
- [Story] mapeia cada tarefa à user story correspondente para rastreabilidade
- Verificar que os testes falham antes de implementar (TDD onde aplicável) — prioridade máxima na camada de domínio puro (`plan.md` § Testing)
- Commit após cada tarefa ou grupo lógico
- Parar em cada checkpoint para validar a story isoladamente
- Esta feature fecha a dependência que `specs/002-autenticacao-sessao-bootstrap/tasks.md` (Fase 5, US3, T033/T035) registrou como pendente — depois de **T009** aqui (que cria `linhas`/`cancelarItem` no `carrinhoSlice.ts`), o slice de carrinho que a 002 lê para decidir o aviso de venda perdida existe de fato

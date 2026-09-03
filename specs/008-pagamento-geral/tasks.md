---

description: "Task list template for feature implementation"
---

# Tasks: Pagamento (Geral)

**Input**: Design documents from `specs/008-pagamento-geral/` (`plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/erp-pagamento-api.md`, `contracts/pagamento-domain-api.md`, `quickstart.md`)

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: Incluídos — `plan.md` § Testing e `quickstart.md` definem 3 camadas explícitas (domínio puro, integração do slice, E2E) com arquivos-alvo nomeados.

**Organization**: Tarefas agrupadas pelas 5 user stories da spec. Ordem de fase segue prioridade (P1 antes de P2) e, dentro de P1, a ordem de dependência natural de construção: **US1** (ver formas/condições, P1) → **US2** (roteamento automático, P1) → **US4** (split/troco, P1) → **US5** (desconto manual de capa, P1) → **US3** (vale devolução, P2) — não a ordem numérica bruta da spec, porque US4/US5 sustentam o fluxo de aplicar pagamento que US3 consome, e US3 é a única P2.

**⚠️ Ordem de implementação e dependências cruzadas**: esta feature depende de **001** (`vendaStore.ts`, dispatcher de auditoria `registrarEventoAuditoria`), **002** (scaffolding + proxy `/api/erp/*` + `/api/bootstrap`) e **003** (`Centavos`, `distribuirPorMaiorResto` de `src/client/domain/precificacao/dinheiro.ts` — reusados, nunca reimplementados, AD-072; `subtotalCarrinho()`/`linhasRateaveis()` injetados). Quatro dependências chegam por **injeção**, implementáveis com stubs nesta feature: `capacidades()` (002, `tefAtivo`/`pixAtivo` — a 007 deixou de participar em AD-144, que tirou `plataforma` do roteamento), `validarInsercao()`/`invalidarVeredito()` (014, gate `FR-019`/AD-109), `iniciarIntegracao()` (009/010, aciona PIX/TEF). Em contrapartida, esta feature **expõe** `podeMutarCarrinho()` para a 003 (I7, mesmo padrão que a 004 já consome) e será consumida futuramente por 005/012 para o congelamento de cliente/vendedor (I12/FR-023) e pela 013 (AD-104) como portas injetadas.

**Revisão `/speckit-analyze` (2026-08-31)**: 6 achados corrigidos nesta versão — 3 novas tarefas de teste na fase Foundational (T015–T017, cobrindo I6/I7, `FR-021` e `FR-020`, antes sem nenhuma task associada), 1 nova tarefa de teste na US5 (T033, cobrindo I12), e as descrições de T010 e T039 (antes T035) expandidas para instruir explicitamente o disparo dos 4 eventos de auditoria que os testes já verificavam mas cuja implementação não citava (`FR-017`); T027 (antes T024) expandida para also assertar `FormaEntrada` no payload (`FR-022`).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência de tarefas incompletas)
- **[Story]**: A qual user story a tarefa pertence (US1, US2, US3, US4, US5)
- Caminhos de arquivo exatos em cada descrição

## Path Conventions

Quarta extensão da árvore proposta pela feature 002 (ver `plan.md` § Structure Decision):

```text
src/client/domain/pagamento/                # camada pura — formaPagamento, roteamentoIntegracao, saldoPagamento, descontoCapa, valeDevolucao
src/client/stores/slices/                   # pagamentoSlice.ts, combinado em vendaStore.ts (feature 001, já existe)
src/client/services/pagamento/              # pagamentoQueries.ts, pagamentoMapper.ts
src/client/features/pagamento/              # SeletorCondicaoForma, ListaPagamentosAplicados, ModalDescontoCapa, ModalValeDevolucao
src/shared/schemas/                         # pagamento.schema.ts
tests/unit/domain/pagamento/ | tests/integration/ | tests/e2e/
```

**⚠️ Consulta ao Pencil MCP obrigatória para tarefas de UI (CLAUDE.md § "Referência visual (design)")**: toda tarefa desta lista que cria ou altera saída visual (tela, componente, modal, layout, ícone, estado de loading/vazio) está marcada abaixo com "consultar o Pencil MCP antes de implementar" — a fonte de verdade do visual é sempre o Pencil MCP (`get_editor_state(include_schema:true)` → `batch_get`/`get_screenshot`/`get_variables`/`snapshot_layout` sobre o nó real da tela em `design/CentriumCheckout.pen`), nunca o código existente nem senso genérico de design. Tarefas afetadas: T019, T028, T035, T040.

---

## Phase 1: Setup

**Purpose**: Criar os diretórios específicos desta feature sobre a árvore já existente (002/001/003).

- [ ] T001 Criar estrutura de diretórios desta feature: `src/client/domain/pagamento/`, `src/client/services/pagamento/`, `src/client/features/pagamento/` (`src/client/stores/slices/` e `src/shared/schemas/` já existem, criados pelas features 001/002)

**Checkpoint**: Diretórios prontos — depende de `src/client/` já existir (Fase 1 da 002) e `src/client/stores/vendaStore.ts` já existir (Foundational da 001).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Os 5 módulos de domínio puro, a fronteira Zod/mapper/query do catálogo, e o núcleo do `pagamentoSlice` — incluindo `aplicarPagamento` com o gate `FR-019`/`FR-020`/`FR-021` (AD-109/AD-113) e o disparo dos 5 eventos de auditoria (`FR-017`) — porque **toda** user story de aplicação de pagamento (US2, US3, US4, US5) passa por essa mesma action. Cobre também, com testes dedicados, as invariantes cruzadas I6/I7 (irreversibilidade), `FR-020` (curto-circuito local) e `FR-021` (invalidação de veredito) que o `/speckit-analyze` de 2026-08-31 encontrou sem cobertura.

**⚠️ CRITICAL**: Nenhuma user story pode começar até esta fase terminar.

- [ ] T002 [P] Implementar `src/client/domain/pagamento/formaPagamento.ts`: `MeioPagtoNFe` (união fechada, `data-model.md` §1), `FormaPagamento`, `ehDinheiro`, `ehCartao`, `ehPixDinamico`, `geraTroco` (alias de `ehDinheiro`), `exigeDocumentoImpresso` (retorno de tipo literal `false`, `FR-018`/AD-064)
- [ ] T003 [P] Implementar `src/client/domain/pagamento/roteamentoIntegracao.ts`: `IntegracaoPagamento`, `CapacidadesPagamento` (só `tefAtivo`/`pixAtivo`), `resolverIntegracao` e `formaDisponivel` — tabela de decisão completa de `research.md` D5 (`PAY-08`; **AD-144, 2026-09-03**: o layout não entra no roteamento — cartão com `tefAtivo` vira `TEF` também no mobile, e o tipo `Plataforma` não pertence mais a este módulo) — depende de T002
- [ ] T004 [P] Implementar `src/client/domain/pagamento/saldoPagamento.ts`: `SaldoPagamento`, `calcularSaldo`, `podeAplicarForma` (`ResultadoValidacao` com `DINHEIRO_DUPLICADO`/`SALDO_JA_COBERTO`, I2/`FR-013`), `derivarValores` (única fonte de `valorAplicado`/`valorRecebido`, I3/I5) — depende de T002
- [ ] T005 [P] Implementar `src/client/domain/pagamento/descontoCapa.ts`: `LinhaRateavel`, `resolverDescontoCapa`, `ratearDescontoCapa` — divisão igual com clamp e redistribuição (AD-098, algoritmo de `data-model.md` §5), reusando `distribuirPorMaiorResto` de `src/client/domain/precificacao/dinheiro.ts` (feature 003, AD-072) — pré-condição `descontoCapa <= Σ totalLiquido` lança erro de domínio explícito
- [ ] T006 [P] Implementar `src/client/domain/pagamento/valeDevolucao.ts`: `ResultadoTicket` (união discriminada), `ehElegivelParaVale` (`fpgUtiCar` vazio = elegível, AD-048), `interpretarRespostaTicket` (usa só `Valido`, AD-101 — **não** reintroduzir o fallback de `Mensagem` de AD-099) — depende de T002
- [ ] T007 [P] Implementar `src/shared/schemas/pagamento.schema.ts` (Zod): `CondicoesDePagamento[]` de `SessaoUsuario` (`CondicaoMinimoEntrada`/`double`→`Centavos`; `FormaMeioPagtoNFe` desconhecido descarta a forma com aviso, sem derrubar a tela; `FormaEntrada` obrigatório por forma, `FR-022`/AD-111) e `ValidaTicketDevolucaoOutput` (`ValorTicket`→`Centavos`, `Valido`) — `contracts/erp-pagamento-api.md` §1/§2
- [ ] T008 Implementar `src/client/services/pagamento/pagamentoMapper.ts`: `CondicoesDePagamento[]` validado (T007) → `CondicaoPagamento[]`/`FormaPagamento[]` do domínio (T002) — depende de T002, T007
- [ ] T009 Implementar `src/client/services/pagamento/pagamentoQueries.ts`: `useCondicoesPagamento` (TanStack Query sobre `GET /api/bootstrap`, `staleTime: 30 * 60 * 1000`, `PAY-01`) e `validarTicket(codigo)` (`POST /api/erp/ValidaTicketDevolucao`, chamada só sob demanda) — depende de T007, T008
- [ ] T010 Implementar núcleo de `src/client/stores/slices/pagamentoSlice.ts`: estado (`condicaoSelecionada`, `pagamentos`, `descontoCapa: null`, `valeDevolucao: null`); `selecionarCondicao` (esvazia `pagamentos` ao trocar, I9); `aplicarPagamento` com a ordem obrigatória do gate — (1) validações locais puras via `podeAplicarForma`/saldo, sem ida ao ERP se recusado (`FR-020`); (2) `validarInsercao(candidata, 'MANUAL')` injetado (feature 014, `FR-019`); (3) só então `derivarValores` + cria `PagamentoAplicado`, e se `resolverIntegracao(...) !== 'NENHUMA'` entra como `PENDENTE_INTEGRACAO` e dispara `iniciarIntegracao` injetado (nunca alcançado numa venda recusada); `confirmarPagamentoIntegrado`/`recusarPagamentoIntegrado`; `removerPagamento` (no-op com toast se `integracao !== 'NENHUMA'` e `status === 'APROVADO'`, I6; chama `invalidarVeredito()` injetado, `FR-021`); seletores `podeMutarCarrinho()` (I7) e `saldo()` (`calcularSaldo` sobre `subtotalCarrinho()`/`descontoCapa` injetados); `limparPagamentos`. **`aplicarForma(codigo, valor)`** — porta consumida pelo atalho de venda rápida (feature 013, `contracts/venda-rapida-domain-api.md` §4) — é uma casca fina sobre o mesmo núcleo do gate, chamando `validarInsercao(candidata, 'ATALHO_CENARIO')`: a única diferença entre os dois pontos de entrada é o literal de `origem` passado a `validarInsercao`; nenhuma lógica do gate é duplicada (achado I1 do `/speckit-analyze` da feature 014, 2026-09-01, `contracts/validacao-domain-api.md` §3). **Cada action dispara o evento de auditoria correspondente via `registrarEventoAuditoria` (feature 001, AD-061), explicitamente:** `aplicarPagamento`/`confirmarPagamentoIntegrado` → `FORMA_PAGAMENTO_APLICADA` (só quando o status vira `APROVADO`, nunca em `PENDENTE_INTEGRACAO`); `recusarPagamentoIntegrado` → `PAGAMENTO_RECUSADO`; `removerPagamento` → `FORMA_PAGAMENTO_REMOVIDA` — `FR-017`, `research.md` D13 — depende de T003, T004, T009
- [ ] T011 [P] Unit test `tests/unit/domain/pagamento/roteamentoIntegracao.spec.ts`: matriz completa de `research.md` D5/quickstart Cenário 2 — `CartaoCredito`+`tefAtivo`+`DESKTOP`→`TEF`; `CartaoCredito`+`tefAtivo`+`MOBILE`→`NENHUMA` (linha crítica de `FR-007`); `Pix`+`pixAtivo`+`MOBILE`→`PIX_DINAMICO`; `PixEstatico`→sempre `NENHUMA` (`FR-006`) — depende de T003
- [ ] T012 [P] Unit test `tests/unit/domain/pagamento/saldoPagamento.spec.ts`: troco só para `Dinheiro` acima do saldo (`FR-012`); `valorAplicado = min(valorInformado, saldoRestante)`; segunda forma dinheiro devolve `DINHEIRO_DUPLICADO` (`FR-013`) — depende de T004
- [ ] T013 [P] Unit test `tests/unit/domain/pagamento/formaPagamento.spec.ts`: `exigeDocumentoImpresso` sempre `false`; teste negativo — aplicar `DuplicataMercantil` e afirmar que nenhum serviço de impressão é invocado (I10, `FR-018`/AD-064, `research.md` D12) — depende de T002
- [ ] T014 Integration test `tests/integration/pagamentoSlice.spec.ts`: no máximo uma `condicaoSelecionada` (I1); trocar condição esvazia `pagamentos` (I9); `aplicarPagamento` sem veredito favorável de `validarInsercao` (stub) não muta estado nem chama `iniciarIntegracao` (I11, `FR-019`) — depende de T010
- [ ] T015 [P] Integration test `tests/integration/pagamentoSlice.spec.ts`: aplicar `Dinheiro` sem integração e depois `removerPagamento` → `podeMutarCarrinho()` volta a `true` (bloqueio reversível); aplicar `CartaoCredito` via TEF, confirmar a aprovação (`confirmarPagamentoIntegrado`) e tentar `removerPagamento` → no-op com toast, `podeMutarCarrinho()` permanece `false` (I6/I7, `research.md` D11, quickstart Cenário 6) — depende de T010
- [ ] T016 [P] Integration test `tests/integration/pagamentoSlice.spec.ts`: remover um pagamento aplicado invalida o veredito vigente (`invalidarVeredito()`); a próxima `aplicarPagamento`, mesmo com uma candidata idêntica à anterior, chama `validarInsercao` de novo — `FR-021` — depende de T010
- [ ] T017 [P] Integration test `tests/integration/pagamentoSlice.spec.ts`: tentar aplicar uma segunda forma `Dinheiro` (recusa local via `podeAplicarForma`, `DINHEIRO_DUPLICADO`) encerra o gesto sem chamar `validarInsercao` nem gerar qualquer chamada de rede — a recusa local é suficiente (`FR-020`) — depende de T010, T004

**Checkpoint**: Domínio puro, fronteira Zod, catálogo e núcleo do slice prontos — incluindo a auditoria e as invariantes de reversibilidade/revalidação — nenhuma user story ainda expõe UI.

---

## Phase 3: User Story 1 - Ver formas e condições de pagamento disponíveis (Priority: P1) 🎯 MVP

**Goal**: Operador abre a etapa de pagamento e vê as formas/condições disponíveis para a empresa, com terminal físico e PIX ocultos/desabilitados quando a integração correspondente está desligada.

**Independent Test**: Abrir a tela de pagamento e confirmar que as formas disponíveis aparecem, e que uma forma desativada para o ambiente não aparece (quickstart Cenário 1).

### Tests for User Story 1

- [ ] T018 [P] [US1] Integration test `tests/integration/pagamentoSlice.spec.ts`: `TEFAtivo: false` mantém cartão disponível como pagamento manual; `UtilizaCentriumPAG: false` oculta `Pix` mas mantém `PixEstatico`; recarregar dentro de 30 min não gera nova requisição (`staleTime`, `PAY-01`) — `FR-001`..`FR-003` — depende de T009

### Implementation for User Story 1

- [ ] T019 [US1] Implementar `src/client/features/pagamento/SeletorCondicaoForma.tsx`: lista condições e formas do catálogo (`useCondicoesPagamento`, T009), oculta/desabilita forma via `formaDisponivel` (T003), aciona `selecionarCondicao` (T010) — `FR-001`..`FR-003` — depende de T009, T010 — **consultar o Pencil MCP antes de implementar** (`get_editor_state(include_schema: true)`, depois `batch_get`/`get_screenshot`/`get_variables`/`snapshot_layout` sobre o nó real da tela em `design/CentriumCheckout.pen`; nunca inferir o visual do código existente ou de senso genérico de design — CLAUDE.md § "Referência visual (design)")
- [ ] T020 [US1] Wire o evento `CONDICAO_PAGAMENTO_APLICADA` (feature 001, AD-061) dentro de `selecionarCondicao` (T010) — `FR-017` — depende de T010

**Checkpoint**: User Story 1 funcional e testável de forma independente — catálogo visível com as flags de disponibilidade corretas.

---

## Phase 4: User Story 2 - Roteamento automático para a integração correta (Priority: P1)

**Goal**: Cada forma com integração externa só é registrada como aplicada depois de aprovada; cartão nunca aciona terminal físico no mobile.

**Independent Test**: Selecionar diferentes formas de pagamento e confirmar que só as que dependem de terminal físico chamam essa integração, só o PIX dinâmico chama seu fluxo, e as demais seguem sem integração externa (quickstart Cenário 2 — teste unitário puro sobre `resolverIntegracao`, já coberto por T011; esta fase valida o **wiring** de `aplicarPagamento`, já implementado em T010).

### Tests for User Story 2

- [ ] T021 [P] [US2] Integration test `tests/integration/pagamentoSlice.spec.ts`: aplicar `CartaoCredito` com `tefAtivo: true`/`DESKTOP` entra como `PENDENTE_INTEGRACAO`, dispara `iniciarIntegracao('TEF', ...)`; `FORMA_PAGAMENTO_APLICADA` só emite após `confirmarPagamentoIntegrado` — `FR-004` — depende de T010
- [ ] T022 [P] [US2] Integration test `tests/integration/pagamentoSlice.spec.ts`: aplicar `Pix` com `pixAtivo: true` entra como `PENDENTE_INTEGRACAO`, dispara `iniciarIntegracao('PIX_DINAMICO', ...)`; `recusarPagamentoIntegrado` remove o pagamento e emite `PAGAMENTO_RECUSADO` — `FR-005` — depende de T010
- [ ] T023 [P] [US2] Integration test `tests/integration/pagamentoSlice.spec.ts`: `PixEstatico` nunca dispara `iniciarIntegracao` (`FR-006`); com `tefAtivo: true`, `CartaoCredito` dispara `iniciarIntegracao` com o veredito `TEF` **independentemente do layout** (`FR-007`, AD-144 — o caso mobile deixou de ser exceção e vira o mesmo caso do desktop); PIX idem — depende de T010, T003

**Checkpoint**: User Story 2 funcional e testável de forma independente — o roteamento (implementado no núcleo do slice, T010) está confirmado pelo contrato de comportamento das 3 famílias de forma.

---

## Phase 5: User Story 4 - Dividir pagamento entre várias formas e calcular troco (Priority: P1)

**Goal**: Operador aplica múltiplas formas até cobrir o total, vê o troco calculado automaticamente para dinheiro acima do saldo, e não consegue aplicar uma segunda forma dinheiro.

**Independent Test**: Aplicar duas formas diferentes até cobrir o total; aplicar dinheiro acima do total e conferir o troco; tentar aplicar uma segunda forma dinheiro e confirmar o bloqueio (quickstart Cenário 3).

### Tests for User Story 4

- [ ] T024 [P] [US4] Integration test `tests/integration/pagamentoSlice.spec.ts`: aplicar `CartaoCredito` de `70,00` e `Dinheiro` recebido `50,00` sobre total `100,00` → `saldoRestante = 0`, `valorAplicado = 30,00`, `troco = 20,00` — `FR-011`/`FR-012`/SC-002
- [ ] T025 [P] [US4] Integration test `tests/integration/pagamentoSlice.spec.ts`: tentar aplicar uma segunda forma `Dinheiro` após a primeira → bloqueado com toast, lista permanece com os pagamentos anteriores — `FR-013`/SC-003/I2
- [ ] T026 [P] [US4] Integration test `tests/integration/pagamentoSlice.spec.ts`: `Pix` aplicado acima do saldo restante não gera troco, `valorAplicado` limitado ao saldo — `FR-012`
- [ ] T027 [P] [US4] Integration test `tests/integration/pagamentoSlice.spec.ts`: `montarPagamentosParaPayload()` — `Σ FormaValor` é exatamente o total líquido, o troco não aparece em nenhum campo, só pagamentos `APROVADO` entram na lista, e **cada forma do payload carrega `FormaEntrada` ecoado do catálogo** (`research.md` D3, `contracts/erp-pagamento-api.md` §3, `FR-022`/AD-111 — sem esse campo o ERP calcula crediário zero)

### Implementation for User Story 4

- [ ] T028 [US4] Implementar `src/client/features/pagamento/ListaPagamentosAplicados.tsx`: formas aplicadas com status (`PENDENTE_INTEGRACAO`/`APROVADO`/`RECUSADO`), saldo restante e troco via `saldo()` (T010) — `FR-011`/`FR-012` — depende de T010 — **consultar o Pencil MCP antes de implementar** (CLAUDE.md § "Referência visual (design)")
- [ ] T029 [US4] Implementar toast (Goey Toast) de bloqueio para `DINHEIRO_DUPLICADO` e `SALDO_JA_COBERTO` (`ResultadoValidacao.motivo` de T004) — `FR-013` — depende de T004
- [ ] T030 [US4] Implementar `montarPagamentosParaPayload()` completo no slice (T010): `CondicaoPagamentoCodigo`, `FormasDePagamento[]` (só `APROVADO`, com `FormaIntegracaoCartao`/`FormaEntrada`/`TicketDevolucao` ecoados) e `Map<idLinha, Centavos>` do rateio (chama `ratearDescontoCapa`, T005, na montagem — nunca no estado) — `contracts/erp-pagamento-api.md` §3 — depende de T010, T005

**Checkpoint**: User Stories 1, 2 e 4 funcionam de forma independente e integrada — fluxo completo de aplicar/somar/trocar está pronto para a feature 004 consumir.

---

## Phase 6: User Story 5 - Desconto manual em item ou na venda (Priority: P1)

**Goal**: Operador aplica desconto de capa (percentual ou valor, sem teto) e o valor é rateado entre os itens no payload sem perda de centavo e sem item negativo.

**Independent Test**: Aplicar um desconto percentual e um em valor fixo sobre uma venda cujo total não divide exatamente, confirmando distribuição sem perda de centavos e sem estouro de item (quickstart Cenário 4).

**Nota de escopo**: `FR-014` (desconto direto no item) é atendido pelo mecanismo já contratado pela feature 003 (`carrinhoSlice.editarItem(..., 'descontoLinha', ...)`, `research.md` D7) — nenhuma tarefa nova aqui, a feature 008 só possui o desconto de capa.

### Tests for User Story 5

- [ ] T031 [P] [US5] Unit test `tests/unit/domain/pagamento/descontoCapa.spec.ts`: caso de borda `70,00`/`29,00`/`1,00` com desconto de `10,00` → primeira passada `3,34`/`3,33`/`3,33`, terceira linha estoura e é fixada em `1,00`, redistribuição final `4,50`/`4,50`/`1,00`; pós-condições `Σ === descontoCapa` e `parcela_i <= totalLiquido_i` (AD-098) — depende de T005
- [ ] T032 [P] [US5] Integration test `tests/integration/pagamentoSlice.spec.ts`: aplicar desconto de capa acima do subtotal é bloqueado com toast (I8); remover o desconto zera o rateio sem deixar resíduo — `FR-015`
- [ ] T033 [P] [US5] Integration test `tests/integration/pagamentoSlice.spec.ts`: com um pagamento já aplicado à venda (mesmo dentro do limite de I8), `aplicarDescontoCapa` é recusado com toast — o desconto de capa fica congelado enquanto houver pagamento aplicado (I12, `FR-023`/AD-113)

### Implementation for User Story 5

- [ ] T034 [US5] Implementar `aplicarDescontoCapa`/`removerDescontoCapa` em `pagamentoSlice.ts` (T010): guarda I8 (`resolverDescontoCapa(...) <= subtotalCarrinho()`), substitui o `descontoCapa` existente (nunca acumula) — depende de T010, T005
- [ ] T035 [US5] Implementar `src/client/features/pagamento/ModalDescontoCapa.tsx`: escolha percentual/valor, sem teto, sem autorização — `FR-015` — depende de T034 — **consultar o Pencil MCP antes de implementar** (CLAUDE.md § "Referência visual (design)")
- [ ] T036 [US5] Wire a guarda I12 (`FR-023`/AD-113): `aplicarDescontoCapa`/`removerDescontoCapa` recusam quando `pagamentos.length > 0` (venda já tem pagamento aplicado); `podeMutarCarrinho()` (T010, I7) fica pronto para ser injetado pelas features 005/012 como predicado de congelamento de cliente/vendedor — depende de T034

**Checkpoint**: Todas as user stories P1 completas e independentes.

---

## Phase 7: User Story 3 - Aplicar vale devolução (Priority: P2)

**Goal**: Operador aplica um vale devolução numa forma elegível, sem que a finalização peça validação de novo.

**Independent Test**: Aplicar um vale devolução numa forma elegível e numa não elegível, confirmando bloqueio apenas na segunda, e confirmando que a finalização não pede validação de novo (quickstart Cenário 5).

### Tests for User Story 3

- [ ] T037 [P] [US3] Unit test `tests/unit/domain/pagamento/valeDevolucao.spec.ts`: `fpgUtiCar` vazio → elegível (AD-048); valor explicitamente não-vale → inelegível; `interpretarRespostaTicket` usa só `Valido`, ignora `Mensagem` (AD-101) — depende de T006
- [ ] T038 [P] [US3] Integration test `tests/integration/pagamentoSlice.spec.ts`: vale válido soma o valor ao pagamento vinculado e emite `VALE_DEVOLUCAO_USADO`; vale inválido dispara toast com a `mensagem` do ERP e emite `PAGAMENTO_RECUSADO`, sem mutar o pagamento; após aplicado, nenhuma segunda chamada a `ValidaTicketDevolucao` ocorre (`FR-009`/SC-001, quickstart Cenário 5 passo 5) — depende de T009, T010

### Implementation for User Story 3

- [ ] T039 [US3] Implementar `aplicarValeDevolucao` em `pagamentoSlice.ts` (T010): única action assíncrona do slice — recusa no-op com toast se `!ehElegivelParaVale(forma)` (T006); senão `await validarTicket(codigo)` (T009) e, se `valido`, vincula `ValeDevolucaoAplicado` ao pagamento e soma o valor — `FR-008`/`FR-009`. **Emite auditoria explicitamente**: `VALE_DEVOLUCAO_USADO` quando válido, `PAGAMENTO_RECUSADO` quando inválido (feature 001, AD-061) — `FR-017` — depende de T010, T009, T006
- [ ] T040 [US3] Implementar `src/client/features/pagamento/ModalValeDevolucao.tsx`: código do vale, elegibilidade e resultado — `FR-008`/`FR-010` — depende de T039 — **consultar o Pencil MCP antes de implementar** (CLAUDE.md § "Referência visual (design)")

**Checkpoint**: Todas as 5 user stories funcionam de forma independente e integrada — feature completa (`FR-001` a `FR-023`).

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Fechamento das dependências injetadas com stubs, gates finais e validação ponta a ponta.

- [ ] T041 [P] Wire as dependências injetadas do slice (`PagamentoDeps`) com stubs até as features reais estarem prontas: `capacidades()` (stub `{ tefAtivo: true, pixAtivo: true }` até 002 — sem `plataforma` desde AD-144), `subtotalCarrinho()`/`linhasRateaveis()` (stub até 003 real), `validarInsercao()`/`invalidarVeredito()` (stub sempre `ACEITA` até 014), `iniciarIntegracao()` (stub no-op até 009/010) — nenhuma bloqueia esta feature — `contracts/pagamento-domain-api.md` §2
- [ ] T042 Rodar `npx tsc --noEmit` e confirmar zero erros de tipo — gate obrigatório da Constitution (`Development Workflow`)
- [ ] T043 E2E `tests/e2e/pagamento-geral.spec.ts` (fluxo dourado do quickstart, desktop com `tefAtivo: false`): carrinho de 3 itens (`100,00`) → condição "A VISTA" → desconto de capa `10%` → `CartaoCredito` `60,00` → `Dinheiro` recebido `40,00` (aplicado `30,00`, troco `10,00`) → saldo zerado → payload com `Σ FormaValor = 90,00`, `DescontoValor` por item somando `10,00`, sem campo de troco
- [ ] T044 Rodar os 8 cenários de `quickstart.md` (catálogo, roteamento, split/troco, desconto de capa, vale devolução, bloqueio do carrinho, duplicata, auditoria) e confirmar `SC-001`, `SC-002`, `SC-003`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Depende de 002 (Fase 1) e 001 (Foundational, `vendaStore.ts`) — fora desta feature
- **Foundational (Phase 2)**: Depende do Setup — BLOQUEIA as 5 user stories
- **User Stories (Phase 3-7)**: Todas dependem do Foundational
  - US1 pode começar assim que Phase 2 terminar
  - US2 depende só do Foundational (o roteamento já está em T010; esta fase é de validação)
  - US4 depende do Foundational; estende `pagamentoSlice.ts` (T010) e usa `descontoCapa.ts` (T005) só na montagem do payload
  - US5 depende do Foundational (T005, T010)
  - US3 (P2) depende do Foundational (T006, T009, T010) — pode rodar em paralelo às demais, mas é a última em prioridade
- **Polish (Phase 8)**: Depende das 5 user stories completas

### User Story Dependencies

- **US1 (P1)**: Depende de Foundational (T009, T010) — sem dependência de outras stories
- **US2 (P1)**: Depende de Foundational (T003, T010) — sem dependência de outras stories; sobrepõe-se ao Foundational porque o roteamento é implementado ali
- **US4 (P1)**: Depende de Foundational (T004, T005, T010) — sem dependência de outras stories
- **US5 (P1)**: Depende de Foundational (T005, T010) — sem dependência de outras stories
- **US3 (P2)**: Depende de Foundational (T006, T009, T010) — sem dependência de outras stories

### Within Each User Story

- Testes antes da implementação correspondente, onde aplicável
- Domínio puro (Foundational) antes de qualquer wiring de slice
- Wiring de slice antes dos componentes de UI que o consomem
- Story completa antes do checkpoint

### Parallel Opportunities

- T002, T005, T007 (Foundational, sem dependência entre si) em paralelo
- T011–T013 (testes unitários Foundational) em paralelo entre si
- T015–T017 (testes de invariantes cruzadas — I6/I7, FR-021, FR-020 — Foundational) em paralelo entre si, todos só dependem de T010
- T018 (teste US1) isolado
- T021–T023 (testes US2) em paralelo
- T024–T027 (testes US4) em paralelo
- T031–T033 (testes US5) em paralelo
- T037–T038 (testes US3) em paralelo
- US2, US4, US5 e US3 podem ser trabalhadas em paralelo por desenvolvedores diferentes após o Foundational (arquivos majoritariamente distintos, exceto o corpo comum de `pagamentoSlice.ts` — coordenar merges)

---

## Parallel Example: Foundational

```bash
# Módulos de domínio sem dependência entre si (mesma pasta, arquivos diferentes):
Task: "Implementar formaPagamento.ts em src/client/domain/pagamento/formaPagamento.ts"
Task: "Implementar descontoCapa.ts em src/client/domain/pagamento/descontoCapa.ts"
Task: "Implementar pagamento.schema.ts em src/shared/schemas/pagamento.schema.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Completar Phase 1: Setup (pressupõe 002 e 001 já implementadas)
2. Completar Phase 2: Foundational (bloqueia tudo, inclui o núcleo de `aplicarPagamento`, a auditoria e as invariantes de reversibilidade/revalidação)
3. Completar Phase 3: User Story 1
4. **PARAR e VALIDAR**: catálogo de formas/condições visível com as flags corretas, com o gate de aplicação já funcional por baixo (mesmo sem UI de split/desconto/vale ainda)

### Incremental Delivery

1. Setup + Foundational → domínio, catálogo e núcleo do slice prontos
2. US1 → validar isoladamente (catálogo e disponibilidade)
3. US2 → validar isoladamente (roteamento — grande parte já coberta pelo Foundational)
4. US4 → validar isoladamente + em conjunto com US1/US2 (split, troco, payload) — fluxo mínimo de venda com pagamento completo
5. US5 → validar isoladamente (desconto de capa com clamp)
6. US3 (P2) → validar isoladamente (vale devolução) — feature completa
7. Polish → stubs finais + gates + E2E

### Parallel Team Strategy

Com mais de um desenvolvedor: completar Setup + Foundational juntos (é o maior bloco, concentra o gate `FR-019`/`FR-020`/`FR-021` e a auditoria); depois um desenvolvedor segue com US1+US2 (catálogo e roteamento, ambos leves), outro com US4 (split/troco/payload, o mais pesado), outro com US5 (desconto de capa) e US3 (vale devolução) em sequência — coordenando merges em `pagamentoSlice.ts` (T010).

---

## Notes

- [P] = arquivos diferentes, sem dependências
- [Story] mapeia cada tarefa à user story correspondente para rastreabilidade
- Verificar que os testes falham antes de implementar (TDD onde aplicável) — prioridade no gate de `aplicarPagamento` e no algoritmo de rateio (`plan.md` § Testing)
- Commit após cada tarefa ou grupo lógico
- Parar em cada checkpoint para validar a story isoladamente
- `podeMutarCarrinho()` (T010/T036) é consumido pela feature 003 (I7) e, por extensão de I12, será injetado nas features 005/012 quando elas forem desenhadas — nenhuma delas precisa estar implementada para esta feature ser completada e testada com stubs
- `validarInsercao()`/`invalidarVeredito()` (T010, T041; testados em T014/T016) chegam por injeção da feature 014 (`FR-019`/`FR-021`, AD-109/AD-113) — mesmo padrão de `podeFinalizar()` já usado pela feature 004; a 014 não precisa estar implementada. `validarInsercao` recebe um segundo argumento, `origem: 'MANUAL' | 'ATALHO_CENARIO'` (achado I1 do `/speckit-analyze` da 014, 2026-09-01) — `aplicarPagamento` sempre passa `'MANUAL'`, `aplicarForma` sempre passa `'ATALHO_CENARIO'`; nenhuma das duas assinaturas públicas muda
- `iniciarIntegracao()` (T010, T041) chega por injeção das features 009 (PIX) e 010 (TEF) — nenhuma delas é pré-requisito (`research.md` D5/D14)
- Os 5 eventos de auditoria de `FR-017` (`CONDICAO_PAGAMENTO_APLICADA`, `FORMA_PAGAMENTO_APLICADA`, `FORMA_PAGAMENTO_REMOVIDA`, `VALE_DEVOLUCAO_USADO`, `PAGAMENTO_RECUSADO`) estão distribuídos entre T020 (Foundational/US1) e as instruções explícitas de T010 e T039 — nenhuma implementação nova além dessas três tarefas

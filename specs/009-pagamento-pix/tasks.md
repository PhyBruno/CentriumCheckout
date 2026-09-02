---

description: "Task list template for feature implementation"
---

# Tasks: Pagamento — PIX

**Input**: Design documents from `specs/009-pagamento-pix/` (`plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/erp-pix-api.md`, `contracts/pix-domain-api.md`, `quickstart.md`)

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: Incluídos — `plan.md` § Testing e `quickstart.md` definem 3 camadas explícitas (domínio puro, integração do modal, E2E) com arquivos-alvo nomeados.

**Organization**: A spec lista 3 user stories, todas P1 (`US1` acompanhar aprovação, `US2` ocultar PIX indisponível, `US3` fechar cobrança pendente e trocar forma). Ordem de fase segue a ordem de dependência natural de construção, não a ordem numérica bruta da spec: **US1** (fluxo dourado — gerar, exibir, sondar, aprovar) → **US3** (fechar/abandonar, reaproveita a mesma infraestrutura de sondagem de US1 para convergir a falha terminal detectada pelo ERP no mesmo caminho de UX, `research.md` D11) → **US2** (sem nenhuma implementação nova nesta feature — `research.md` D1 já atribui `FR-003` a `formaDisponivel`, feature 008; aqui só existe um teste de fronteira).

**⚠️ Ordem de implementação e dependências cruzadas**: esta feature depende de **002** (bootstrap + proxy `/api/erp/*`, `ConfiguracoesPIX.MinimoPix`), **003** (`Centavos`, tipo importado, nunca redefinido), **005** (`ClienteVenda`/`clienteAtual` para `montarDadosPagador`) e **008** (`PagamentoAplicado`, `SaldoPagamento.saldoRestante`, `resolverIntegracao`, e as actions já expostas `confirmarPagamentoIntegrado`/`recusarPagamentoIntegrado` do `pagamentoSlice`). Esta feature **implementa** o lado PIX do ponto de injeção `iniciarIntegracao` que a feature 008 deixou stubado (`specs/008-pagamento-geral/tasks.md`, T041) — a Fase 6 (Polish) desta feature substitui esse stub por uma implementação real, tocando `ListaPagamentosAplicados.tsx` (arquivo de 008). Nenhum estado novo é acrescentado ao `vendaStore` (Constitution VI) — `CobrancaPix` é estado efêmero local ao `ModalPix`.

**Nota de escopo — `FR-012`**: `FR-012` ("MUST NOT gerar cobrança PIX sem veredito favorável da validação prévia da venda") não tem nenhuma tarefa nesta feature, pelo mesmo motivo estrutural de `FR-003`/US2 (ver Fase 5): o gate mora em `aplicarPagamento` (feature 008), acionado pela validação prévia da feature 014 (`FR-019`/AD-109 de 008), e é alcançado **antes** de `iniciarIntegracao('PIX_DINAMICO', ...)` disparar qualquer código desta feature — 009 nunca chega a existir numa venda recusada, então não há o que testar aqui. O teste que prova essa ordem é o cenário 6 de `specs/014-validacao-previa-nfce/quickstart.md` (venda recusada ⇒ nenhum QR Code, nenhum "copia e cola", nenhum registro no adquirente), já referenciado em `plan.md` ("Emenda de 2026-08-31").

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência de tarefas incompletas)
- **[Story]**: A qual user story a tarefa pertence (US1, US2, US3)
- Caminhos de arquivo exatos em cada descrição

## Path Conventions

Quinta extensão da árvore proposta pela feature 002 (ver `plan.md` § Structure Decision):

```text
src/client/domain/pix/                       # camada pura — interpretarStatusPix, validarValorMinimoPix, montarDadosPagador
src/client/services/pix/                     # pixQueries.ts, pixMapper.ts
src/client/features/pagamento/pix/           # ModalPix.tsx
src/shared/schemas/                          # pix.schema.ts (diretório já existe, criado pela feature 008)
tests/unit/domain/pix/ | tests/integration/ | tests/e2e/
```

**⚠️ Consulta ao Pencil MCP obrigatória para tarefas de UI (CLAUDE.md § "Referência visual (design)")**: toda tarefa desta lista que cria ou altera saída visual (tela, componente, modal, layout, ícone, estado de loading/vazio) está marcada abaixo com "consultar o Pencil MCP antes de implementar" — a fonte de verdade do visual é sempre o Pencil MCP (`get_editor_state(include_schema:true)` → `batch_get`/`get_screenshot`/`get_variables`/`snapshot_layout` sobre o nó real da tela em `design/CentriumCheckout.pen`), nunca o código existente nem senso genérico de design. Tarefas afetadas: T016, T018, T021, T024.

---

## Phase 1: Setup

**Purpose**: Criar os diretórios específicos desta feature sobre a árvore já existente (002/003/005/008).

- [ ] T001 Criar estrutura de diretórios desta feature: `src/client/domain/pix/`, `src/client/services/pix/`, `src/client/features/pagamento/pix/`, `tests/unit/domain/pix/` (`src/shared/schemas/`, `tests/integration/` e `tests/e2e/` já existem, criados pelas features 002/008)

**Checkpoint**: Diretórios prontos — depende de `src/client/` já existir (Fase 1 da 002) e do `pagamentoSlice.ts` já existir (Foundational da 008).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Os 3 módulos de domínio puro, a fronteira Zod e a camada de query — porque **toda** user story (US1 e US3; US2 não introduz código novo) depende de gerar e interpretar uma cobrança PIX.

**⚠️ CRITICAL**: Nenhuma user story pode começar até esta fase terminar.

- [ ] T002 [P] Implementar `src/client/domain/pix/interpretarStatusPix.ts`: função pura e total, união fechada de 10 literais (`data-model.md` §2, `research.md` D8, **AD-102**) — `'P'`/`'M'` → `APROVADO`; `'C'`/`'A'`/`'G'` → `PENDENTE`; `'X'`/`'R'`/`'E'`/`'F'`/`'O'` → `FALHA_TERMINAL` com `motivo` específico; qualquer outro valor → `FALHA_TERMINAL` (`motivo: 'DESCONHECIDO'`), nunca `APROVADO` por omissão (Constitution IV, invariante J2)
- [ ] T003 [P] Implementar `src/client/domain/pix/validarValorMinimoPix.ts`: `(saldoRestante: Centavos, minimoPix: Centavos) => { ok: true } | { ok: false }` (`research.md` D13)
- [ ] T004 [P] Implementar `src/client/domain/pix/montarDadosPagador.ts`: `(clienteAtual: ClienteVenda | null) => DadosPagadorPix` — `nome`/`documento` de `clienteAtual` (`?? ''`), `email`/`telefone` sempre `''` (gap documentado, não omissão silenciosa, `research.md` D7/AD-100); `clienteAtual === null` devolve todos os campos vazios sem lançar
- [ ] T005 [P] Implementar `src/shared/schemas/pix.schema.ts` (Zod): `GerarPIXOutput` (`TrnGUID`, `Trnbase64text`, `Trnbase64image`, todos `string`) e `StatusPIXOutput` (`StatusTransacao` como `string` livre — não união fechada, `messages`) — `research.md` D15, `contracts/erp-pix-api.md` §1/§2
- [ ] T006 Implementar `src/client/services/pix/pixMapper.ts`: `GerarPIXOutput`/`StatusPIXOutput` validados (T005) → `CobrancaPix`/`ResultadoStatusPix` do domínio, aplicando `interpretarStatusPix` (T002) sobre `StatusTransacao` e decodificando `Trnbase64text` (`atob`) — depende de T002, T005
- [ ] T007 Implementar `src/client/services/pix/pixQueries.ts`: `useGerarPix()` (`gerar(input)` chama `POST /api/erp/GerarPIX`, expõe `status: 'idle' | 'gerando' | 'erro'`/`erro`) e `useStatusPix(trnGuid, habilitado)` (`useQuery` com `refetchInterval: habilitado ? 10_000 : false` sobre `GET /api/erp/StatusPIX`, já passando a resposta por T006) — `research.md` D9, `contracts/pix-domain-api.md` §2 — depende de T005, T006
- [ ] T008 [P] Unit test `tests/unit/domain/pix/interpretarStatusPix.spec.ts`: os 10 literais confirmados (AD-102) mapeados 1:1 para a tabela de `data-model.md` §2, mais um valor desconhecido (string vazia e um caractere fora da união) devolvendo `FALHA_TERMINAL`/`DESCONHECIDO`, nunca `APROVADO` (invariante J2) — depende de T002
- [ ] T009 [P] Unit test `tests/unit/domain/pix/validarValorMinimoPix.spec.ts`: `saldoRestante` igual, acima e abaixo de `minimoPix` — depende de T003
- [ ] T010 [P] Unit test `tests/unit/domain/pix/montarDadosPagador.spec.ts`: cliente identificado (`origem: 'BUSCA_DOCUMENTO'`), cliente default (`documento: null` → `TrnPagadorCgc` vazio, nunca `null`), e `clienteAtual === null` (todos os campos vazios, sem lançar) — depende de T004

**Checkpoint**: Domínio puro, fronteira Zod e camada de query prontos — nenhuma user story ainda expõe UI.

---

## Phase 3: User Story 1 - Acompanhar ativamente a aprovação do PIX (Priority: P1) 🎯 MVP

**Goal**: Operador gera uma cobrança PIX, vê o QR Code e o "copia e cola", e o sistema detecta a aprovação sozinho, consultando o status a cada 10 segundos, sem depender de notificação do servidor.

**Independent Test**: Gerar uma cobrança PIX e alternar seu status entre pendente e aprovado, confirmando que a mudança é detectada (quickstart Cenário 1).

### Tests for User Story 1

- [ ] T011 [P] [US1] Integration test `tests/integration/ModalPix.spec.tsx`: fluxo dourado — gera cobrança, exibe QR Code/copia-e-cola, `StatusPIX` retorna `'G'` em `t=0s`/`t=10s` (sem transição), `'P'` em `t=20s` → `onAprovado(trnGuid)` chamado e polling para; repetir com `'M'` (mesmo resultado esperado) — `FR-001`/`FR-002`/`FR-008` (quickstart Cenário 1) — depende de T007
- [ ] T012 [P] [US1] Integration test `tests/integration/ModalPix.spec.tsx`: `saldoRestante` abaixo de `minimoPix` → toast de bloqueio, modal não abre, nenhuma chamada a `GerarPIX` — `FR-009` (quickstart Cenário 5) — depende de T003
- [ ] T013 [P] [US1] Integration test `tests/integration/ModalPix.spec.tsx`: venda com pagamento parcial já aplicado (ex. `40,00` de `100,00`) → `TrnValor` enviado a `GerarPIX` é o saldo residual (`60,00`), nunca o total cheio — `FR-010` (quickstart Cenário 6) — depende de T007
- [ ] T014 [P] [US1] Integration test `tests/integration/ModalPix.spec.tsx`: `GerarPIX` retorna erro na primeira chamada, sucesso na segunda após "Tentar novamente" — segunda chamada usa `TrnGUID` diferente da primeira — `FR-011` (quickstart Cenário 7, `research.md` D12) — depende de T007
- [ ] T015 [P] [US1] Integration test `tests/integration/ModalPix.spec.tsx`: cliente identificado (`nome`/`documento` preenchidos) vs. cliente default (`documento: null`) — payload de `GerarPIX` reflete `TrnPagadorNome`/`TrnPagadorCgc` de cada cenário, `TrnPagadorCgc` nunca `null`/`undefined` bruto no JSON quando vazio; `TrnPagadorEmail`/`TrnPagadorFone` sempre `''` — `research.md` D7/AD-100 (quickstart Cenário 8) — depende de T004

### Implementation for User Story 1

- [ ] T016 [US1] Implementar `src/client/features/pagamento/pix/ModalPix.tsx`: ao abrir, valida `validarValorMinimoPix` (T003); se falhar, toast e não chama rede; senão chama `useGerarPix().gerar({ formaCodigo, valor: saldoRestante, pagador: montarDadosPagador(clienteAtual) })` (T004, T007); em sucesso, decodifica e exibe QR Code (`<img src="data:image/jpeg;base64,...">`) e "copia e cola" (`atob` + botão "Copiar" via Clipboard API) — `FR-008`/`FR-009`/`FR-010`, `contracts/pix-domain-api.md` §3 — depende de T003, T004, T007 — **consultar o Pencil MCP antes de implementar** (`get_editor_state(include_schema: true)`, depois `batch_get`/`get_screenshot`/`get_variables`/`snapshot_layout` sobre o nó real da tela em `design/CentriumCheckout.pen`; nunca inferir o visual do código existente ou de senso genérico de design — CLAUDE.md § "Referência visual (design)")
- [ ] T017 [US1] Wire o polling em `ModalPix.tsx` (T016): habilita `useStatusPix(trnGuid, true)` (T007) assim que a cobrança é gerada; cada resultado passa por `interpretarStatusPix` (T002, já aplicado em T006) — `situacao === 'APROVADO'` chama `onAprovado(trnGuid)` e desabilita o polling na mesma renderização (nunca depende só do `refetchInterval` parar sozinho) — `FR-001`/`FR-002`, `research.md` D9 — depende de T002, T016
- [ ] T018 [US1] Implementar retry de geração em `ModalPix.tsx` (T016): erro de `useGerarPix().gerar` exibe toast (Goey Toast) com "Tentar novamente", que rechama `gerar` com um **novo** `TrnGUID` (nunca reaproveita o de uma tentativa que falhou) — `FR-011`, `research.md` D12 — depende de T016 — **consultar o Pencil MCP antes de implementar** (CLAUDE.md § "Referência visual (design)")

**Checkpoint**: User Story 1 funcional e testável de forma independente — fluxo dourado completo (geração → exibição → sondagem → aprovação), incluindo bloqueio de valor mínimo, saldo residual, retry e dados do pagador.

---

## Phase 4: User Story 3 - Fechar a cobrança PIX pendente e trocar de forma de pagamento (Priority: P1)

**Goal**: Operador consegue fechar a tela de PIX com uma cobrança ainda pendente e aplicar outra forma no lugar, sem travar a venda e sem que o Checkout dispare qualquer cancelamento automático; o mesmo tratamento se aplica quando é o próprio ERP quem reporta uma falha terminal via sondagem.

**Independent Test**: Gerar uma cobrança PIX, fechar a tela antes da aprovação, confirmar o aviso exibido, e aplicar outra forma de pagamento no lugar (quickstart Cenário 3); repetir para uma falha terminal reportada pelo ERP via sondagem (quickstart Cenário 4).

### Tests for User Story 3

- [ ] T019 [P] [US3] Integration test `tests/integration/ModalPix.spec.tsx`: `StatusPIX` sempre retorna `'G'`; operador fecha o modal manualmente → aviso de desassociação manual exibido, `PagamentoAplicado` removido (não fica `PENDENTE_INTEGRACAO` órfão), nenhuma chamada HTTP de cancelamento disparada (`list_network_requests`), operador consegue aplicar outra forma no valor total restante; avançar o relógio de teste por mais de 10s após o fechamento e confirmar que **nenhuma nova chamada a `GET StatusPIX` ocorre** (invariante J3, `data-model.md` §5 — o polling não continua em background) — `FR-004`/`FR-005`/`FR-006`/`FR-007` (quickstart Cenário 3) — depende de T007
- [ ] T020 [P] [US3] Integration test `tests/integration/ModalPix.spec.tsx`: `StatusPIX` retorna `'X'`/`'R'`/`'E'`/`'F'`/`'O'` em `t=10s` (um teste por literal) — mesmo tratamento do Cenário 3 (aviso + remoção do pagamento local), diferença é que o gatilho vem da sondagem, não de uma ação do operador; nenhuma chamada de cancelamento; avançar o relógio de teste após a falha terminal detectada e confirmar que o polling não emite nenhuma chamada adicional a `StatusPIX` (invariante J3) — `data-model.md` §4/§5 (quickstart Cenário 4) — depende de T002, T017

### Implementation for User Story 3

- [ ] T021 [US3] Implementar `onFechar` em `ModalPix.tsx` (T016): se o pagamento ainda está `PENDENTE_INTEGRACAO` ao fechar, exibe aviso ("será necessário desassociar esta cobrança manualmente na Central de Transações PIX, fora do Checkout") e chama `onAbandonado('FECHADO_PELO_OPERADOR')` — nenhuma chamada HTTP de cancelamento é feita — `FR-004`/`FR-005`/`FR-006`/`FR-007`, `research.md` D11 — depende de T016 — **consultar o Pencil MCP antes de implementar** (CLAUDE.md § "Referência visual (design)")
- [ ] T022 [US3] Wire o branch `FALHA_TERMINAL` do polling (T017) para o **mesmo** `onAbandonado(motivo)` de T021 (não um segundo caminho de código) — desabilita o polling na mesma renderização, sem chamada de cancelamento — `data-model.md` §4, `research.md` D11 — depende de T017, T021

**Checkpoint**: User Stories 1 e 3 completas e integradas — o modal cobre tanto a aprovação quanto o abandono (manual ou por falha terminal reportada pelo ERP), convergindo no mesmo tratamento de UX.

---

## Phase 5: User Story 2 - Ocultar PIX quando não disponível (Priority: P1)

**Goal**: Operador não vê a opção de PIX quando o ambiente não a utiliza.

**Independent Test**: Com o ambiente configurado sem PIX habilitado, confirmar que a opção não aparece na tela de pagamento (quickstart Cenário 2).

**Nota de escopo**: `FR-003` já é responsabilidade de `formaDisponivel`/`resolverIntegracao` (feature 008, `research.md` D1) — esta feature nunca verifica `ConfiguracoesPIX.UtilizaCentriumPAG` de novo, e não introduz nenhuma tarefa de implementação nova. A única tarefa desta fase é o teste de fronteira que prova que `ModalPix` (009) nunca é alcançado sem o veredito favorável de 008.

### Tests for User Story 2

- [ ] T023 [P] [US2] Integration test `tests/integration/ModalPix.spec.tsx`: com `ConfiguracoesPIX.UtilizaCentriumPAG = false`, `resolverIntegracao(...)` nunca devolve `PIX_DINAMICO` e `ModalPix` nunca é montado — nenhum request a `GerarPIX` é possível (quickstart Cenário 2) — depende do stub/mock de `resolverIntegracao` (008)

**Checkpoint**: Todas as 3 user stories completas e independentes.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Substituir o stub de integração deixado pela feature 008 por esta implementação real, e validar ponta a ponta.

- [ ] T024 Substituir o stub no-op de `iniciarIntegracao` (`specs/008-pagamento-geral/tasks.md`, T041) por uma implementação real para `PIX_DINAMICO`: em `src/client/features/pagamento/ListaPagamentosAplicados.tsx` (008), renderizar `<ModalPix>` (T016) quando um `PagamentoAplicado` está `PENDENTE_INTEGRACAO` com `integracao === 'PIX_DINAMICO'`, ligando `onAprovado` → `confirmarPagamentoIntegrado(idPagamento, { pixGuid })`, `onAbandonado` → `recusarPagamentoIntegrado(idPagamento, motivo)` (ambos já existentes no `pagamentoSlice`, feature 008) — `contracts/pix-domain-api.md` §3 — depende de T016, T021 — **consultar o Pencil MCP antes de implementar** (CLAUDE.md § "Referência visual (design)")
- [ ] T025 Rodar `npx tsc --noEmit` e confirmar zero erros de tipo — gate obrigatório da Constitution (`Development Workflow`)
- [ ] T026 E2E `tests/e2e/pagamento-pix.spec.ts` (fluxo dourado do quickstart, via Playwright, mock de rede não de função): abrir tela de pagamento → selecionar PIX → confirmar QR Code renderizado (`<img>` com `src` iniciando em `data:image/jpeg;base64,`) → confirmar botão "Copiar" funcional (Clipboard API) → simular aprovação via mock → confirmar navegação de volta à tela de pagamento com a forma PIX listada como aplicada e saldo zerado
- [ ] T027 Rodar os 8 cenários de `quickstart.md` (fluxo dourado, PIX oculto, fechamento manual, falha terminal, valor mínimo, saldo residual, retry de geração, dados do pagador) e confirmar `SC-001`/`SC-002`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Depende de 002 (Fase 1) e 008 (Foundational, `pagamentoSlice.ts`) — fora desta feature
- **Foundational (Phase 2)**: Depende do Setup — BLOQUEIA as 3 user stories
- **User Stories (Phase 3-5)**: Todas dependem do Foundational
  - US1 pode começar assim que Phase 2 terminar
  - US3 depende do Foundational e de T016/T017 (US1) — reaproveita o `ModalPix` e o polling já implementados por US1, não é independente de código, mas é independentemente testável (Independent Test próprio)
  - US2 depende só do Foundational — sem nenhuma implementação nova, só teste de fronteira com 008
- **Polish (Phase 6)**: Depende de US1 e US3 completas (T016, T021); E2E/quickstart dependem de todas as 3 stories

### User Story Dependencies

- **US1 (P1)**: Depende de Foundational (T003, T004, T007) — sem dependência de outras stories
- **US3 (P1)**: Depende de Foundational e de US1 (T016, T017) — `ModalPix` e o polling são um único componente/hook compartilhado, não duplicado
- **US2 (P1)**: Depende de Foundational — sem dependência de código de US1/US3, só do veredito de 008

### Within Each User Story

- Testes antes da implementação correspondente, onde aplicável
- Domínio puro (Foundational) antes de qualquer wiring de `ModalPix`
- Geração e exibição (US1) antes do fechamento/abandono (US3), pois ambos vivem no mesmo componente
- Story completa antes do checkpoint

### Parallel Opportunities

- T002, T003, T004, T005 (Foundational, sem dependência entre si) em paralelo
- T008–T010 (testes unitários Foundational) em paralelo entre si
- T011–T015 (testes de integração US1) em paralelo entre si
- T019–T020 (testes de integração US3) em paralelo entre si
- US2 (T023) pode ser trabalhada em paralelo a US1/US3 por não compartilhar arquivo de implementação

---

## Parallel Example: Foundational

```bash
# Módulos de domínio sem dependência entre si (pastas/arquivos diferentes):
Task: "Implementar interpretarStatusPix.ts em src/client/domain/pix/interpretarStatusPix.ts"
Task: "Implementar validarValorMinimoPix.ts em src/client/domain/pix/validarValorMinimoPix.ts"
Task: "Implementar montarDadosPagador.ts em src/client/domain/pix/montarDadosPagador.ts"
Task: "Implementar pix.schema.ts em src/shared/schemas/pix.schema.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Completar Phase 1: Setup (pressupõe 002 e 008 já implementadas)
2. Completar Phase 2: Foundational
3. Completar Phase 3: User Story 1
4. **PARAR e VALIDAR**: fluxo dourado completo (geração, exibição, sondagem, aprovação) funcional isoladamente, mesmo sem o fechamento/abandono de US3 ainda

### Incremental Delivery

1. Setup + Foundational → domínio, schema e query prontos
2. US1 → validar isoladamente (fluxo dourado, valor mínimo, saldo residual, retry, dados do pagador) — MVP
3. US3 → validar isoladamente (fechamento manual + falha terminal via sondagem, mesmo tratamento)
4. US2 → validar isoladamente (nenhuma implementação nova, só o teste de fronteira com 008)
5. Polish → wiring real do `iniciarIntegracao` (substitui stub 008), gates, E2E

### Parallel Team Strategy

Com mais de um desenvolvedor: completar Setup + Foundational juntos; depois um desenvolvedor segue com US1 (o `ModalPix` em si, mais pesado) enquanto outro prepara os testes de US3/US2 que dependem dele — coordenando o merge em `ModalPix.tsx` (T016) antes de iniciar a implementação de US3.

---

## Notes

- [P] = arquivos diferentes, sem dependências
- [Story] mapeia cada tarefa à user story correspondente para rastreabilidade
- Verificar que os testes falham antes de implementar (TDD onde aplicável)
- Commit após cada tarefa ou grupo lógico
- Parar em cada checkpoint para validar a story isoladamente
- T024 (Polish) é a única tarefa desta feature que toca um arquivo de propriedade da feature 008 (`ListaPagamentosAplicados.tsx`) — substitui exatamente o stub deixado por `specs/008-pagamento-geral/tasks.md` T041, sem introduzir um segundo mecanismo de disparo de integração
- `TrnPagadorEmail`/`TrnPagadorFone` permanecem sempre vazios nesta versão (`research.md` D7) — gap de escopo aceito, não uma pendência desta feature nem do ERP

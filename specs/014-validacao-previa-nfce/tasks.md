---

description: "Task list template for feature implementation"
---

# Tasks: Validação Prévia da Venda no ERP (`ValidarNFCe`)

**Input**: Design documents from `specs/014-validacao-previa-nfce/` (`plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/erp-validacao-api.md`, `contracts/validacao-domain-api.md`, `quickstart.md`)

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: Incluídos — `plan.md` § Testing define 3 camadas explícitas (unitário puro do domínio, integração do slice, E2E) com arquivos-alvo nomeados, incluindo o teste negativo obrigatório de AD-110.

**Organization**: 4 user stories em `spec.md` — US1 (P1), US2 (P1), US3 (P1), US4 (P2). Diferente do padrão CRUD comum, as três primeiras não são fluxos separados: são três leituras de aceitação sobre o **mesmo** mecanismo (`validarInsercao`), que só existe uma vez. Por isso, seguindo o mesmo padrão já usado pela feature 008 (gate `aplicarPagamento` inteiro na fase Foundational, T010) e pela feature 004 (máquina de estados inteira na fase Foundational, T008), esta lista implementa o mecanismo completo na fase Foundational e usa as fases de user story quase inteiramente para os testes que verificam cada leitura de aceitação — sem reimplementar nada story a story.

**⚠️ Ordem de implementação e dependências cruzadas — o que já está pronto do lado de fora**: esta feature depende de **002** (sessão/`Empresa`), **003/005/012** (snapshot de carrinho/cliente/vendedor consumidos por `montarRetratoVenda`), **004** e **008**, que **já foram desenhadas sabendo que a 014 existiria**:

- `src/client/domain/venda/montarRetratoVenda.ts` **já está especificado** em `specs/004-finalizacao-suspensao-venda/tasks.md` T004, parametrizado para `'FATURAR' | 'SUSPENDER' | 'VALIDAR'`, com o teste de equivalência I5 (`VALIDAR` ≡ `FATURAR` exceto `SuspenderOuFaturar`) já coberto por T009 da 004. Esta feature **reutiliza** o módulo — nenhuma tarefa aqui o reimplementa.
- `src/client/stores/slices/pagamentoSlice.ts` (008) **já chama** `validarInsercao(candidata)` e `invalidarVeredito()` como dependências injetadas dentro de `aplicarPagamento`/`removerPagamento` (T010), hoje presas a um stub sempre-aceita (T041). O payload do catálogo já ecoa `FormaEntrada` (T007/T027, AD-111).
- `src/client/features/finalizacao-suspensao/useFinalizarOuSuspenderVenda.ts` (004) **já consulta** `podeFinalizar()` injetado antes de `FATURAR` (T017), hoje preso a um stub sempre-`true` (T029).
- A factory `VALIDACAO_VENDA_RECUSADA` **já existe** em `src/client/domain/auditoria/eventos.ts` (001, T018) — nenhuma tarefa nova de auditoria aqui.
- O congelamento amplo de I10 (carrinho, cliente, vendedor, desconto de capa) **já está coberto**: `podeMutarCarrinho()` (008, T010/T036) é o único predicado consumido por 003 (edição de item), 005 (`selecionarCliente`, T014) e 012 (`selecionarVendedor`, T010) — como é o mesmo predicado em todos os call sites, ele já congela os quatro simultaneamente assim que há pagamento aplicado; nenhuma emenda nova é necessária nessas features.

O trabalho real desta feature é: implementar o mecanismo (`validacaoVendaSlice`, domínio puro, serviço, notificação) e **substituir os dois stubs** (008 T041, 004 T029) pela implementação real na composição de `vendaStore.ts`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência de tarefas incompletas)
- **[Story]**: A qual user story a tarefa pertence (US1/US2/US3/US4)
- Caminhos de arquivo exatos em cada descrição

## Path Conventions

Extensão da árvore já proposta pelas features 001/002/003/004/008 (ver `plan.md` § Project Structure):

```text
src/client/domain/venda/                 # montarRetratoVenda.ts — já existe (004 T004), reutilizado, não recriado
src/client/domain/validacaoVenda/        # interpretarVeredito.ts, projetarPagamentos.ts — só desta feature
src/client/stores/slices/                # validacaoVendaSlice.ts, combinado em vendaStore.ts (já existe, feature 001)
src/client/services/validacao/           # validarNFCeMutation.ts
src/client/features/validacao/           # notificarVeredito.ts
src/shared/schemas/                      # validarNFCe.schema.ts (diretório já existe, feature 001/008)
tests/unit/domain/validacaoVenda/ | tests/integration/ | tests/e2e/
```

---

## Phase 1: Setup

**Purpose**: Criar os diretórios específicos desta feature sobre a árvore já existente (001/002/003/004/008).

- [ ] T001 Criar estrutura de diretórios desta feature: `src/client/domain/validacaoVenda/`, `src/client/services/validacao/`, `src/client/features/validacao/`, `tests/unit/domain/validacaoVenda/` (`src/client/domain/venda/`, `src/client/stores/slices/` e `src/shared/schemas/` já existem, criados pelas features 001/004/008)

**Checkpoint**: Diretórios prontos — depende de `src/client/stores/vendaStore.ts` já existir (Foundational da 001) e de `montarRetratoVenda.ts` já existir (Foundational da 004).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: O mecanismo completo — domínio puro, fronteira Zod, serviço de rede, notificação e o slice inteiro (`validarInsercao`/`invalidarVeredito`/`podeFinalizar`) — porque as três primeiras user stories são leituras de aceitação sobre esta **mesma** action, não fluxos separados. Inclui também a substituição dos dois stubs deixados pelas features 004 e 008.

**⚠️ CRITICAL**: Nenhuma user story pode começar até esta fase terminar.

- [ ] T002 [P] Implementar `src/client/domain/validacaoVenda/interpretarVeredito.ts`: tipos `Veredito` (união discriminada `ACEITA`/`RECUSADA`/`INDISPONIVEL`, `data-model.md` §1), `MensagemValidacao`, `SeveridadeERP`, `CausaIndisponibilidade`; funções `interpretarRespostaValidacao(resposta: ValidarNFCeOutput): Veredito` (ramifica **exclusivamente** em `Valido` — `Type` nunca decide bloqueio, AD-110; `Valido=false` sem mensagens ⇒ `RECUSADA` com mensagem genérica, `FR-008`), `vereditoDeFalha(causa): Veredito`, `autorizaFinalizacao(veredito: Veredito | null): boolean` (`null` ⇒ `false`; só `ACEITA` autoriza, `FR-015`)
- [ ] T003 [P] Implementar `src/client/domain/validacaoVenda/projetarPagamentos.ts`: tipo `FormaCandidata` (carrega `fpgUtiCar` e `entrada` obrigatórios, `contracts/validacao-domain-api.md` §1); função pura `projetarPagamentos(aplicados, candidata): readonly PagamentoParaPayload[]` — lista "como ficaria" (`FR-002`), não muta `aplicados`
- [ ] T004 [P] Implementar `src/shared/schemas/validarNFCe.schema.ts` (Zod): `mensagemValidacaoSchema` (`Id` com default `''`, `Type: number().int()`, `Description: string()`) e `validarNFCeOutputSchema` (`Valido: boolean()` **sem default** — ausência é `RESPOSTA_INVALIDA`, nunca aceite presumido; `messages` default `[]`) — `contracts/erp-validacao-api.md`
- [ ] T005 Implementar `src/client/services/validacao/validarNFCeMutation.ts`: `useValidarNFCe()` como TanStack **mutation** (não query — sem cache, sem refetch, `research.md` D10), `POST /api/erp/ValidarNFCe` via proxy do BFF (002), `retry: 0` e timeout explícito; valida a resposta com `validarNFCeOutputSchema` (T004) antes de interpretar (T002); **nunca rejeita a promise** — toda falha (timeout, rede, HTTP de erro, corpo inválido) vira `vereditoDeFalha(causa)` (T002), para que nenhum call site precise de `try/catch` (I4) — depende de T002, T004
- [ ] T006 Implementar `src/client/features/validacao/notificarVeredito.ts`: `notificarVeredito(veredito: Veredito, toast: GoeyToast): void` — `ACEITA` sem avisos: nenhuma notificação; `ACEITA` com avisos: uma notificação de **aviso** por mensagem, texto íntegro, auto-dismiss (`FR-005`/`FR-007`); `RECUSADA`: uma notificação de **erro** por mensagem, ou a genérica de `FR-008`; `INDISPONIVEL`: notificação de erro com texto próprio do Checkout, **distinta** de recusa de negócio, convidando a nova tentativa (`FR-009`) — depende de T002
- [ ] T007 Implementar `src/client/stores/slices/validacaoVendaSlice.ts`: estado `{ vereditoVigente: Veredito | null, emValidacao: boolean }`; `validarInsercao(candidata: FormaCandidata, origem: 'MANUAL' | 'ATALHO_CENARIO'): Promise<Veredito>` — guarda de entrada `emValidacao === false` (senão devolve imediatamente o veredito de "ocupado" sem consultar, `FR-011`/I8); projeta a candidata (T003) sobre os pagamentos aplicados (dependência injetada `pagamentosAplicados()`, feature 008); monta o retrato via `montarRetratoVenda(snapshot, 'VALIDAR', pagamentosProjetados)` (dependência injetada `snapshotVenda()` + módulo reutilizado de 004, **não reimplementado**); chama `validar()` (T005); interpreta (T002); `ACEITA` ⇒ grava `vereditoVigente`, chama `notificarVeredito` (T006); `RECUSADA`/`INDISPONIVEL` ⇒ **não** toca `vereditoVigente`, chama `notificarVeredito` (T006) e `registrarEventoAuditoria` (dependência injetada, factory `VALIDACAO_VENDA_RECUSADA` já existente em 001 T018, com `origem`/condição/forma/motivo); `invalidarVeredito(): void` ⇒ `vereditoVigente = null`; seletor `podeFinalizar(): boolean` ⇒ `autorizaFinalizacao(vereditoVigente)` (T002) — parâmetro `origem` é uma extensão pragmática sobre a assinatura de `contracts/validacao-domain-api.md` §3 (que não o lista explicitamente), necessária porque só o chamador (008 ou 013) sabe se o gesto veio do botão da tela ou do atalho de cenário, e o evento de auditoria de `data-model.md` exige esse campo — revisar em `/speckit-analyze` — depende de T002, T003, T005, T006
- [ ] T008 Combinar `validacaoVendaSlice.ts` (T007) em `src/client/stores/vendaStore.ts` (já existe, feature 001) — depende de T007
- [ ] T009 Substituir os dois stubs injetados deixados pelas features 004 e 008 pela implementação real do slice (T008), na composição de `vendaStore.ts`: `validarInsercao`/`invalidarVeredito` (stub sempre-aceita de `specs/008-pagamento-geral/tasks.md` T041) e `podeFinalizar()` (stub sempre-`true` de `specs/004-finalizacao-suspensao-venda/tasks.md` T029) passam a apontar para as actions reais de `validacaoVendaSlice` — depende de T008
- [ ] T010 [P] Unit test `tests/unit/domain/validacaoVenda/interpretarVeredito.spec.ts`: **teste negativo obrigatório** (AD-110) — `Valido=false` + `Type=Warning` ⇒ `RECUSADA` (não `ACEITA`); `Valido=true` + `Type=Warning` ⇒ `ACEITA` com avisos; `Valido=false` sem `messages` ⇒ `RECUSADA` com mensagem genérica (`FR-008`); `autorizaFinalizacao(null)===false`, `autorizaFinalizacao({resultado:'RECUSADA',...})===false` — I3, `FR-006` — depende de T002
- [ ] T011 [P] Unit test `tests/unit/domain/validacaoVenda/projetarPagamentos.spec.ts`: candidata presente na lista projetada; lista `aplicados` original não é mutada (referência distinta); ordem preservada — I2 — depende de T003
- [ ] T012 Integration test `tests/integration/validacaoVendaSlice.spec.ts`: `RECUSADA` não muta `vereditoVigente` nem estado externo (I1); `INDISPONIVEL` (mutation mockada rejeitando/timeout) não muta e não relança (I4); dois `validarInsercao` disparados sem aguardar o primeiro ⇒ o segundo devolve imediatamente sem nova requisição (I8/`FR-011`); `retrato` enviado contém as formas aplicadas **mais** a candidata (I2, espiando o argumento de `montarRetratoVenda`); `invalidarVeredito()` zera `vereditoVigente` (I7) — depende de T008

**Checkpoint**: Mecanismo completo e testado isoladamente — as três primeiras user stories são leituras de aceitação sobre este núcleo; nenhuma delas precisa de implementação nova.

---

## Phase 3: User Story 1 - Ser impedido de lançar um pagamento que o ERP recusa (Priority: P1)

**Goal**: Uma venda que o ERP recusa não recebe o pagamento, e o operador vê o motivo na hora.

**Independent Test**: Cliente com crédito bloqueado no ERP e condição a prazo — confirmar a inserção não aplica o pagamento e mostra o motivo.

### Tests for User Story 1

- [ ] T013 [P] [US1] Integration test mesmo arquivo `tests/integration/validacaoVendaSlice.spec.ts`: cliente com crédito bloqueado + condição a prazo ⇒ `RECUSADA`, nenhum pagamento (venda intacta), notificação de erro com o texto do ERP íntegro, evento `VALIDACAO_VENDA_RECUSADA` na auditoria, `podeFinalizar()===false` (I6) — cliente default + condição a prazo produz o mesmo desfecho — Acceptance Scenarios 1, 3, 4; `FR-001`, `FR-004`, `FR-007`, `FR-015`, `FR-018` — depende de T012
- [ ] T014 [P] [US1] Integration test mesmo arquivo: após uma recusa, corrigir a causa (ex.: veredito mockado passa a `ACEITA` na segunda chamada) e repetir a inserção ⇒ nova consulta é feita (não reaproveita a anterior) e a inserção passa a ser aceita — Acceptance Scenario 2 — depende de T012

**Checkpoint**: User Story 1 coberta — nenhuma implementação nova, só validação do mecanismo do Foundational contra os cenários de recusa.

---

## Phase 4: User Story 2 - Ser avisado sem ser bloqueado (Priority: P1)

**Goal**: Avisos do ERP aparecem ao operador sem interromper o fluxo quando a venda é aceita.

**Independent Test**: Empresa configurada para apenas avisar sobre limite de crédito — a inserção acontece normalmente e o aviso aparece.

### Tests for User Story 2

- [ ] T015 [P] [US2] Integration test mesmo arquivo: `EmpLimCre='A'` com crediário acima do limite ⇒ `Valido=true` + aviso, pagamento **aplicado** normalmente, notificação de aviso sem exigir confirmação, **nenhum** evento de auditoria (`research.md` D9); resposta aceita sem mensagens não gera notificação; várias mensagens são todas exibidas, na ordem recebida — quickstart Cenário 2, Acceptance Scenarios 1, 2, 3; `FR-005`, `FR-007` — depende de T012
- [ ] T016 [P] [US2] Integration test mesmo arquivo (**teste negativo de severidade a nível de slice**, complementa T010): `EmpLimCre='B'` com a mesma forma do T015, mas `Valido=false` e mensagem `Type=Warning` ⇒ tratado como `RECUSADA` (nenhum pagamento aplicado, notificação de erro) — quickstart Cenário 3, Acceptance Scenario 4; `FR-006`, I3 — depende de T012

**Checkpoint**: User Story 2 coberta — confirma que o slice distingue aviso de bloqueio no nível de integração, não só na função pura (T010).

---

## Phase 5: User Story 3 - Ter a mesma proteção por qualquer caminho de inserção (Priority: P1)

**Goal**: O gate vale igualmente pelo botão da tela de pagamento (008) e pelo atalho de venda rápida (013) — nenhum atalho o contorna.

**Independent Test**: Provocar a mesma recusa pelos dois caminhos e confirmar comportamento idêntico.

### Tests for User Story 3

- [ ] T017 [P] [US3] Integration test `tests/integration/validacaoVendaSlice.spec.ts`: espionar `validarInsercao` do `vendaStore` combinado (T008) e confirmar que tanto `aplicarPagamento` (008, botão) quanto `acionarCenario`/`aplicarForma` (013, tecla F6–F9) invocam a **mesma** instância — nenhum caminho implementa validação própria ou contorna o gate — Acceptance Scenario 2 de US3; `FR-001`, `SC-001` — depende de T009
- [ ] T018 [P] [US3] Integration test mesmo arquivo: `RECUSADA` não aciona `iniciarIntegracao` (PIX/TEF) em nenhum caso — nem antes nem depois da consulta; `ACEITA` aciona a integração normalmente, só após o veredito favorável — quickstart Cenário 6, I9; `FR-010`, `SC-002` — depende de T012
- [ ] T019 [P] [US3] E2E `tests/e2e/validacao-previa.spec.ts` (quickstart Cenários 5 e 6): acionar o atalho F6 numa venda que o ERP recusa ⇒ nenhum pagamento lançado, **nenhuma** finalização automática iniciada (mesmo com "encerra a operação" ligado), notificação idêntica à do caminho manual; F6 pressionado duas vezes em sequência rápida ⇒ uma única consulta (`FR-011`); forma PIX/TEF numa venda recusada ⇒ nenhuma cobrança/transação iniciada — depende de T009

**Checkpoint**: User Story 3 coberta — o mesmo mecanismo do Foundational já satisfaz os dois caminhos de acionamento sem código adicional, exatamente como `research.md` D1/D8 previu.

---

## Phase 6: User Story 4 - Finalizar apoiado no veredito já obtido (Priority: P2)

**Goal**: A finalização usa o veredito da última inserção aceita, sem repetir a consulta.

**Independent Test**: Finalizar logo após um lançamento aceito (sem nova consulta); remover o pagamento, alterar a venda e reinserir (nova consulta obrigatória).

### Tests for User Story 4

- [ ] T020 [P] [US4] Integration test mesmo arquivo: venda com último lançamento `ACEITA` e total coberto ⇒ `podeFinalizar()===true`, e a mutation de validação (T005, mockada/espiada) **não** é chamada de novo na finalização — Acceptance Scenario 1; `FR-013` — depende de T009
- [ ] T021 [P] [US4] Integration test mesmo arquivo: remover um pagamento aplicado (008, `removerPagamento`) chama `invalidarVeredito()` (T007) ⇒ `vereditoVigente` volta a `null`; a próxima inserção, mesmo com candidata idêntica, gera **nova** consulta — quickstart Cenário 7; Acceptance Scenario 2; `FR-014` — depende de T009
- [ ] T022 [P] [US4] Integration test mesmo arquivo: sem nenhum veredito favorável vigente (`vereditoVigente === null` ou `RECUSADA`/`INDISPONIVEL`), a finalização (004, `podeFinalizar()`) bloqueia a emissão mesmo com o total coberto — Acceptance Scenario 3; `FR-015`, `SC-005` — depende de T009
- [ ] T023 [P] [US4] Integration test mesmo arquivo: pagamento dividido — inserir a primeira forma (ex.: dinheiro, crediário `0`, aceita) e depois a segunda (crediário, retrato muda) ⇒ **duas** consultas distintas, nunca reaproveitadas, agrupadas ou cacheadas; desfecho da segunda pode divergir do da primeira; remover e reinserir a segunda gera uma **terceira** consulta — quickstart Cenário 8; `FR-001a`, I2a — depende de T012

**Checkpoint**: Todas as quatro user stories cobertas (`FR-001` a `FR-020`) — mecanismo único, validado em cinco frentes de teste.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Cobertura da recusa local (fora do escopo das stories acima), gates finais e validação ponta a ponta.

- [ ] T024 [P] Integration test mesmo arquivo `tests/integration/validacaoVendaSlice.spec.ts`: quando a recusa é local (008, `podeAplicarForma` — venda sem itens, saldo zerado, segunda forma dinheiro, desconto acima do subtotal), `validarInsercao` (T007) **não** é chamada — nenhuma requisição de validação — quickstart Cenário 9; `FR-012` — depende de T009
- [ ] T025 Rodar `npx tsc --noEmit` e confirmar zero erros de tipo — gate obrigatório da Constitution (`Development Workflow`)
- [ ] T026 Rodar os 9 cenários de `quickstart.md` e o Fluxo Dourado (E2E) e confirmar `SC-001` a `SC-007`, em especial o tempo de desfecho `< 2s` (`SC-006`) e a ausência de segunda consulta numa venda à vista simples
- [ ] T027 Revisar manualmente a trilha de auditoria contra `contracts/validacao-domain-api.md` §3 e `data-model.md` §1 (tipo 18 de `specs/001-auditoria-acoes-operador/data-model.md`): `VALIDACAO_VENDA_RECUSADA` disparado em toda `RECUSADA` e `INDISPONIVEL`, e **nunca** em `ACEITA` com aviso (`research.md` D9)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Depende de 001 (Foundational, `vendaStore.ts`) e 004 (Foundational, `montarRetratoVenda.ts`) — fora desta feature
- **Foundational (Phase 2)**: Depende do Setup — BLOQUEIA as 4 user stories; é onde o mecanismo inteiro é implementado
- **User Stories (Phase 3-6)**: Todas dependem do Foundational; US1/US2 dependem só de T012, US3/US4 dependem também de T009 (substituição dos stubs de 008/004)
- **Polish (Phase 7)**: Depende de T009 e das 4 user stories completas

### User Story Dependencies

- **US1 (P1)**: Depende de Foundational (T012) — sem dependência de outra story
- **US2 (P1)**: Depende de Foundational (T012) — sem dependência de outra story
- **US3 (P1)**: Depende de Foundational (T009, T012) — sem dependência de outra story
- **US4 (P2)**: Depende de Foundational (T009, T012) — sem dependência de outra story

### Within Each User Story

- Tests são a única entrega de cada story (implementação já concluída no Foundational)
- Story completa antes do checkpoint

### Parallel Opportunities

- T002, T003, T004 (Foundational, domínio/schema) em paralelo entre si
- T010, T011 (unit tests Foundational) em paralelo entre si
- T013, T014 (testes US1) em paralelo entre si
- T015, T016 (testes US2) em paralelo entre si
- T017, T018 (testes US3) em paralelo entre si; T019 (E2E) depois de T009
- T020–T023 (testes US4) em paralelo entre si
- US1, US2, US3 e US4 podem ser validadas em paralelo por pessoas diferentes após o Foundational — todas só leem o mesmo mecanismo, sem se tocar

---

## Parallel Example: Foundational

```bash
# Domínio puro e schema, sem dependência entre si (arquivos diferentes):
Task: "Implementar interpretarVeredito.ts em src/client/domain/validacaoVenda/interpretarVeredito.ts"
Task: "Implementar projetarPagamentos.ts em src/client/domain/validacaoVenda/projetarPagamentos.ts"
Task: "Implementar validarNFCe.schema.ts em src/shared/schemas/validarNFCe.schema.ts"
```

## Parallel Example: User Story 1 (testes)

```bash
Task: "Integration test recusa por crédito bloqueado/cliente default em tests/integration/validacaoVendaSlice.spec.ts"
Task: "Integration test retry após correção gera nova consulta em tests/integration/validacaoVendaSlice.spec.ts"
```

---

## Implementation Strategy

### MVP First (Foundational + User Story 1)

1. Completar Phase 1: Setup
2. Completar Phase 2: Foundational — mecanismo inteiro pronto, stubs de 008/004 substituídos (T009)
3. Completar Phase 3: User Story 1 — **PARAR e VALIDAR**: uma venda recusada não lança pagamento
4. Nesse ponto o gate já protege toda inserção; US2/US3/US4 são cobertura adicional do mesmo mecanismo

### Incremental Delivery

1. Setup + Foundational → mecanismo completo, stubs substituídos → maior valor entregue de uma vez (é a natureza de um gate transversal)
2. US1 → validar isoladamente (recusa bloqueia)
3. US2 → validar isoladamente (aviso não bloqueia)
4. US3 → validar isoladamente (mesmo gate por qualquer caminho)
5. US4 → validar isoladamente (finalização sem revalidação)
6. Polish → recusa local, gates finais, quickstart completo

### Parallel Team Strategy

Como o mecanismo inteiro nasce no Foundational, o ganho de paralelismo desta feature está nos **testes** das quatro stories, não na implementação: um desenvolvedor completa Setup + Foundational sozinho (é um bloco coeso: domínio → serviço → slice → wiring), depois até quatro pessoas validam US1/US2/US3/US4 em paralelo, todas lendo o mesmo `validacaoVendaSlice.ts` sem o alterar.

---

## Notes

- [P] = arquivos diferentes (ou blocos de teste independentes no mesmo arquivo, mesmo padrão já usado pelos `tasks.md` das features 008/013), sem dependências
- [Story] mapeia cada tarefa à user story correspondente para rastreabilidade
- Commit após cada tarefa ou grupo lógico
- Parar em cada checkpoint para validar a story isoladamente
- `montarRetratoVenda.ts` **não é reimplementado aqui** — é o módulo de `specs/004-finalizacao-suspensao-venda/tasks.md` T004, já parametrizado para `'VALIDAR'` e já testado (I5) por T009 da 004
- A factory de auditoria `VALIDACAO_VENDA_RECUSADA` **não é reimplementada aqui** — já existe em `specs/001-auditoria-acoes-operador/tasks.md` T018
- O congelamento amplo de I10 (carrinho, cliente, vendedor, desconto de capa) **não exige tarefa nova** — `podeMutarCarrinho()` (008, T010/T036) já é o único predicado consumido por 003/005/012; nenhuma dessas features precisa de emenda adicional
- FR-016/FR-017 (congelamento e suspensão fora do gate) são cobertos pelas invariantes já testadas em 008 (I7/I12) e 004 (T023, `SUSPENDER` sem `podeFinalizar()`) — sem tarefa nova aqui
- O parâmetro `origem` de `validarInsercao` (T007) é uma extensão sobre `contracts/validacao-domain-api.md` §3 encontrada durante esta decomposição — revisar em `/speckit-analyze`

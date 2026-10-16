---

description: "Task list — 018 rastreabilidade de pagamentos cancelados e troco enviado ao ERP"
---

# Tasks: Rastreabilidade de pagamentos cancelados e troco enviado ao ERP

**Input**: Design documents from `specs/018-rastreabilidade-pagamento-troco/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Incluídos. A Constitution V exige teste para toda regra monetária (troco), e as features 008–017 seguem TDD nas funções puras de domínio. Teste antes da implementação nas tarefas marcadas.

**Organization**: Tarefas agrupadas por user story; cada story é entregável e testável sozinha.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência pendente)
- **[Story]**: US1, US2, US3 da spec
- Caminhos relativos à raiz do repo (SPA única: `src/client/`, `tests/`)

---

## Phase 1: Setup

**Purpose**: Nenhuma infraestrutura nova: a feature altera código existente. Só a branch e a linha de base.

- [X] T001 Confirmar a branch `feat/rastreabilidade-pagamento-troco` e rodar a linha de base (`npx tsc --noEmit` e `npx vitest run`), registrando falhas pré-existentes para não confundi-las com regressão desta feature

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: O tipo do evento ampliado é usado pelas três stories (US1 diretamente, US2 pelo `motivo: 'LIMPAR'`). Precisa existir antes.

- [X] T002 Ampliar `EventoFormaPagamentoRemovida` em `src/client/domain/auditoria/eventos.ts:148` para `{ formaPagamento: string; valor: number /* centavos */; motivo: 'OPERADOR' | 'ESTORNO_TEF' | 'LIMPAR'; tefPagId?: string; pixGuid?: string }`, exportando o tipo `MotivoRemocaoPagamento`, com TSDoc no padrão dos vizinhos (data-model §5, research D4)
- [X] T003 Atualizar `tests/unit/domain/auditoria/eventos.spec.ts:192,220` para o formato novo (factory devolve os detalhes completos, campos opcionais omitidos quando ausentes)
- [X] T004 [P] Escrever primeiro (RED) `tests/unit/domain/pagamento/remocaoPagamento.spec.ts`: dinheiro → `valor` = recebido; cartão sem TEF → `valor` = aplicado, sem `tefPagId`; TEF com `dadosTEF` → `tefPagId = dadosTEF.pagId`; PIX aprovado com `pixGuid` → `pixGuid`; PIX pendente (sem `pixGuid`) → sem o campo; nenhum campo de identificador vazio (FR-010 a FR-014)
- [X] T005 Implementar `detalhesDaRemocao(pagamento, rotulo, motivo)` em `src/client/domain/pagamento/remocaoPagamento.ts` (função pura, sem store; `valorRecebido ?? valorAplicado`; spread condicional para os identificadores, como `formaParaRetrato`) até T004 passar

**Checkpoint**: o tipo compila em todo o projeto (`npx tsc --noEmit` vai apontar as três chamadas do slice, corrigidas em US1/US2).

---

## Phase 3: User Story 1 — ERP recebe a identificação de toda forma removida ou estornada (Priority: P1) 🎯 MVP

**Goal**: Todo `FORMA_PAGAMENTO_REMOVIDA` leva valor, motivo e, quando há, `tefPagId`/`pixGuid`, até o `Log` do retrato.

**Independent Test**: Estornar um TEF aprovado, finalizar com outra forma e conferir no `Log` enviado ao `FaturarNFCe` o evento com `valor`, `motivo: "ESTORNO_TEF"` e `tefPagId` (quickstart #1–#4).

### Tests for User Story 1

- [X] T006 [US1] Em `tests/integration/pagamentoSlice.spec.ts`, acrescentar asserts de `detalhes` (hoje só se conta o evento, `:566`, `:598`, `:1696-1732`): `removerPagamento` de dinheiro → `motivo: 'OPERADOR'`, `valor` = recebido; `confirmarEstornoTef` → `motivo: 'ESTORNO_TEF'` com `tefPagId` do `dadosTEF`; remoção de PIX aprovado → `pixGuid` (RED)
- [X] T007 [P] [US1] Em `tests/e2e/pagamento-tef.spec.ts`, no cenário de estorno (`SOL_EST → PROC_EST → EST`), finalizar a venda e asserir no corpo de `FaturarNFCe` capturado pelo mock que o `Log` contém `FORMA_PAGAMENTO_REMOVIDA` com `motivo: "ESTORNO_TEF"` e `tefPagId` igual ao `TEFPagId` da aprovação

### Implementation for User Story 1

- [X] T008 [US1] Em `src/client/stores/slices/pagamentoSlice.ts`, `removerPagamento` (`:1056`) e `confirmarEstornoTef` (`:1084`) passam a registrar `eventoFormaPagamentoRemovida(detalhesDaRemocao(alvo, rotuloDoPagamento(alvo), 'OPERADOR' | 'ESTORNO_TEF'))`; atualizar os comentários que descrevem o evento
- [X] T009 [US1] Em `descartarPagamento` (`pagamentoSlice.ts:1316-1328`), trocar a lista de rótulos por detalhes completos resolvidos **antes** do `set` (`detalhesDaRemocao(p, rotuloDoPagamento(p), 'LIMPAR')` para cada vivo), sem ainda mudar o esvaziamento (isso é US2), para o projeto compilar e T006 passar

**Checkpoint**: US1 entregável sozinha: `npx tsc --noEmit`, `npx vitest run tests/integration/pagamentoSlice.spec.ts tests/unit/domain` e o e2e de TEF verdes.

---

## Phase 4: User Story 2 — "Limpar" mantém o histórico das formas na tela (Priority: P2)

**Goal**: "Limpar" zera condição, capa e vales, marca os vivos como `EXCLUIDO` e mantém os já riscados; o botão só olha pagamentos vivos.

**Independent Test**: Aplicar uma forma, remover, aplicar outra, "Limpar": as duas riscadas, condição/capa vazias, carrinho editável, um evento `LIMPAR` novo (quickstart #5–#9).

### Tests for User Story 2

- [X] T010 [US2] Reescrever as expectativas de `descartarPagamento` em `tests/integration/pagamentoSlice.spec.ts` (`:337`, `:459-470`, `:581`, `:595`, e revisar `:419`, `:436`, `:612`): depois de "Limpar", `pagamentos` mantém o tamanho, todos `EXCLUIDO`; um evento `LIMPAR` por forma que era viva e nenhum para a já riscada; `podeMutarCarrinho() === true`; segunda chamada sem condição/capa/vivos é no-op sem evento; TEF aprovado continua recusando; um PIX `PENDENTE_INTEGRACAO` riscado pelo "Limpar" não volta a valer quando `confirmarPagamentoIntegrado` chega depois (edge case "aprovação depois do Limpar") (RED)
- [X] T011 [P] [US2] Atualizar `tests/integration/limparPagamentoDoDocumento.spec.tsx:130,146`: em vez de lista vazia, a forma do documento fica `EXCLUIDO`; e acrescentar caso de PIX já riscado + condição: "Limpar" não abre a confirmação de PIX. Travar também, onde a suspensão já é testada (`tests/integration/finalizacaoSuspensao.spec.ts`), que um PIX riscado continua pedindo a confirmação de "cobrança segue no banco" ao suspender (edge case da spec)
- [X] T012 [P] [US2] Atualizar `tests/e2e/pagamento-geral.spec.ts:339-340` e `tests/e2e/recuperacao-nfce.spec.ts:319-321`: depois de "Limpar", as linhas continuam visíveis com `data-status="EXCLUIDO"` e rótulo legível do meio (FR-007); acrescentar no `pagamento-geral` o caso "só formas riscadas, sem condição/capa → Limpar bloqueado" (FR-006) e "nova condição + nova forma depois do Limpar entra normalmente" (FR-008)
- [X] T013 [P] [US2] Revisar os testes que usam "Limpar" só como preparação e podem depender da lista vazia: `tests/integration/ModalRecuperacaoNFCe.spec.tsx:228`, `tests/integration/mobileWizard.spec.tsx:493`, `tests/integration/recuperacaoNFCe.spec.ts:707`; ajustar só se quebrarem pela mudança de regra

### Implementation for User Story 2

- [X] T014 [US2] Em `pagamentoSlice.ts`, `descartarPagamento` (`:1284`): early return quando `pagamentosVivos().length === 0 && condicaoSelecionada === null && descontoCapa === null`; `pagamentos` vira `pagamentos.map(p => pagamentoVivo(p) ? { ...p, status: 'EXCLUIDO' } : p)` no mesmo `set` que zera condição, capa e vales; eventos e `invalidarVeredito()` como antes. Reescrever o TSDoc da action e o comentário de I9 em `selecionarCondicao` (`:893`), que diz que "Limpar" "zera … formas" (research D3)
- [X] T015 [US2] Em `src/client/features/pagamento/ConfiguracaoPagamento.tsx` (`BotaoLimparPagamento`, `:75-83`): `temPix` e `vazio` passam a usar `pagamentoVivo` (importado de `domain/pagamento/saldoPagamento`); atualizar o TSDoc do componente (`:31-64`) para dizer que as formas ficam riscadas
- [X] T016 [US2] Conferir em `tests/integration/pagamentoSlice.spec.ts:1304-1315` e `tests/e2e/venda-rapida.spec.ts:153` que `limparPagamentos` (pós-finalização) continua esvaziando tudo (FR-009); nenhuma mudança de código esperada em `limparPagamentos`

**Checkpoint**: US1 + US2 verdes; o PR pode seguir sem a US3.

---

## Phase 5: User Story 3 — NFCe sai com o troco calculado pelo ERP (Priority: P3)

**Goal**: Dinheiro vai ao ERP com o valor recebido, igual na validação prévia e no faturamento; documento retomado com dinheiro acima do total reconstrói o troco.

**Independent Test**: Venda R$ 87,00 com dinheiro R$ 100,00: `ValidarNFCe` e `FaturarNFCe` recebem `FormaValor: 100`, tela mostra troco R$ 13,00 (quickstart #10–#12).

### Tests for User Story 3

- [ ] T017 [P] [US3] `tests/unit/domain/pagamento/formaParaRetrato.spec.ts`: dinheiro com `valorRecebido` 10000 e `valorAplicado` 8700 → `FormaValor: 100`; cartão → `FormaValor` = aplicado (RED)
- [ ] T018 [P] [US3] `tests/unit/domain/validacaoVenda/projetarPagamentos.spec.ts:16-24`: `FormaCandidata` com `valorRecebido`; candidata dinheiro projetada com `FormaValor` = recebido (RED)
- [ ] T019 [P] [US3] Escrever primeiro `tests/unit/domain/pagamento/trocoImportado.spec.ts`: sem excedente → intacto; excedente com exatamente 1 dinheiro que o cobre → `valorRecebido` = original, `valorAplicado` = original − excedente; excedente igual ao dinheiro inteiro → `valorAplicado` 0; sem dinheiro, 2 dinheiros ou excedente > dinheiro → intacto (FR-020 revisado); I3 preservada (data-model §4)
- [ ] T020 [US3] `tests/integration/pagamentoSlice.spec.ts:899-944`: `FormaValor` do dinheiro passa de 30 para 50; atualizar o formato exato da candidata em `:1213-1227`; acrescentar caso de `importarFormasDePagamento` com dinheiro acima do subtotal → troco reconstruído
- [ ] T021 [P] [US3] `tests/integration/validacaoVendaSlice.spec.ts:263-285` (formato da candidata) e garantir que `:377-379` (retrato validado == emitido) cobre um dinheiro com troco (FR-018)
- [ ] T022 [P] [US3] `tests/e2e/pagamento-geral.spec.ts:163-192`: Σ `FormaValor` passa de ≈98 para 100; asserir o mesmo `FormaValor` de dinheiro no corpo de `ValidarNFCe` e de `FaturarNFCe`

### Implementation for User Story 3

- [ ] T023 [US3] `src/client/domain/validacaoVenda/projetarPagamentos.ts`: `FormaCandidata.valorRecebido: Centavos | null` com TSDoc (I3, I5); `candidataComoPagamento` copia o campo em vez de `null`
- [ ] T024 [US3] `src/client/stores/slices/pagamentoSlice.ts` `aplicarNucleo` (`:753-761`): a candidata recebe `valorRecebido` de `derivarValores`
- [ ] T025 [US3] `src/client/domain/pagamento/formaParaRetrato.ts:31-34`: `FormaValor: reaisDeCentavos(pagamento.valorRecebido ?? pagamento.valorAplicado)`; reescrever o comentário que afirma que o troco "nunca aparece aqui"
- [ ] T026 [US3] Implementar `reconstruirTrocoImportado(pagamentos, totalLiquido)` em `src/client/domain/pagamento/trocoImportado.ts` com `somar`/`subtrair` de `domain/precificacao/dinheiro` (Constitution V) até T019 passar
- [ ] T027 [US3] `pagamentoSlice.ts` `importarFormasDePagamento` (`:1403`): `aplicarPagamentos(reconstruirTrocoImportado(importados, deps.subtotalCarrinho()))`; atualizar o comentário de I3 em `:1373`
- [ ] T028 [US3] Reescrever os comentários que afirmam `Σ FormaValor == total`: `src/client/domain/pagamento/saldoPagamento.ts:212,282` e `src/client/domain/pagamento/descontoCapa.ts:78` (só onde a afirmação fala do payload; a regra de saldo não muda)
- [ ] T029 [US3] **Gate de merge (bloqueante, manual)**: homologar com o ERP real a venda do quickstart #13 (R$ 87,00, dinheiro R$ 100,00) e confirmar NFCe autorizada com troco R$ 13,00. Se possível, ler `PCheckout_FaturarNFCe` na KB GenExus para confirmar o cálculo do troco e se `FormaValor` é gravado com troco (research D1/D6). Registrar o resultado em `research.md` D1. Se o ERP recusar, reverter T023–T028 do PR e abrir pendência em `.specs/project/PENDENCIES.md`

**Checkpoint**: as três stories verdes; US3 só sobe para `master` depois de T029.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T030 [P] Corrigir decisões superadas **no ponto da decisão** (regra de `docs/agents/domain.md`): D3 de `specs/008-pagamento-geral/research.md` (troco passa a ir no payload) e D8 de `specs/011-recuperacao-nfce/research.md` (troco reconstruído); linha 12 de `specs/001-auditoria-acoes-operador/data-model.md`; linha de `removerPagamento` em `specs/008-pagamento-geral/contracts/pagamento-domain-api.md:205`
- [ ] T031 [P] Registrar AD-282 ("Limpar" preserva o histórico), AD-283 (evento de remoção com valor, motivo e `tefPagId`) e AD-284 (troco ao ERP pelo `FormaValor` do dinheiro) em `.specs/project/STATE.md`, no formato das ADs vizinhas
- [ ] T032 Gates: `npx tsc --noEmit`, `npx vitest run`, `npx playwright test` (desktop e mobile) verdes; skill `typescript-strict` antes do push; `/owasp-security` antes do merge do PR para `master` (Constitution, Development Workflow)
- [ ] T033 Commit e push na branch `feat/rastreabilidade-pagamento-troco` (`rules.md`, "Fim de tarefa"); mensagens `feat:`/`docs:` citando AD-282/283/284

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (T001)** → **Foundational (T002–T005)** → stories.
- **US1 (T006–T009)**: depende só do Foundational.
- **US2 (T010–T016)**: depende do Foundational; T014 reescreve a mesma action que T009 toca, então rode depois de T009.
- **US3 (T017–T029)**: independente de US1/US2 no código (arquivos diferentes, exceto `pagamentoSlice.ts`, em trechos distintos); T029 bloqueia só o merge da US3.
- **Polish (T030–T033)**: depois das stories que forem entrar no PR.

### Within Each User Story

- Testes (RED) antes da implementação.
- Função pura antes do slice; slice antes da UI.

### Parallel Opportunities

- Foundational: T004 em paralelo com T002/T003.
- US1: T007 (e2e) em paralelo com T006.
- US2: T011, T012, T013 em paralelo entre si.
- US3: T017, T018, T019, T021, T022 em paralelo; T023/T025/T026 em arquivos diferentes.
- Polish: T030 e T031 em paralelo.

## Parallel Example: User Story 3

```text
# Testes RED juntos:
T017 tests/unit/domain/pagamento/formaParaRetrato.spec.ts
T018 tests/unit/domain/validacaoVenda/projetarPagamentos.spec.ts
T019 tests/unit/domain/pagamento/trocoImportado.spec.ts

# Implementação de domínio juntos (arquivos diferentes):
T023 src/client/domain/validacaoVenda/projetarPagamentos.ts
T025 src/client/domain/pagamento/formaParaRetrato.ts
T026 src/client/domain/pagamento/trocoImportado.ts
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. T001 → T002–T005 → T006–T009.
2. **Validar**: estorno TEF chega ao ERP com `tefPagId` (a exigência explícita do usuário).

### Incremental Delivery

1. US1 → commit/push.
2. US2 → commit/push (PR pode abrir aqui com US1+US2).
3. US3 → commit/push em commits separados, para poder sair do PR se T029 falhar.
4. Polish (docs + ADs + gates).

---

## Notes

- `[P]` = arquivos diferentes, sem dependência pendente.
- Toda edição de arquivo com `Edit`/`Write`, nunca por script (`CLAUDE.md`).
- Valores do evento em centavos inteiros; `reaisDeCentavos` só na fronteira de saída (`formaParaRetrato`).

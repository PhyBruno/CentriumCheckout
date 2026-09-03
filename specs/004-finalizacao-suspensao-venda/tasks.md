---

description: "Task list template for feature implementation"
---

# Tasks: Finalização e Suspensão da Venda

**Input**: Design documents from `specs/004-finalizacao-suspensao-venda/` (`plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/faturamento-api.md`, `contracts/impressao-local-api.md`, `contracts/status-sistema-api.md`, `quickstart.md`)

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: Incluídos — `plan.md` § Testing e `quickstart.md` definem 3 camadas explícitas (domínio puro, integração/máquina de estados, E2E) com arquivos-alvo nomeados.

**Organization**: Tarefas agrupadas pelas 2 user stories da spec (ambas P1) — US1 (finalizar a venda) e US2 (suspender a venda em digitação).

**⚠️ Ordem de implementação e dependências cruzadas**: esta feature depende de **002** (scaffolding + proxy autenticado `/api/erp/*`), **001** (`vendaStore.ts`, slice `auditoria`, `resetarAuditoria` — mesmo call site que passa a tocar `identidadeVenda`) e **003** (slice `carrinho`, chave de cache `['produto']` reaproveitada no `FR-012`). Três dependências chegam por **injeção**, não por import, e podem ser implementadas com stubs nesta feature: `temPagamentoNaoRemovivel()` (008, bloqueia `SUSPENDER`), `vendedorCodigo` selecionado (012, campo do payload) e `podeFinalizar()` (014, gate de `FATURAR` — `FR-014`/AD-113, ver `contracts/faturamento-api.md`). O módulo `src/client/domain/venda/montarRetratoVenda.ts` implementado **nesta feature** é compartilhado com a 014 (`specs/014-validacao-previa-nfce/contracts/validacao-domain-api.md`, "004 → 014: `montarRetratoVenda` generalizado") — parametrizado desde já para `'FATURAR' | 'SUSPENDER' | 'VALIDAR'`, ainda que só `FATURAR`/`SUSPENDER` sejam exercitados pelos call sites desta feature.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência de tarefas incompletas)
- **[Story]**: A qual user story a tarefa pertence (US1, US2)
- Caminhos de arquivo exatos em cada descrição

## Path Conventions

Extensão da árvore já proposta pela feature 002 (ver `plan.md` § Structure Decision — quarta feature a estendê-la):

```text
src/client/domain/venda/                    # montarRetratoVenda.ts — compartilhado com a feature 014
src/client/domain/finalizacaoVenda/         # decidirMecanismoImpressao.ts — camada pura
src/client/stores/slices/                   # identidadeVendaSlice.ts, combinado em vendaStore.ts (feature 001)
src/client/services/faturamento/            # faturarNFCeMutation.ts, faturarNFCeMapper.ts
src/client/services/impressao/              # imprimirNFCeLocal.ts
src/client/services/statusSistema/          # pollingStatusSistema.ts
src/client/features/finalizacao-suspensao/  # hook orquestrador + UI
src/shared/schemas/                         # faturarNFCe.schema.ts
tests/unit/domain/venda/ | tests/unit/domain/finalizacaoVenda/ | tests/integration/ | tests/e2e/
```

**⚠️ Consulta ao Pencil MCP obrigatória para tarefas de UI (CLAUDE.md § "Referência visual (design)")**: toda tarefa desta lista que cria ou altera saída visual (tela, componente, modal, layout, ícone, estado de loading/vazio) está marcada abaixo com "consultar o Pencil MCP antes de implementar" — a fonte de verdade do visual é sempre o Pencil MCP (`get_editor_state(include_schema:true)` → `batch_get`/`get_screenshot`/`get_variables`/`snapshot_layout` sobre o nó real da tela em `design/CentriumCheckout.pen`), nunca o código existente nem senso genérico de design. Tarefas afetadas: T018, T019, T020, T025.

---

## Phase 1: Setup

**Purpose**: Criar os diretórios específicos desta feature sobre a árvore já existente (002/001/003).

- [X] T001 Criar estrutura de diretórios desta feature: `src/client/domain/venda/`, `src/client/domain/finalizacaoVenda/`, `src/client/services/faturamento/`, `src/client/services/impressao/`, `src/client/services/statusSistema/`, `src/client/features/finalizacao-suspensao/` (`src/client/stores/slices/` já existe, criado pela feature 001)

**Checkpoint**: Diretórios prontos — depende de `src/client/` já existir (Fase 1 da 002) e `src/client/stores/vendaStore.ts` já existir (Foundational da 001).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Identidade da venda, montagem do retrato/payload, validação de fronteira, mutation sem retry e a máquina de estados do hook orquestrador (com a limpeza de sucesso comum a `FATURAR`/`SUSPENDER`) — usados por ambas as user stories.

**⚠️ CRITICAL**: Nenhuma user story pode começar até esta fase terminar.

- [X] T002 [P] Implementar `src/client/stores/slices/identidadeVendaSlice.ts`: `{ origem: 'NOVA'|'RASCUNHO'|'DAV', numeroNota: number }` (`data-model.md` §1) — setter único chamado no mesmo call site de `resetarAuditoria(origem)` (feature 001); reset após sucesso de `FaturarNFCe`
- [X] T003 [P] Implementar `src/shared/schemas/faturarNFCe.schema.ts` (Zod): valida `NotaFiscal.PDFImpressao`/`XMLImpressao` como strings não-vazias (`contracts/faturamento-api.md`, Constitution IV) — resposta 2xx sem esse shape é erro de fronteira, nunca sucesso silencioso
- [X] T004 Implementar `src/client/domain/venda/montarRetratoVenda.ts`: `montarRetratoVenda(snapshot, operacao: 'FATURAR'|'SUSPENDER'|'VALIDAR', pagamentos)` — monta `CheckoutFaturarNFCe` a partir de snapshots já prontos (carrinho, identidade, `SessaoUsuario.CadSerieNFCe`, `vendedorCodigo`, `Log` via `serializarLogAuditoria`); função pura e total, sem conhecer Zustand/React/rede; os três retratos diferem **apenas** em `SuspenderOuFaturar` (`research.md` D1/D3, contrato com a feature 014) — depende de T002
- [X] T005 Implementar `src/client/services/faturamento/faturarNFCeMapper.ts`: valida a resposta via T003 e extrai `NotaFiscalResposta` (`PDFImpressao`/`XMLImpressao`) — depende de T003
- [X] T006 Implementar `src/client/services/faturamento/faturarNFCeMutation.ts`: TanStack mutation `POST /api/erp/FaturarNFCe`, **sem** retry automático em nenhum caso; classifica a falha por origem — `fetch` rejeitado sem resposta ⇒ `falha-rede`, resposta HTTP de erro ⇒ `falha-negocio` (`research.md` D2) — depende de T005
- [X] T007 [P] Implementar `src/client/domain/finalizacaoVenda/decidirMecanismoImpressao.ts`: `decidirMecanismoImpressao(tipoImpressao: 'E'|'P'): 'direta'|'pdf'` — qualquer valor fora de `{'E','P'}` lança erro de fronteira (`data-model.md` §5, Constitution IV)
- [X] T008 Implementar núcleo de `src/client/features/finalizacao-suspensao/useFinalizarOuSuspenderVenda.ts`: máquina de estados `ocioso|enviando|sucesso|falha-negocio|falha-rede` (`data-model.md` §4); monta o retrato via T004, dispara T006; em sucesso executa a limpeza comum a `FATURAR`/`SUSPENDER` na mesma transação — `removeQueries({queryKey:['produto']})`, reset do `carrinho` (003), `descartarAuditoria()` (001), reset de `identidadeVenda` (T002) — `FR-012`; em `falha-rede` mantém o log de auditoria e anexa `FATURAMENTO_FALHOU`, bloqueando novo envio até confirmação explícita (`FR-004`, AD-038); em `falha-negocio` libera reenvio sem trava extra — depende de T002, T004, T006
- [X] T009 [P] Unit test `tests/unit/domain/venda/montarRetratoVenda.spec.ts`: `NumeroNota=0` para `origem:'NOVA'`, preenchido para `'RASCUNHO'`/`'DAV'`; `CadSerieNFCe`/`vendedorCodigo` sempre presentes; `Log` é `serializarLogAuditoria` aplicado ao array corrente, round-trip parseável; retrato `'VALIDAR'` ≡ retrato `'FATURAR'` exceto `SuspenderOuFaturar` (I5 da feature 014) — `FR-001` a `FR-003`, `FR-010`, `FR-011`, `FR-015`
- [X] T010 [P] Unit test `tests/unit/domain/finalizacaoVenda/decidirMecanismoImpressao.spec.ts`: `'E'` → `'direta'`; `'P'` → `'pdf'`; valor fora de `{'E','P'}` lança erro de fronteira — `FR-008`, AD-082
- [X] T011 [P] Integration test `tests/integration/finalizacaoSuspensao.spec.ts`: `fetch` rejeitado sem resposta → estado `falha-rede`; nenhuma segunda chamada sem ação do operador; evento `FATURAMENTO_FALHOU` anexado; confirmação manual do operador libera reenvio com o **mesmo** payload recomposto e `Log` estritamente maior — `FR-004`, AD-038
- [X] T012 [P] Integration test `tests/integration/finalizacaoSuspensao.spec.ts`: resposta HTTP de erro do ERP → estado `falha-negocio`; reenvio subsequente não exige confirmação extra — `research.md` D2
- [X] T013 [P] Integration test `tests/integration/finalizacaoSuspensao.spec.ts`: resposta 2xx válida → `carrinho`, cache `['produto']`, `auditoria` e `identidadeVenda` descartados na mesma transação — `FR-012`

**Checkpoint**: Identidade da venda, retrato, mutation e máquina de estados genérica prontas — nenhuma user story ainda expõe UI ou aplica os gates específicos de `FATURAR`/`SUSPENDER`.

---

## Phase 3: User Story 1 - Finalizar a venda (Priority: P1) 🎯 MVP

**Goal**: Operador finaliza a venda (nova ou retomada) e recebe o documento fiscal pronto para impressão, respeitando o gate de validação prévia (`FR-014`) e o fallback de impressão (`FR-009`).

**Independent Test**: Finalizar uma venda criada do zero e uma venda retomada de um rascunho existente, confirmando em ambos os casos que o documento fiscal é emitido corretamente (payload com `NumeroNota=0` vs. preenchido).

### Tests for User Story 1

- [X] T014 [P] [US1] Integration test `tests/integration/finalizacaoSuspensao.spec.ts`: `podeFinalizar()` (injetado, stub de 014) retornando `false` bloqueia `FATURAR` — nenhuma chamada de rede é feita, UI comunica o bloqueio — `FR-014`, AD-113
- [X] T015 [P] [US1] Integration test `tests/integration/finalizacaoSuspensao.spec.ts`: falha na impressão direta (rede ou bloqueio de navegador simulado) aciona o fallback de PDF, sem falhar silenciosamente — `FR-009`, `research.md` D5

### Implementation for User Story 1

- [X] T016 [US1] Implementar `src/client/services/impressao/imprimirNFCeLocal.ts`: `POST http://{CadMaqHost}` (fallback `127.0.0.1:4545` com aviso ao operador quando `CadMaqHost` vazio), `Content-Type: text/plain`, corpo = `XMLImpressao` cru; sucesso = ausência de erro de rede (não valida resposta); classifica falha em "serviço indisponível" vs. "bloqueio de navegador" (`TypeError` específico do Chrome, antes de qualquer tentativa de conexão) com mensagens distintas — `contracts/impressao-local-api.md`, `research.md` D4/D5
- [X] T017 [US1] Wire o gate `FR-014` em `useFinalizarOuSuspenderVenda.ts` (T008): antes de disparar `FATURAR`, consulta `podeFinalizar()` (dependência injetada da feature 014, mesmo padrão de injeção de `temPagamentoNaoRemovivel` em `research.md` D7); bloqueado ⇒ nenhuma chamada de rede, sem alterar o estado da máquina — depende de T008
- [X] T018 [US1] Implementar `src/client/features/finalizacao-suspensao/BotaoFinalizarVenda.tsx`: botão desktop "Finalizar Venda" / equivalente mobile na etapa 03 (AD-089); aciona `FATURAR` via T008/T017 — **consultar o Pencil MCP antes de implementar** (`get_editor_state(include_schema: true)`, depois `batch_get`/`get_screenshot`/`get_variables`/`snapshot_layout` sobre o nó real da tela em `design/CentriumCheckout.pen`; nunca inferir o visual do código existente ou de senso genérico de design — CLAUDE.md § "Referência visual (design)")
- [X] T019 [US1] Implementar `src/client/features/finalizacao-suspensao/DialogoDocumentoFiscal.tsx`: em sucesso de `FATURAR`, decide o mecanismo via T007 — `'direta'` chama T016 (falha aciona o fallback de T015 dentro deste diálogo); `'pdf'` exibe/oferece download do `PDFImpressao` diretamente — `FR-007`, `FR-008`, `FR-009` — **consultar o Pencil MCP antes de implementar** (CLAUDE.md § "Referência visual (design)")
- [X] T020 [US1] Implementar `src/client/features/finalizacao-suspensao/DialogoConfirmarReenvio.tsx`: confirmação manual pós-`falha-rede` (`FR-004`, AD-038) — ao confirmar, reenvia o mesmo payload recomposto por T008 (o `Log` já inclui o evento de falha anterior) — **consultar o Pencil MCP antes de implementar** (CLAUDE.md § "Referência visual (design)")
- [X] T021 [US1] E2E `tests/e2e/finalizacao-suspensao.spec.ts` (quickstart, Camada 3, passos 1, 2, 5, 6), com o serviço de impressão local stubado: finalizar venda nova (`NumeroNota=0`) e venda retomada (`NumeroNota` do rascunho) → documento apresentado conforme `TipoImpressao`; falha de rede → confirmação manual exigida → reenvio ocorre; `TipoImpressao='E'` com stub retornando erro de conexão → oferece PDF como fallback

**Checkpoint**: User Story 1 funcional e testável de forma independente — finalização completa (`FR-001`, `FR-003`, `FR-004`, `FR-007` a `FR-009`, `FR-014`).

---

## Phase 4: User Story 2 - Suspender a venda em digitação (Priority: P1)

**Goal**: Operador cancela uma venda em digitação e ela fica suspensa de forma sincronizada com o servidor (rascunho preservado), bloqueada apenas quando há pagamento aprovado não removível.

**Independent Test**: Suspender uma venda em digitação e confirmar que o estado local é completamente limpo e que o rascunho fica disponível para retomada; confirmar que suspender é bloqueado só quando há pagamento TEF/PIX aprovado.

### Tests for User Story 2

- [X] T022 [P] [US2] Integration test `tests/integration/finalizacaoSuspensao.spec.ts`: `temPagamentoNaoRemovivel()` (injetado, stub de 008) retornando `true` bloqueia `SUSPENDER` — nenhuma chamada de rede é feita, UI comunica o bloqueio — `FR-005`, AD-042
- [X] T023 [P] [US2] Integration test `tests/integration/finalizacaoSuspensao.spec.ts`: `temPagamentoNaoRemovivel()` retornando `false` permite `SUSPENDER` normalmente, sem o gate `FR-014` (que se aplica só a `FATURAR`) — `FR-006`, `FR-016`

### Implementation for User Story 2

- [X] T024 [US2] Wire o predicado injetado `temPagamentoNaoRemovivel()` em `useFinalizarOuSuspenderVenda.ts` (T008): bloqueia `SUSPENDER` quando `true` (mesma origem/semântica de `CART-09`, `research.md` D7); nunca se aplica a `FATURAR` — depende de T008
- [X] T025 [US2] Implementar `src/client/features/finalizacao-suspensao/BotaoCancelarVenda.tsx`: botão desktop "Cancelar Venda" / ícone de lixeira mobile disponível em todas as etapas (AD-089); aciona `SUSPENDER` via T008/T024; sucesso não passa por `DialogoDocumentoFiscal` (suspender não gera documento fiscal) — **consultar o Pencil MCP antes de implementar** (CLAUDE.md § "Referência visual (design)")
- [X] T026 [US2] E2E `tests/e2e/finalizacao-suspensao.spec.ts` (quickstart, Camada 3, passos 3, 4, 7): suspender com pagamento removível aplicado → `SUSPENDER` enviado, carrinho/cache/auditoria/identidade limpos, pagamento removível persiste ao retomar o rascunho; tentar suspender com pagamento TEF/PIX aprovado → bloqueado sem chamada de rede; repetir o fluxo de finalização (passo 1) no layout mobile

**Checkpoint**: User Stories 1 e 2 funcionam de forma independente e integrada — feature completa (`FR-001` a `FR-012`, `FR-014`, `FR-016`).

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Mecanismo secundário não relacionado ao envio (polling de configuração), fechamento das dependências injetadas com stubs, e gates finais.

- [X] T027 [P] Implementar `src/client/services/statusSistema/pollingStatusSistema.ts`: `GET /api/erp/GetStatusSistema` a cada 60s (`Empresa` injetado pelo BFF, `Cadmaqcod` de `SessaoUsuario.CadMaqCod`); ativo só quando carrinho vazio **e** nenhum cliente identificado (lê, não muta, estado das features 003/005); resposta `0` sem ação, resposta `>=1` chama `refetchBootstrap()` (feature 002); falha de rede apenas tenta de novo no próximo ciclo, sem estado de erro visível — `FR-013`, AD-088
- [X] T028 [P] Integration test: polling ativo "entre vendas" (carrinho vazio e sem cliente), suspenso com item no carrinho ou cliente identificado; falha de rede não expõe erro ao operador — `tests/integration/pollingStatusSistema.spec.ts`
- [X] T029 [P] Wire `podeFinalizar()` (T017) e `temPagamentoNaoRemovivel()` (T024) como dependências injetadas com stubs (`() => true`/`() => false`) até as features 014 e 008 fornecerem as implementações reais — dependência por injeção, não por import (D7); não bloqueia esta feature
- [X] T030 Rodar `npx tsc --noEmit` e confirmar zero erros de tipo — gate obrigatório da Constitution (`Development Workflow`)
- [X] T031 Rodar as 3 camadas de `quickstart.md` (domínio puro, integração, E2E) e confirmar o critério de aceite da feature

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Depende de 002 (Fase 1), 001 (Foundational, `vendaStore.ts`) e 003 (slice `carrinho`) — fora desta feature
- **Foundational (Phase 2)**: Depende do Setup — BLOQUEIA as duas user stories
- **User Stories (Phase 3-4)**: Ambas dependem do Foundational
  - US1 pode começar assim que Phase 2 terminar
  - US2 pode começar em paralelo a US1 (arquivos distintos), mas ambas estendem `useFinalizarOuSuspenderVenda.ts` (T008) — coordenar merges
- **Polish (Phase 5)**: Depende das 2 user stories completas

### User Story Dependencies

- **US1 (P1)**: Depende de Foundational (T002, T004, T006, T008); gate `FR-014` testável desde já com stub de `podeFinalizar()`
- **US2 (P1)**: Depende de Foundational (T008); gate `FR-005`/`FR-006` testável desde já com stub de `temPagamentoNaoRemovivel()`, mesmo sem a feature 008 implementada

### Within Each User Story

- Tests antes da implementação correspondente, onde aplicável
- Serviço de rede (impressão) e wiring de gate antes dos componentes de UI que os consomem
- Botões antes dos diálogos que eles disparam
- Story completa antes do checkpoint

### Parallel Opportunities

- T002, T003, T007 (Foundational) em paralelo
- T009–T013 (testes Foundational) em paralelo entre si
- T014–T015 (testes US1) em paralelo
- T022–T023 (testes US2) em paralelo
- T027–T029 (Polish) em paralelo

---

## Parallel Example: Foundational

```bash
# Slice de identidade e schema Zod (arquivos diferentes, sem dependência entre si):
Task: "Implementar identidadeVendaSlice.ts em src/client/stores/slices/identidadeVendaSlice.ts"
Task: "Implementar faturarNFCe.schema.ts em src/shared/schemas/faturarNFCe.schema.ts"
Task: "Implementar decidirMecanismoImpressao.ts em src/client/domain/finalizacaoVenda/decidirMecanismoImpressao.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Completar Phase 1: Setup (pressupõe 002, 001 e 003 já implementadas)
2. Completar Phase 2: Foundational (bloqueia tudo)
3. Completar Phase 3: User Story 1
4. **PARAR e VALIDAR**: finalização completa (venda nova e retomada) funcionando isoladamente, com o gate `FR-014` testável via stub
5. Nesse ponto o operador só finaliza (US2 ainda não existe) — suficiente para validar o fluxo dourado de emissão

### Incremental Delivery

1. Setup + Foundational → base pronta (identidade, retrato, mutation, máquina de estados)
2. US1 → validar isoladamente (finalização, impressão, gate de validação prévia)
3. US2 → validar isoladamente + em conjunto com US1 (suspensão, bloqueio por pagamento não removível) — feature completa
4. Polish → polling de `GetStatusSistema` (independente das duas stories) + gates finais

### Parallel Team Strategy

Com mais de um desenvolvedor: completar Setup + Foundational juntos; depois um desenvolvedor segue com US1 (finalização/impressão), outro com US2 (suspensão/bloqueio) em paralelo, coordenando merges em `useFinalizarOuSuspenderVenda.ts` (T008); o polling de `GetStatusSistema` (Polish) pode avançar em paralelo a qualquer momento após o Foundational, por ser independente das duas stories.

---

## Notes

- [P] = arquivos diferentes, sem dependências
- [Story] mapeia cada tarefa à user story correspondente para rastreabilidade
- Verificar que os testes falham antes de implementar (TDD onde aplicável) — prioridade na máquina de estados de envio e no domínio puro (`plan.md` § Testing)
- Commit após cada tarefa ou grupo lógico
- Parar em cada checkpoint para validar a story isoladamente
- `montarRetratoVenda.ts` (T004) é implementado aqui mas **compartilhado** com a feature 014 (`specs/014-validacao-previa-nfce/`) — ao gerar `tasks.md` da 014, seu Foundational deve **reutilizar** este módulo, não reimplementá-lo; a variante `'VALIDAR'` só ganha call site real na 014
- `podeFinalizar()` (T017/T029) e `temPagamentoNaoRemovivel()` (T024/T029) chegam por injeção de dependência das features 014 e 008 respectivamente — nenhuma delas precisa estar implementada para esta feature ser completada e testada com stubs

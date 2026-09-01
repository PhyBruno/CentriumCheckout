---

description: "Task list template for feature implementation"
---

# Tasks: Venda Rápida por Cenário de Pagamento (F6–F9)

**Input**: Design documents from `specs/013-venda-rapida-cenario-pagamento/` (`plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/erp-cenario-pagamento-api.md`, `contracts/venda-rapida-domain-api.md`, `quickstart.md`)

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: Incluídos — `plan.md` § Testing e `quickstart.md` definem 3 camadas explícitas (unitário puro do domínio, integração do comando sobre o slice real, E2E). Cobertura visada: invariantes I1–I12 de `data-model.md` e cenários C1–C11 de `quickstart.md`.

**Organization**: 4 user stories em `spec.md` — US1 (P1), US2 (P1), US3 (P2), US4 (P1). As fases abaixo estão em **ordem de dependência real**, não na ordem de leitura da spec: US4 (parser/projeção seguros) vai primeiro porque US1, US2 e US3 consomem `ListaAtalhos` já filtrada — mesmo padrão de reordenação já usado no `tasks.md` da feature 008 (fases US1→US2→US4→US5→US3).

**⚠️ Ordem de implementação e dependências cruzadas**: esta feature depende de **002** (bootstrap/sessão, incluindo o campo `CenarioPagamento` e `CondicoesDePagamento[]` em `SessaoUsuario`), **008** (`obterSaldoEmAberto`, `vendaTemItens`, `irParaEtapaPagamento`, `selecionarCondicao`, `aplicarForma`, `resolverIntegracao` — todas portas injetadas, nunca reimplementadas aqui), **004** (`finalizarVenda`, com todas as suas validações), **001** (contrato de evento de auditoria, tipo novo `VENDA_RAPIDA_ACIONADA`) e **007** (capacidade `plataforma` injetada, mesmo padrão de AD-074). Nenhuma dessas features é implementada por este `tasks.md` — os call sites das portas injetadas assumem que essas features já expõem as funções descritas em `contracts/venda-rapida-domain-api.md` §4. A validação prévia (`ValidarNFCe`, feature 014) é responsabilidade de `aplicarForma` (008) — o atalho não implementa caminho próprio de validação (`plan.md`, "Emenda 2026-08-31").

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência de tarefas incompletas)
- **[Story]**: A qual user story a tarefa pertence (US1/US2/US3/US4)
- Caminhos de arquivo exatos em cada descrição

## Path Conventions

Extensão da árvore já proposta pela feature 002, conforme `plan.md` § Project Structure:

```text
src/client/domain/vendaRapida/   # parsearCenarios.ts, projetarAtalhos.ts, tipos.ts
src/client/schemas/              # cenarioPagamento.ts (já existe como diretório, criado pela 002)
src/client/features/vendaRapida/ # useAcionarCenario.ts, DicaAtalhos.tsx
src/client/hotkeys/              # mapaAtalhos.ts (mapa central já existente, exigido pela skill react-hotkeys-pdv)
tests/unit/vendaRapida/ | tests/integration/vendaRapida/ | tests/e2e/
```

---

## Phase 1: Setup

**Purpose**: Criar os diretórios específicos desta feature sobre a árvore já existente (002).

- [ ] T001 Criar estrutura de diretórios desta feature: `src/client/domain/vendaRapida/`, `src/client/features/vendaRapida/`, `tests/unit/vendaRapida/`, `tests/integration/vendaRapida/` (`src/client/schemas/` e `src/client/hotkeys/mapaAtalhos.ts` já existem, criados pelas features 002 e por quem primeiro registrou um atalho sob a skill `react-hotkeys-pdv` — caminho corrigido em 2026-08-31, remediação de `/speckit-analyze`, achado F1: `plan.md` § Project Structure declara `src/client/schemas/`, não `src/shared/schemas/`)

**Checkpoint**: Diretórios prontos — depende de `src/client/` já existir (Fase 1 da 002).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Tipos compartilhados e schema de fronteira — usados por todas as user stories, sem comportamento próprio de nenhuma delas.

**⚠️ CRITICAL**: Nenhuma user story pode começar até esta fase terminar.

- [ ] T002 [P] Implementar `src/client/domain/vendaRapida/tipos.ts`: `TeclaAtalho = 'F6'|'F7'|'F8'|'F9'` (união fechada), `CenarioPagamentoBruto`, `AtalhoVendaRapida`, `ResultadoAcionamento` (união discriminada `LANCADO`/`RECUSADO` — sem `AGUARDANDO_INTEGRACAO`, removida em 2026-08-31 por remediação de `/speckit-analyze`, achado C1), `MotivoRecusa = 'SEM_ITENS'|'SEM_SALDO_EM_ABERTO'|'ACIONAMENTO_EM_ANDAMENTO'|'ATALHO_INEXISTENTE'|'PLATAFORMA_NAO_SUPORTADA'|'LANCAMENTO_FALHOU'` — exatamente `data-model.md` §1.1–1.4
- [ ] T003 [P] Implementar schema Zod `src/client/schemas/cenarioPagamento.ts`: campo `CenarioPagamento` como `string` opcional (aceita ausente/vazio), validando apenas que o conteúdo, quando presente, é JSON de `string[]` — a validação campo-a-campo (7 partes, tipos, tecla) fica no parser (T006), não no Zod, porque um item malformado deve ser **descartado**, não fazer o schema inteiro falhar (`FR-004`, `contracts/erp-cenario-pagamento-api.md` §4)

**Checkpoint**: Tipos e schema prontos — nenhuma user story ainda tem comportamento.

---

## Phase 3: User Story 4 - Ignorar com segurança tudo que o ERP mandar fora do padrão (Priority: P1)

**Goal**: Transformar `SessaoUsuario.CenarioPagamento` em `ListaAtalhos` (≤ 4, um por tecla), descartando em silêncio qualquer item fora do padrão, sem nunca lançar exceção.

**Independent Test**: Catálogo de teste com cenários sem tecla, com tecla fora de F6–F9, com número de campos diferente de 7 e com condição/forma inexistentes — nenhum vira atalho, e os cenários válidos do mesmo catálogo continuam funcionando.

### Tests for User Story 4

- [ ] T004 [P] [US4] Unit test por tabela `tests/unit/vendaRapida/parsearCenarios.spec.ts`: I1 (teclas válidas, inválidas e mal formatadas — `"f7 "` deve normalizar para `F7`), I3 (item com 8 campos, ex.: nome contendo `;`, entre dois itens válidos — descartado sem interromper os demais), I4 (campo ausente, `""`, JSON malformado — resultado `[]`, sem lançar), I11 (literais de `encerraOperacao`: `"True"`, `"true"`, `"1"`, `"False"`, `""`, `"talvez"`) — usa a fixture sintética de `quickstart.md`
- [ ] T005 [P] [US4] Unit test `tests/unit/vendaRapida/projetarAtalhos.spec.ts`: I2 (catálogo com 6 cenários válidos → no máximo 4 atalhos, no máximo 1 por tecla; duas colisões na mesma tecla → vence o primeiro na ordem do ERP, resultado idêntico entre execuções), I5 (cenário com `condicaoCodigo` inexistente e cenário com `formaCodigo` fora da condição → ambos descartados), I10 (mesmo catálogo avaliado como `plataforma: 'desktop'` e como `plataforma: 'mobile'` → `[]` no mobile)

### Implementation for User Story 4

- [ ] T006 [US4] Implementar `parsearCenarios` em `src/client/domain/vendaRapida/parsearCenarios.ts`: E1 `parseJsonDeStrings` (`JSON.parse` total, falha ⇒ `[]`) + E2 `parseItem` (`split(';')`, exige exatamente 7 partes — `FR-004`/AD-105; campos 0 e 2 convertidos para inteiro, não numérico descarta; campo 4 `nome` vazio descarta; campo 5 interpretado pelo conjunto fail-safe fechado de D4/AD-106) — depende de T002, T003
- [ ] T007 [US4] Implementar `projetarAtalhos` e `buscarAtalho` em `src/client/domain/vendaRapida/projetarAtalhos.ts`: E3 `filtrarTeclaValida` (`trim` + caixa alta, ∈ `{F6,F7,F8,F9}`), E4 `filtrarExistenciaNoCatalogo` (cruza com `CondicoesDePagamento[]`/`CondicaoFormasDePagamento[]` da sessão — `FR-005`), E5 `resolverEmpateDeTecla` (primeiro na ordem do ERP), E6 `aplicarPlataforma` (`plataforma !== 'desktop'` ⇒ `[]` — `FR-020`/D11); pura, determinística, `plataforma` recebido como parâmetro, nunca lido de `window` — depende de T006

**Checkpoint**: `ListaAtalhos` correta e defensiva — testável isoladamente com a fixture de `quickstart.md` (cobre C3, C4 e a metade de projeção de C10), sem depender de nenhuma outra user story.

---

## Phase 4: User Story 1 - Lançar o pagamento inteiro com uma tecla (Priority: P1) 🎯 MVP

**Goal**: Pressionar uma tecla F6–F9 lança um pagamento com a condição e a forma do cenário, pelo saldo em aberto integral, sem pedir nenhum dado adicional ao operador.

**Independent Test**: Sessão com um cenário na tecla F6, venda com itens; pressionar F6 lança o pagamento com condição/forma do cenário, no valor exato do saldo em aberto.

### Tests for User Story 1

- [ ] T008 [P] [US1] Integration test `tests/integration/vendaRapida/acionarCenario.spec.ts`: G1–G4 recusam sem alterar a venda — `ACIONAMENTO_EM_ANDAMENTO` (guard já ligado), `ATALHO_INEXISTENTE` (tecla sem atalho na `ListaAtalhos`), `SEM_ITENS` (`vendaTemItens` retorna `false`), `SEM_SALDO_EM_ABERTO` (`obterSaldoEmAberto` retorna `0`) — `FR-009`, I8
- [ ] T009 [P] [US1] Integration test mesmo arquivo: acionamento sobre atalho válido chama `selecionarCondicao`, depois `aplicarForma` com o saldo em aberto integral em `Centavos` (nunca um valor parcial) — `aplicarForma` é o mesmo caminho que aplica o gate `ValidarNFCe` da feature 014 (`FR-021`), então este teste também cobre implicitamente a passagem pelo gate — devolve `{ tipo: 'LANCADO', valorLancado, finalizacaoIniciada: false }` (finalização é US2) e chama `registrarEvento` exatamente uma vez com tecla/cenário/condição/forma/valor — I6, I12, `FR-008`, `FR-017`, `FR-021`
- [ ] T010 [P] [US1] Integration test mesmo arquivo (**reescrito em 2026-08-31, remediação de `/speckit-analyze`, achado C1**): com `resolverIntegracao` retornando `'TEF'`/`'PIX_DINAMICO'`, mockar `aplicarForma` para só resolver depois de uma confirmação assíncrona simulada (equivalente ao ciclo `PENDENTE_INTEGRACAO` → `confirmarPagamentoIntegrado`/`recusarPagamentoIntegrado` já implementado em 008, `specs/008-pagamento-geral/tasks.md` T021/T022) — a Promise de `acionarCenario` **não resolve antes** dessa confirmação (nenhum retorno antecipado); quando `aplicarForma` resolve com sucesso, devolve `{ tipo: 'LANCADO', ... }` normalmente; quando `aplicarForma` rejeita (TEF/PIX recusado), devolve `{ tipo: 'RECUSADO', motivo: 'LANCAMENTO_FALHOU' }` sem alterar a venda — `FR-013`, D10, quickstart C5 (cobertura completa, incluindo o "depois da confirmação")
- [ ] T011 [P] [US1] Integration test mesmo arquivo: dois acionamentos disparados sem aguardar o primeiro concluir produzem no máximo um lançamento; o segundo é recusado por `ACIONAMENTO_EM_ANDAMENTO`; o guard é limpo ao final mesmo quando `aplicarForma` rejeita — I9, quickstart C7
- [ ] T012 [P] [US1] Integration test `tests/integration/vendaRapida/hotkeys.spec.ts`: pressionar F6–F9 com o foco em campo de busca de produto, de quantidade ou de valor não dispara `acionarCenario`; uma sequência simulada de leitura de código de barras não é interpretada como atalho — `FR-014`, `SC-005`, quickstart C8

### Implementation for User Story 1

- [ ] T013 [US1] Implementar `acionarCenario(tecla)` em `src/client/features/vendaRapida/useAcionarCenario.ts`: G1 (guard `acionamentoEmAndamento`) → G2 (`buscarAtalho`, T007) → G3 (`vendaTemItens`) → G4 (`obterSaldoEmAberto > 0`) → P1 (marca guard) → P2 (`irParaEtapaPagamento`, `FR-019`) → P3 (`selecionarCondicao`) → P4 (**um único** `await aplicarForma(...)` pelo saldo integral — a Promise só resolve após o pagamento estar de fato aplicado, inclusive aguardando confirmação de TEF/PIX quando `resolverIntegracao` indicar; rejeição ⇒ `RECUSADO('LANCAMENTO_FALHOU')`, pula direto para P6/P7) → P6 (`registrarEvento`, com `finalizacaoAutomatica: false` fixo — P5 ainda não existe nesta fase) → P7 (limpa guard sempre, inclusive em falha); dependências injetadas conforme `contracts/venda-rapida-domain-api.md` §4 — depende de T007. **Nota (correção F3 de `/speckit-analyze`)**: T019 (US2) reposiciona esta emissão de P6 para depois da nova etapa P5, substituindo o `finalizacaoAutomatica: false` fixo pelo valor real da decisão de finalização — não deixar as duas implementações divergentes.

  **Correção F2 (`/speckit-analyze`, 2026-08-31)**: `acionamentoEmAndamento` (G1/P1/P7) **não** é estado local do hook — `data-model.md` §1.5 exige que viva no slice de pagamento da venda (`vendaStore`), justamente para ser compartilhado entre o disparo por tecla (T014, fora de qualquer componente) e o clique na UI (T022, `DicaAtalhos.tsx`); dois hooks/instâncias separados com `useState`/`useRef` locais **não** compartilhariam o guard e quebrariam I9/`FR-015`/`SC-004`. Acrescentar o campo `acionamentoEmAndamento: boolean` ao slice já existente `src/client/stores/slices/pagamentoSlice.ts` (feature 008, confirmado em `specs/008-pagamento-geral/tasks.md` linha 32), combinado em `vendaStore.ts`; `useAcionarCenario.ts` lê/grava esse campo do store, nunca estado próprio de componente.
- [ ] T014 [US1] Registrar `F6`–`F9` no mapa central `src/client/hotkeys/mapaAtalhos.ts`, desabilitado enquanto o foco estiver em campo de entrada de texto/numérico da venda, chamando `acionarCenario` (T013) — `FR-014`, D12 (skill `react-hotkeys-pdv`) — depende de T013

**Checkpoint**: Pressionar F6–F9 lança o pagamento correto pelo saldo integral, de forma independente e testável, sem finalizar a venda sozinho (isso é US2).

---

## Phase 5: User Story 2 - Encerrar a venda automaticamente quando o cenário assim determinar (Priority: P1)

**Goal**: Cenários com "encerra a operação" ligado finalizam a venda sozinhos, sem diálogo de confirmação, logo após o lançamento zerar o saldo.

**Independent Test**: Dois cenários, um com "encerra a operação" ligado e outro desligado — confirmar que apenas o primeiro dispara a finalização.

### Tests for User Story 2

- [ ] T015 [P] [US2] Integration test `tests/integration/vendaRapida/acionarCenario.spec.ts` (mesmo arquivo de T008–T011): cenário com `encerraOperacao: true` e lançamento que zera o saldo → chama `finalizarVenda` sem nenhum diálogo de confirmação, resultado `{ tipo: 'LANCADO', finalizacaoIniciada: true }` — I7, quickstart C1, `SC-001`
- [ ] T016 [P] [US2] Integration test mesmo arquivo: cenário com `encerraOperacao: false` → pagamento lançado, `finalizarVenda` **não** é chamada, resultado `finalizacaoIniciada: false` — quickstart C2
- [ ] T017 [P] [US2] Integration test mesmo arquivo: `aplicarForma` rejeita (`RECUSADO('LANCAMENTO_FALHOU')`) — inclusive quando a rejeição vem do gate `ValidarNFCe` da feature 014 (`FR-021`/`FR-022`, mesmo caminho de erro) — `finalizarVenda` **não** é chamada, estado da venda idêntico ao anterior (snapshot do store), erro exposto ao operador — I8, `FR-011`, `FR-022`
- [ ] T018 [P] [US2] Integration test mesmo arquivo: `encerraOperacao: true`, mas o lançamento não zera o saldo em aberto (comportamento anômalo) → `finalizarVenda` **não** é chamada, saldo remanescente informado — I7, `FR-010`

### Implementation for User Story 2

- [ ] T019 [US2] Estender `acionarCenario` (T013) com P5: após P4 bem-sucedido, `saldoEmAberto === 0 && encerraOperacao` chama `finalizarVenda` (porta 004) sem diálogo e marca `finalizacaoIniciada: true`; falha em P3/P4 ou saldo remanescente pulam P5 e preservam o estado anterior. **Correção F3 (`/speckit-analyze`, 2026-08-31)**: reposicionar a emissão do evento de auditoria (P6, implementada em T013) para **depois** desta decisão de P5, e substituir o `finalizacaoAutomatica: false` fixo de T013 pelo valor real (`true` quando `finalizarVenda` foi chamada) — sem essa mudança o evento sempre reportaria `finalizacaoAutomatica: false`, mesmo quando a venda foi finalizada — depende de T013

**Checkpoint**: Fluxo dourado completo (quickstart C1) funcional — um único acionamento cobre lançamento e finalização quando aplicável.

---

## Phase 6: User Story 3 - Enxergar quais atalhos existem (Priority: P2)

**Goal**: Mostrar ao operador, no layout desktop, a tecla e o nome de cada atalho ativo; nada é exibido quando não há nenhum.

**Independent Test**: Sessão com dois cenários válidos (F6, F8) e um inválido — a tela mostra exatamente os dois válidos, com tecla e nome.

### Tests for User Story 3

- [ ] T020 [P] [US3] Component test `tests/unit/vendaRapida/DicaAtalhos.spec.tsx`: renderiza uma entrada por `AtalhoVendaRapida` (tecla + `nome`) a partir de uma `ListaAtalhos` de teste; `ListaAtalhos` vazia → nenhum elemento renderizado, sem mensagem de erro — `FR-016`
- [ ] T021 [P] [US3] Component test mesmo arquivo: clicar no elemento visual de um atalho chama exatamente `acionarCenario` (T013) com a mesma tecla — nenhum caminho alternativo de lançamento (US3, cenário de aceitação 3)

### Implementation for User Story 3

- [ ] T022 [US3] Implementar `src/client/features/vendaRapida/DicaAtalhos.tsx`: consome `ListaAtalhos` (T007) já pronta, sem filtrar, ordenar ou reinterpretar nada; cada entrada chama `acionarCenario` (T013) ao clicar; omite a área inteira quando a lista está vazia — inclusive no mobile, onde `projetarAtalhos` já devolve `[]` (D11/I10), sem `if (isMobile)` no componente — depende de T007, T013

**Checkpoint**: As quatro user stories completas e independentemente testáveis (`FR-001` a `FR-020`).

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Cobertura E2E do fluxo completo e gates finais que os testes unitários/integração não cobrem.

- [ ] T023 [P] E2E `tests/e2e/venda-rapida.spec.ts` (`quickstart.md` C1, C6, C8, C9): fluxo dourado completo no navegador (F6 encerra a venda com um toque) — medir o tempo entre o acionamento da tecla e o pagamento visível na venda e asserir `< 1s` (`SC-002`, achado E1 de `/speckit-analyze`); recusas sem alterar a venda com carrinho vazio e saldo zerado (C6); não colisão com digitação/bipagem (C8); acionamento com o carrinho ainda aberto leva à etapa de pagamento e lança o cenário na mesma ação (`FR-019`, C9)
- [ ] T024 [P] E2E complementar `tests/e2e/venda-rapida.spec.ts`: mesma sessão avaliada como mobile — nenhuma dica de atalho renderizada e nenhum acionamento possível por tecla (`FR-020`, quickstart C10)
- [ ] T025 Rodar `npx tsc --noEmit` e confirmar zero erros de tipo — gate obrigatório da Constitution (`Development Workflow`)
- [ ] T026 Revisar manualmente a trilha de auditoria (`quickstart.md` C11) contra o contrato de evento de `contracts/venda-rapida-domain-api.md` §5 (`VENDA_RAPIDA_ACIONADA` com tecla, cenário, condição, forma, valor, `finalizacaoAutomatica`) — confirmar que acionamentos recusados em G1–G4 não geram evento

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Depende de 002 (Fase 1) — fora desta feature
- **Foundational (Phase 2)**: Depende do Setup — BLOQUEIA todas as user stories
- **US4 (Phase 3)**: Depende do Foundational (T002, T003) — BLOQUEIA US1, US2 e US3, pois todas consomem `ListaAtalhos`
- **US1 (Phase 4)**: Depende de US4 (T007) — MVP
- **US2 (Phase 5)**: Depende de US1 (T013, estende o mesmo comando)
- **US3 (Phase 6)**: Depende de US4 (T007) e US1 (T013) — pode rodar em paralelo com US2, já que ambas só estendem/consomem T013 sem se tocar
- **Polish (Phase 7)**: Depende de US1, US2 e US3 completas

### User Story Dependencies

- **US4 (P1)**: Depende apenas do Foundational — sem dependência de outra story; é pré-requisito arquitetural das demais, apesar de listada por último em `spec.md`
- **US1 (P1)**: Depende de US4 (`ListaAtalhos`); MVP
- **US2 (P1)**: Depende de US1 (estende `acionarCenario` com a etapa de finalização, P5)
- **US3 (P2)**: Depende de US4 (`ListaAtalhos`) e US1 (`acionarCenario` para o clique); independente de US2

### Within Each User Story

- Tests antes da implementação correspondente
- Parser (US4) antes de projeção (US4) antes de comando (US1) antes de UI (US3)
- Comando base (US1) antes da extensão de finalização (US2)
- Story completa antes do checkpoint

### Parallel Opportunities

- T002, T003 (Foundational) em paralelo entre si
- T004, T005 (testes US4) em paralelo entre si
- T008–T012 (testes US1) em paralelo entre si, após T007 existir
- T015–T018 (testes US2) em paralelo entre si, após T013 existir
- T020, T021 (testes US3) em paralelo entre si
- US2 (Phase 5) e US3 (Phase 6) podem ser desenvolvidas em paralelo por pessoas diferentes, já que ambas só dependem de US1 e não se tocam
- T023, T024 (E2E) em paralelo entre si

---

## Parallel Example: User Story 4 (testes)

```bash
# Os 2 testes unitários de parser/projeção (arquivos independentes):
Task: "Unit test por tabela de parsearCenarios em tests/unit/vendaRapida/parsearCenarios.spec.ts"
Task: "Unit test de projetarAtalhos em tests/unit/vendaRapida/projetarAtalhos.spec.ts"
```

## Parallel Example: User Story 1 (testes de integração)

```bash
# Os 4 testes de integração de acionarCenario.spec.ts (blocos independentes) + o de hotkeys:
Task: "Integration test G1-G4 recusas em tests/integration/vendaRapida/acionarCenario.spec.ts"
Task: "Integration test lançamento feliz + auditoria em tests/integration/vendaRapida/acionarCenario.spec.ts"
Task: "Integration test aplicarForma aguarda confirmação de TEF/PIX antes de resolver em tests/integration/vendaRapida/acionarCenario.spec.ts"
Task: "Integration test acionamento concorrente em tests/integration/vendaRapida/acionarCenario.spec.ts"
Task: "Integration test não colisão com digitação/bipagem em tests/integration/vendaRapida/hotkeys.spec.ts"
```

---

## Implementation Strategy

### MVP First (User Story 4 + User Story 1)

1. Completar Phase 1: Setup
2. Completar Phase 2: Foundational
3. Completar Phase 3: US4 (parser e projeção seguros) — pré-requisito arquitetural, não visível ao operador sozinho
4. Completar Phase 4: US1 — **PARAR e VALIDAR**: pressionar F6 lança o pagamento correto
5. Nesse ponto já há valor demonstrável, mesmo sem finalização automática nem dica visual

### Incremental Delivery

1. Setup + Foundational → base pronta (tipos, schema)
2. US4 → `ListaAtalhos` correta e defensiva, validável isoladamente com a fixture de `quickstart.md`
3. US1 → pressionar tecla lança pagamento → validar isoladamente (MVP)
4. US2 → finalização automática → validar isoladamente (fluxo dourado completo, C1)
5. US3 → dica visual → validar isoladamente
6. Polish → E2E completo + gates finais

### Parallel Team Strategy

Com mais de um desenvolvedor: completar Setup + Foundational + US4 juntos (é a base de tudo); depois um desenvolvedor segue com US1 → US2 (mesmo arquivo, `useAcionarCenario.ts`, sequencial), outro prepara US3 (`DicaAtalhos.tsx`) assim que US1 (T013) estiver disponível — US2 e US3 não se tocam.

---

## Notes

- [P] = arquivos diferentes, sem dependências
- [Story] mapeia cada tarefa à user story correspondente para rastreabilidade
- Verificar que os testes falham antes de implementar (TDD onde aplicável) — prioridade no parser (T006) e no comando (T013), que são o núcleo de risco monetário/fiscal da feature
- Commit após cada tarefa ou grupo lógico
- Parar em cada checkpoint (Phase 3, 4, 5, 6) para validar a story isoladamente
- G2 (`data-model.md` §3) cita dois motivos de recusa possíveis para a mesma checagem — `ATALHO_INEXISTENTE` e `PLATAFORMA_NAO_SUPORTADA` — mas `contracts/venda-rapida-domain-api.md` §4 não lista `plataforma` como porta injetada de `acionarCenario` separadamente da projeção (T007). **Revisado em `/speckit-analyze` (2026-08-31) e considerado não bloqueante**: T013 resolve isso tratando `buscarAtalho` (T007) como fonte única — no mobile, `ListaAtalhos` já vem vazia (I10), então G2 devolve `ATALHO_INEXISTENTE` também no mobile; `PLATAFORMA_NAO_SUPORTADA` fica sem caminho de código que o produza, já que a UI/atalhos nem existem no mobile (`FR-020`) para acionar o comando em primeiro lugar — o literal permanece no tipo por completude, mas nunca é de fato retornado.
- **Correção C1 (`/speckit-analyze`, 2026-08-31)**: a retomada assíncrona após confirmação de TEF/PIX (`FR-013`, quickstart C5) não exige mecanismo próprio de 013 — `aplicarForma` (porta de 008) só resolve após o pagamento estar de fato aplicado, reaproveitando o ciclo `PENDENTE_INTEGRACAO` → `confirmarPagamentoIntegrado`/`recusarPagamentoIntegrado` já implementado em `specs/008-pagamento-geral/tasks.md` (T021/T022). Ver `data-model.md` §1.4/§3 e `contracts/venda-rapida-domain-api.md` §4 para o texto atualizado.
- `obterSaldoEmAberto`, `vendaTemItens`, `irParaEtapaPagamento`, `selecionarCondicao`, `aplicarForma`, `resolverIntegracao` (feature 008) e `finalizarVenda` (feature 004) são dependências injetadas (Dependency Inversion) — `useAcionarCenario.ts` nunca importa código das features 004/008/009/010 diretamente, mesmo padrão já usado por vendedor (012) e cliente (005)

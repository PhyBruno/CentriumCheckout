---

description: "Task list for feature implementation"
---

# Tasks: Atalhos de teclado fixos do Checkout

**Input**: Design documents from `/specs/016-atalhos-teclado-fixos/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/atalhos-fixos-api.md](./contracts/atalhos-fixos-api.md), [quickstart.md](./quickstart.md)

**Tests**: OBRIGATÓRIOS nesta feature. `SC-007` da spec exige dois casos por atalho de ação, e a skill de projeto `react-hotkeys-pdv` exige que o teste venha antes da implementação. Todo teste marcado ⚠️ deve **falhar** antes de a tarefa de implementação começar.

**Organization**: tarefas agrupadas por user story, cada uma entregável e testável de forma independente.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos distintos, sem dependência pendente)
- **[Story]**: a qual user story a tarefa pertence (US1–US5)

---

## ⚠️ Arquivos tocados em mais de uma fase — nunca paralelizar

| Arquivo | Fases que o tocam | Consequência |
|---|---|---|
| `src/client/layout/AppShell.tsx` | US1, US2, US3, US4 | US1 cria o registro com ações no-op; cada story seguinte **substitui um no-op** pela ação real. Quatro fases no mesmo arquivo — sequencial, sempre |
| `src/client/lib/useFocoDeModal.ts` | Foundational, US2 | Foundational acrescenta `haJanelaAberta()`; US2 acrescenta `focoInicial` |
| `src/client/hotkeys/mapaAtalhos.ts` | Foundational | Fase única, mas o arquivo é compartilhado com a feature 013 — `useAtalhosDeTeclado` **não muda** |
| `src/client/domain/vendaRapida/tipos.ts` | US5 | Fase única |

---

## Phase 1: Setup

**Purpose**: o vocabulário compartilhado. Nada aqui depende de React.

- [ ] T001 Criar `src/client/hotkeys/mapaFixo.ts` com `TeclaFixa`, `IdComando`, `ComandoFixo` e a constante `MAPA_FIXO` das cinco entradas, conforme `contracts/atalhos-fixos-api.md` §1 — sem F5, F11 e F12
- [ ] T002 [P] Criar `src/client/hotkeys/mapaFixo.test.ts` verificando a invariante I1: `MAPA_FIXO` e `TECLAS_ATALHO` (de `src/client/domain/vendaRapida/tipos.ts`) não têm tecla em comum, e `MAPA_FIXO` tem exatamente uma entrada por `TeclaFixa`

**Checkpoint**: o mapa existe e a disjunção é verificada por suíte, não por convenção.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: a maquinaria de posse. **Nenhuma user story pode começar antes desta fase.**

**⚠️ CRITICAL**: é aqui que FR-001/FR-002/FR-005 viram estrutura. Se esta fase sair errada, todas as stories herdam o vazamento.

- [ ] T003 ⚠️ [P] Escrever `src/client/hotkeys/useTeclasFixas.test.tsx` cobrindo os quatro estágios de posse do `data-model.md` §4: (a) a tecla é engolida com o foco fora de campo; (b) engolida com o foco em `input` comum; (c) engolida com tecla repetida (`repeat: true`), e a ação **não** roda; (d) deferida quando `defaultPrevented` já está marcado. Simular com `user-event`, nunca `keyDown` cru
- [ ] T004 ⚠️ [P] Escrever `src/client/stores/janelasStore.test.ts` cobrindo a invariante I3: `abrir` é inerte com outra janela já aberta, `substituir` troca sem passar por `'nenhuma'`, e nenhum estado representa duas janelas
- [ ] T005 [P] Criar `src/client/stores/janelasStore.ts` conforme `contracts/atalhos-fixos-api.md` §3 — Zustand sem `persist` e sem Immer (o estado é um enum). Faz T004 passar
- [ ] T006 [P] Acrescentar `haJanelaAberta()` a `src/client/lib/useFocoDeModal.ts`, consultando a `pilhaDeJanelas` que o módulo já mantém (research D3). **Não** usar `closest('[role="dialog"]')` — devolve `null` com o foco no `body`
- [ ] T007 Acrescentar `useTeclasFixas` e `AcaoFixa` a `src/client/hotkeys/mapaAtalhos.ts` conforme §2 do contrato: `enabled` literal `true`, `preventDefault: true`, `useKey: true`, `enableOnFormTags: true`, `enableOnContentEditable: true`, `ignoreEventWhen` restrito a `defaultPrevented`; `repeat` e `haJanelaAberta()` suprimem a **ação**, nunca o `preventDefault`. Faz T003 passar. `useAtalhosDeTeclado` fica intacto (depende de T005, T006)
- [ ] T008 [P] Acrescentar `OrigemAcionamento = 'CLIQUE' | 'TECLADO'` a `src/client/domain/auditoria/eventos.ts`, sem tocar em `TeclaVendaRapida` — são vocabulários distintos (research D12)

**Checkpoint**: a posse existe e é testada isoladamente. As user stories podem começar.

---

## Phase 3: User Story 1 — Nenhuma tecla reservada escapa (Priority: P1) 🎯 MVP

**Goal**: as cinco teclas passam a pertencer ao Checkout em toda a tela de venda, em qualquer estado.

**Independent Test**: percorrer as cinco teclas nos estados problemáticos (carregando, sem cenário cadastrado, foco em campo, modal aberto, tecla segurada) e verificar que o navegador não reage. **Não exige nenhuma ação implementada** — por isso esta fase registra as cinco com `executar` no-op, e as stories seguintes substituem um no-op cada.

### Tests for User Story 1 ⚠️

- [ ] T009 ⚠️ [P] [US1] Escrever `src/client/layout/AppShell.atalhos.test.tsx`: com a tela de venda montada e a query do catálogo **pendente**, cada uma das cinco teclas é engolida (`preventDefault` chamado) — o cenário C1 do quickstart, que é o bug original
- [ ] T010 ⚠️ [P] [US1] Acrescentar ao mesmo arquivo: as cinco teclas são engolidas com o foco no campo de quantidade e com uma janela aberta (cenários C2 e C3)
- [ ] T011 ⚠️ [P] [US1] Acrescentar ao mesmo arquivo: nenhuma das teclas F5, F11 e F12 é registrada — `preventDefault` **não** é chamado para elas (FR-008)

### Implementation for User Story 1

- [ ] T012 [US1] Chamar `useTeclasFixas` uma única vez em `src/client/layout/AppShell.tsx`, acima da bifurcação `useIsMobile()`, com as cinco ações: `indisponivel` já real onde a fonte existe, `executar` como no-op documentado com o número da tarefa que o substitui (faz T009–T011 passarem)
- [ ] T013 [US1] Verificar em `src/client/layout/AppShell.tsx` que o registro não consulta query, `sessionStore`, cadastro nem plataforma — FR-002 é sobre ausência de dependência, e é o que um teste não pega sozinho

**Checkpoint**: US1 completa. A classe de falha em que um bipe desaparece dentro do navegador deixou de existir, mesmo sem nenhum atalho ainda agir.

---

## Phase 4: User Story 2 — Cliente e produto sem tirar a mão do teclado (Priority: P2)

**Goal**: F3 e F4 abrem os modais de cliente e de produto com o campo de busca já focado.

**Independent Test**: abrir os dois modais só por tecla, digitar e concluir sem nenhum evento de mouse.

### Tests for User Story 2 ⚠️

- [ ] T014 ⚠️ [P] [US2] Escrever em `src/client/lib/useFocoDeModal.test.tsx` o caso do foco inicial: o elemento declarado recebe foco **depois** de a janela deixar de ser inerte, e um `focus()` disparado cedo demais é detectado como falha
- [ ] T015 ⚠️ [P] [US2] Escrever os dois casos obrigatórios de F3 e de F4 (quatro no total) em `src/client/layout/AppShell.atalhos.test.tsx`: (a) aciona com o foco fora de campo; (b) não vaza para o navegador durante digitação no campo de bipagem
- [ ] T016 ⚠️ [P] [US2] Escrever em `src/client/features/cliente/CampoClienteVenda.test.tsx` e `src/client/features/carrinho/EntradaRapidaProduto.test.tsx` que a abertura por clique continua funcionando e que o campo de busca fica focado nos dois caminhos (FR-021)

### Implementation for User Story 2

- [ ] T017 [US2] Acrescentar `focoInicial` a `src/client/lib/useFocoDeModal.ts` conforme §4 do contrato, aplicado um render depois de a janela deixar de ser inerte (faz T014 passar)
- [ ] T018 [US2] **Investigar antes de alterar** (risco 1 do plano, research D8): em `src/client/features/carrinho/EntradaRapidaProduto.tsx` e `src/client/features/cliente/CampoClienteVenda.tsx`, confirmar que nenhum parâmetro de abertura (termo pré-preenchido, item em edição) está acoplado ao booleano de abertura. Registrar o achado no próprio PR; se estiver acoplado, parar e reportar antes de prosseguir
- [ ] T019 [P] [US2] Migrar a abertura de `ModalBuscaCliente` em `src/client/features/cliente/CampoClienteVenda.tsx` para `janelasStore` (`'cliente'`), mantendo local qualquer parâmetro de abertura, e declarar o campo de busca como `focoInicial` (depende de T017, T018)
- [ ] T020 [P] [US2] Migrar a abertura de `ModalBuscaProduto` em `src/client/features/carrinho/EntradaRapidaProduto.tsx` para `janelasStore` (`'produto'`), mesmas condições (depende de T017, T018)
- [ ] T021 [US2] Substituir em `src/client/layout/AppShell.tsx` os no-ops de `IDENTIFICAR_CLIENTE` e `IDENTIFICAR_PRODUTO` pelo `abrir()` do store, registrando auditoria com `origem: 'TECLADO'` (faz T015 passar; depende de T019, T020)

**Checkpoint**: US1 e US2 funcionam de forma independente.

---

## Phase 5: User Story 3 — Importar DAV e NFCe por tecla (Priority: P3)

**Goal**: F1 e F2 abrem as janelas de importação direto, com recusa explicada em venda em andamento.

**Independent Test**: acionar F1/F2 em venda vazia (abre) e em venda com item ou cliente identificado (recusa com motivo em texto).

### Tests for User Story 3 ⚠️

- [ ] T022 ⚠️ [P] [US3] Escrever os dois casos obrigatórios de F1 e de F2 em `src/client/layout/AppShell.atalhos.test.tsx`, mais a recusa: com item lançado, a janela não abre e a mensagem de recusa é a mesma do botão bloqueado (cenário C7)
- [ ] T023 ⚠️ [P] [US3] Escrever o caso do cliente padrão em `src/client/layout/AppShell.atalhos.test.tsx`: com apenas o cliente padrão aplicado, F1 **abre** — cliente padrão não é venda em andamento (cenário C8, regra AD-138)
- [ ] T024 ⚠️ [P] [US3] Escrever em `src/client/features/importacao/BotaoMenuImportacao.test.tsx` que o caminho por clique continua passando pelo seletor, inalterado

### Implementation for User Story 3

- [ ] T025 [US3] Migrar o `JanelaAberta` local de `src/client/features/importacao/BotaoMenuImportacao.tsx` para `janelasStore`, usando `substituir()` na escolha do seletor para não empilhar janelas (faz T024 passar)
- [ ] T026 [US3] Substituir em `src/client/layout/AppShell.tsx` os no-ops de `IMPORTAR_DAV` e `IMPORTAR_NFCE`: `indisponivel` chama `recusaAtual()` de `useRecusaDeImportacao` e devolve `mensagemDeRecusa(motivo)`; `executar` abre `'dav'`/`'nfce'` direto, pulando o seletor (research D6, D7). Auditoria com `origem: 'TECLADO'` (faz T022, T023 passarem; depende de T025)

**Checkpoint**: US1, US2 e US3 funcionam de forma independente.

---

## Phase 6: User Story 4 — Suspender a venda por tecla (Priority: P4)

**Goal**: F10 suspende a venda, com a mesma confirmação e as mesmas recusas do caminho por clique.

**Independent Test**: acionar F10 em venda com conteúdo e verificar que o desfecho é idêntico ao do botão, e que a venda é retomável.

### Tests for User Story 4 ⚠️

- [ ] T027 ⚠️ [P] [US4] Escrever os dois casos obrigatórios de F10 em `src/client/layout/AppShell.atalhos.test.tsx`, mais: em venda vazia a recusa é explicada e a tecla não vaza (cenário C9)
- [ ] T028 ⚠️ [P] [US4] Escrever que F10 resolve para **suspensão** e que o descarte da venda não é oferecido em nenhum momento (FR-017, cenário US4-6 da spec)

### Implementation for User Story 4

- [ ] T029 [US4] Substituir em `src/client/layout/AppShell.tsx` o no-op de `SUSPENDER_VENDA` por `useFinalizacaoVenda().suspender`, com `indisponivel` vindo de `motivoDeBloqueioDoCancelar` — os mesmos de `AcaoCancelarVenda` (research D9). O `ProvedorFinalizacaoVenda` já está montado neste arquivo. Auditoria com `origem: 'TECLADO'`

**Checkpoint**: os cinco atalhos funcionam. `AppShell.tsx` não tem mais nenhum no-op.

---

## Phase 7: User Story 5 — Venda rápida em PDV de toque (Priority: P5)

**Goal**: F6–F9 acionam em qualquer plataforma; a faixa visual continua só no desktop.

**Independent Test**: simular ambiente sem apontador fino e verificar que as teclas acionam e que a faixa não é renderizada.

### Tests for User Story 5 ⚠️

- [ ] T030 ⚠️ [P] [US5] Ajustar `src/client/domain/vendaRapida/projetarAtalhos.test.ts`: remover os casos de plataforma e verificar que a projeção devolve os atalhos independentemente dela
- [ ] T031 ⚠️ [P] [US5] Escrever em `src/client/features/venda-rapida/DicaAtalhos.test.tsx` que a faixa **não** é renderizada no layout compacto e **é** no desktop (FR-012), e que a tecla aciona nos dois (FR-011)

### Implementation for User Story 5

- [ ] T032 [US5] Remover o parâmetro `plataforma` e o curto-circuito de `src/client/domain/vendaRapida/projetarAtalhos.ts` conforme §5 do contrato; demais etapas intactas (faz T030 passar)
- [ ] T033 [P] [US5] Remover `plataforma` de `src/client/domain/vendaRapida/tipos.ts`; se `PlataformaVendaRapida` ficar sem consumidor, removê-lo junto (depende de T032)
- [ ] T034 [P] [US5] Ajustar `src/client/features/venda-rapida/useAtalhosVendaRapida.ts` para não consultar `usePlataforma` (depende de T032)
- [ ] T035 [US5] Mover a condição de exibição para `src/client/features/venda-rapida/DicaAtalhos.tsx`, onde `useIsMobile` é observável (faz T031 passar; depende de T034)

**Checkpoint**: as cinco stories completas.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T036 Reescrever `FR-020`/`D11` em `specs/013-venda-rapida-cenario-pagamento/` **no ponto onde o leitor encontraria a informação desatualizada** — não anexar a correção ao final do parágrafo (regra do projeto para decisão superada, Constitution "Additional Constraints")
- [ ] T037 [P] Registrar o AD correspondente em `.specs/project/STATE.md`: a separação entre posse da tecla e disponibilidade da ação, o mapa fixo das cinco teclas, F11/F12 como incapturáveis, e a revogação parcial de FR-020/D11 da 013
- [ ] T038 [P] Registrar em `.specs/project/PENDENCIES.md` que F5 ficou com o navegador por decisão de 2026-09-15, com o trade-off (recarregar perde a venda; `beforeunload` é a única rede) — para a reavaliação não recomeçar do zero
- [ ] T039 Rodar os dez cenários de `quickstart.md`. **C1–C4 exigem pressionada real de teclado num Chrome comum** — tecla injetada por CDP não passa pelos aceleradores do navegador e daria falso verde
- [ ] T040 Rodar `npx tsc --noEmit` (gate obrigatório antes de qualquer push) e a suíte completa; antes de crer numa falha E2E, derrubar a porta 3100
- [ ] T041 Invocar `/owasp-security` antes do merge para `master` (gate da constitution)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (F1)**: sem dependências
- **Foundational (F2)**: depende de Setup — **bloqueia todas as user stories**
- **US1 (F3)**: depende de Foundational. É o MVP
- **US2 (F4), US3 (F5), US4 (F6)**: dependem de US1, porque cada uma **substitui um no-op** criado por T012 em `AppShell.tsx`. São sequenciais entre si **apenas por causa desse arquivo** — a lógica de cada uma é independente
- **US5 (F7)**: depende só de Foundational. **Pode rodar em paralelo com US2/US3/US4** — não toca `AppShell.tsx`
- **Polish (F8)**: depende das stories desejadas

### Within Each User Story

- Testes ⚠️ escritos e **falhando** antes da implementação
- Store e hooks antes dos componentes que os consomem
- T018 (investigação) antes de T019/T020 — é um portão, não uma formalidade

### Parallel Opportunities

- T002 em paralelo com T001 (arquivos distintos)
- T003, T004 em paralelo (testes de módulos distintos)
- T005, T006, T008 em paralelo; T007 espera T005 e T006
- Todos os testes ⚠️ de uma mesma story, entre si
- T019 e T020 em paralelo (componentes distintos), depois de T017 e T018
- **US5 inteira em paralelo com US2/US3/US4**, por não tocar `AppShell.tsx`
- T037 e T038 em paralelo (arquivos distintos)

---

## Parallel Example: Foundational

```bash
# Testes primeiro, em paralelo:
Task: "Escrever useTeclasFixas.test.tsx cobrindo os quatro estágios de posse"
Task: "Escrever janelasStore.test.ts cobrindo a invariante I3"

# Depois, implementações independentes em paralelo:
Task: "Criar janelasStore.ts"
Task: "Acrescentar haJanelaAberta() a useFocoDeModal.ts"
Task: "Acrescentar OrigemAcionamento a eventos.ts"

# Por último, o que depende das duas primeiras:
Task: "Acrescentar useTeclasFixas a mapaAtalhos.ts"
```

---

## Implementation Strategy

### MVP (US1 apenas)

1. Phase 1 → Phase 2 → Phase 3
2. **PARAR e VALIDAR**: cenários C1–C4 do quickstart, com teclado real
3. O MVP já tem valor de produção sozinho: corrige o vazamento do F3, que é defeito **existente** hoje — antes de qualquer atalho novo agir

### Entrega incremental

1. Setup + Foundational → maquinaria de posse pronta
2. US1 → validar → **entregável** (corrige o defeito atual)
3. US2 → validar → entregável (o ganho de velocidade mais frequente do caixa)
4. US3 → validar → entregável
5. US4 → validar → entregável (os cinco atalhos completos)
6. US5 → validar → entregável (pode sair antes das anteriores, se o parque de toque for prioridade)

### Estratégia com mais de um desenvolvedor

Depois de Foundational, **duas frentes**, não cinco:

- Frente A: US1 → US2 → US3 → US4 (todas tocam `AppShell.tsx`, sequenciais por conflito de arquivo)
- Frente B: US5 (independente)

---

## Notes

- `[P]` = arquivos distintos, sem dependência pendente
- Verificar que cada teste ⚠️ **falha** antes de implementar
- Commit ao fim de cada tarefa ou grupo lógico
- A tabela de arquivos multifase no topo é a regra que impede paralelizar `AppShell.tsx` — quatro fases o tocam
- Nenhuma tarefa escreve regra de negócio: FR-018 exige o mesmo ponto de entrada do clique, e a tabela de disponibilidade (`data-model.md` §5) diz de onde cada veredito vem

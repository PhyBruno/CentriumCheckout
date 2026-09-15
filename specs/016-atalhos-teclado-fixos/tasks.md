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

> **Nota de implementação (2026-09-15):** os testes desta feature ficam em `tests/unit/**` e `tests/integration/**` com sufixo `.spec.ts(x)`, e não ao lado do código com `.test.ts(x)` como as tarefas abaixo escrevem — é o único padrão que o `include` de `vitest.config.ts` executa. Um `*.test.tsx` em `src/` nunca rodaria.

- [X] T001 Criar `src/client/hotkeys/mapaFixo.ts` com `TeclaFixa`, `IdComando`, `ComandoFixo` e a constante `MAPA_FIXO` das cinco entradas, conforme `contracts/atalhos-fixos-api.md` §1 — sem F5, F11 e F12
- [X] T002 [P] Criar `tests/unit/client/hotkeys/mapaFixo.spec.ts` verificando a invariante I1: `MAPA_FIXO` e `TECLAS_ATALHO` (de `src/client/domain/vendaRapida/tipos.ts`) não têm tecla em comum, e `MAPA_FIXO` tem exatamente uma entrada por `TeclaFixa`

**Checkpoint**: o mapa existe e a disjunção é verificada por suíte, não por convenção.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: a maquinaria de posse. **Nenhuma user story pode começar antes desta fase.**

**⚠️ CRITICAL**: é aqui que FR-001/FR-002/FR-005 viram estrutura. Se esta fase sair errada, todas as stories herdam o vazamento.

- [X] T003 ⚠️ [P] Escrever `tests/unit/client/hotkeys/useTeclasFixas.spec.tsx` cobrindo os quatro estágios de posse do `data-model.md` §4: (a) a tecla é engolida com o foco fora de campo; (b) engolida com o foco em `input` comum; (c) engolida com tecla repetida (`repeat: true`), e a ação **não** roda; (d) deferida quando `defaultPrevented` já está marcado. Simular com `user-event`, nunca `keyDown` cru
- [X] T004 ⚠️ [P] Escrever `tests/unit/client/stores/janelasStore.spec.ts` cobrindo a invariante I3: `abrir` é inerte com outra janela já aberta, `substituir` troca sem passar por `'nenhuma'`, e nenhum estado representa duas janelas
- [X] T005 [P] Criar `src/client/stores/janelasStore.ts` conforme `contracts/atalhos-fixos-api.md` §3 — Zustand sem `persist` e sem Immer (o estado é um enum). Faz T004 passar
- [X] T006 [P] Acrescentar `haJanelaAberta()` a `src/client/lib/useFocoDeModal.ts`, consultando a `pilhaDeJanelas` que o módulo já mantém (research D3). **Não** usar `closest('[role="dialog"]')` — devolve `null` com o foco no `body`
- [X] T007 Acrescentar `useTeclasFixas` e `AcaoFixa` a `src/client/hotkeys/mapaAtalhos.ts` conforme §2 do contrato: `enabled` literal `true`, `preventDefault: true`, `useKey: true`, `enableOnFormTags: true`, `enableOnContentEditable: true`, `ignoreEventWhen` restrito a `defaultPrevented`; `repeat` e `haJanelaAberta()` suprimem a **ação**, nunca o `preventDefault`. Faz T003 passar. `useAtalhosDeTeclado` fica intacto (depende de T005, T006)
- [X] T008 [P] Acrescentar `OrigemAcionamento = 'CLIQUE' | 'TECLADO'` a `src/client/domain/auditoria/eventos.ts`, sem tocar em `TeclaVendaRapida` — são vocabulários distintos (research D12). **Desvio:** a origem viaja num evento próprio, `ATALHO_ACIONADO { comando, origem }`, e não costurada nos eventos de cada ação — três dos cinco comandos só abrem janela (gesto nunca auditado por clique) e o de suspensão atravessa uma confirmação assíncrona; costurar a origem por dentro mudaria os pontos de entrada que FR-018 proíbe alterar

**Checkpoint**: a posse existe e é testada isoladamente. As user stories podem começar.

---

## Phase 3: User Story 1 — Nenhuma tecla reservada escapa (Priority: P1) 🎯 MVP

**Goal**: as cinco teclas passam a pertencer ao Checkout em toda a tela de venda, em qualquer estado.

**Independent Test**: percorrer as cinco teclas nos estados problemáticos (carregando, sem cenário cadastrado, foco em campo, modal aberto, tecla segurada) e verificar que o navegador não reage. **Não exige nenhuma ação implementada** — por isso esta fase registra as cinco com `executar` no-op, e as stories seguintes substituem um no-op cada.

### Tests for User Story 1 ⚠️

- [X] T009 ⚠️ [P] [US1] Escrever `tests/integration/appShell.atalhos.spec.tsx`: com a tela de venda montada e a query do catálogo **pendente**, cada uma das cinco teclas é engolida (`preventDefault` chamado) — o cenário C1 do quickstart, que é o bug original
- [X] T010 ⚠️ [P] [US1] Acrescentar ao mesmo arquivo: as cinco teclas são engolidas com o foco no campo de quantidade e com uma janela aberta (cenários C2 e C3)
- [X] T011 ⚠️ [P] [US1] Acrescentar ao mesmo arquivo: nenhuma das teclas F5, F11 e F12 é registrada — `preventDefault` **não** é chamado para elas (FR-008)

### Implementation for User Story 1

- [X] T012 [US1] Chamar `useTeclasFixas` uma única vez em `src/client/layout/AppShell.tsx`, acima da bifurcação `useIsMobile()`, com as cinco ações: `indisponivel` já real onde a fonte existe, `executar` como no-op documentado com o número da tarefa que o substitui (faz T009–T011 passarem). **Nota:** o call site é o componente privado `TeclasFixasDaVenda`, no mesmo arquivo, renderizado **dentro** do `ProvedorFinalizacaoVenda` — o F10 precisa de `useFinalizacaoVenda`, e o provider é renderizado pelo próprio `AppShell`
- [X] T013 [US1] Verificar em `src/client/layout/AppShell.tsx` que o registro não consulta query, `sessionStore`, cadastro nem plataforma — FR-002 é sobre ausência de dependência, e é o que um teste não pega sozinho

**Checkpoint**: US1 completa. A classe de falha em que um bipe desaparece dentro do navegador deixou de existir, mesmo sem nenhum atalho ainda agir.

---

## Phase 4: User Story 2 — Cliente e produto sem tirar a mão do teclado (Priority: P2)

**Goal**: F3 e F4 abrem os modais de cliente e de produto com o campo de busca já focado.

**Independent Test**: abrir os dois modais só por tecla, digitar e concluir sem nenhum evento de mouse.

### Tests for User Story 2 ⚠️

- [X] T014 ⚠️ [P] [US2] Escrever em `tests/unit/client/lib/useFocoDeModal.spec.tsx` o caso do foco inicial. **Premissa corrigida na implementação:** os modais **desmontam** ao fechar (`usePresenca`) e o `autoFocus` da busca funcionava em toda abertura sobre tela já montada — o `inert` não era o problema. A falha real é a janela nascer **no mesmo commit** que outro campo com `autoFocus` montado depois dela (F3 no wizard mobile, que monta a etapa 1 junto com o modal); o teste reproduz esse "ladrão" de foco
- [X] T015 ⚠️ [P] [US2] Escrever os dois casos obrigatórios de F3 e de F4 (quatro no total) em `tests/integration/appShell.atalhos.spec.tsx`: (a) aciona com o foco fora de campo; (b) não vaza para o navegador durante digitação no campo de bipagem. Acrescentados: modal aberto não abre o segundo (US2-4) e F3 fora da etapa 1 do wizard mobile
- [X] T016 ⚠️ [P] [US2] Escrever em `tests/unit/client/cliente/CampoClienteVenda.spec.tsx` e `tests/unit/client/carrinho/EntradaRapidaProduto.spec.tsx` que a abertura por clique continua funcionando e que o campo de busca fica focado nos dois caminhos (FR-021)

### Implementation for User Story 2

- [X] T017 [US2] Acrescentar `focoInicial` a `src/client/lib/useFocoDeModal.ts` conforme §4 do contrato, aplicado em efeito passivo depois do commit em que o elemento existe (faz T014 passar). Os quatro modais (`ModalBuscaCliente`, `ModalBuscaProduto`, `ModalImportacaoDav`, `ModalRecuperacaoNFCe`) trocaram `autoFocus` por `focoInicial`; e o efeito de "foco de volta ao código" de `EntradaRapidaProduto` passou a respeitar `haJanelaAberta()`, senão roubaria a busca na montagem da etapa 1
- [X] T018 [US2] **Investigar antes de alterar** (risco 1 do plano, research D8): em `src/client/features/carrinho/EntradaRapidaProduto.tsx` e `src/client/features/cliente/CampoClienteVenda.tsx`, confirmar que nenhum parâmetro de abertura (termo pré-preenchido, item em edição) está acoplado ao booleano de abertura. **Achado:** nenhum. `ModalBuscaCliente` e `ModalBuscaProduto` recebem só `aberto`/`onFechar`/callbacks de seleção; o `cpfSugerido` pertence ao `FormCadastroSimplificado` (outro modal, fica local) e o item em edição vive no `edicaoItemStore`. **Achado paralelo, não previsto pelo plano:** no wizard mobile os dois componentes só existem na etapa 1 e `BotaoMenuImportacao` não existe em etapa nenhuma (FR-008 da 007) — resolvido por decisão do usuário (2026-09-15): F3/F4 levam à etapa 1 e abrem lá; F1/F2 recusam com explicação no compacto
- [X] T019 [P] [US2] Migrar a abertura de `ModalBuscaCliente` em `src/client/features/cliente/CampoClienteVenda.tsx` para `janelasStore` (`'cliente'`), mantendo local qualquer parâmetro de abertura, e declarar o campo de busca como `focoInicial` (depende de T017, T018)
- [X] T020 [P] [US2] Migrar a abertura de `ModalBuscaProduto` em `src/client/features/carrinho/EntradaRapidaProduto.tsx` para `janelasStore` (`'produto'`), mesmas condições (depende de T017, T018)
- [X] T021 [US2] Substituir em `src/client/layout/AppShell.tsx` os no-ops de `IDENTIFICAR_CLIENTE` e `IDENTIFICAR_PRODUTO` pelo `abrir()` do store, registrando auditoria com `origem: 'TECLADO'` (faz T015 passar; depende de T019, T020). Acrescentado em `src/client/layout/mobile/MobileWizard.tsx`: pedido de janela `'cliente'`/`'produto'` fora da etapa 1 leva à etapa 1

**Checkpoint**: US1 e US2 funcionam de forma independente.

---

## Phase 5: User Story 3 — Importar DAV e NFCe por tecla (Priority: P3)

**Goal**: F1 e F2 abrem as janelas de importação direto, com recusa explicada em venda em andamento.

**Independent Test**: acionar F1/F2 em venda vazia (abre) e em venda com item ou cliente identificado (recusa com motivo em texto).

### Tests for User Story 3 ⚠️

- [X] T022 ⚠️ [P] [US3] Escrever os dois casos obrigatórios de F1 e de F2 em `tests/integration/appShell.atalhos.spec.tsx`, mais a recusa: com item lançado, a janela não abre e a mensagem de recusa é a mesma do botão bloqueado (cenário C7)
- [X] T023 ⚠️ [P] [US3] Escrever o caso do cliente padrão em `tests/integration/appShell.atalhos.spec.tsx`: com apenas o cliente padrão aplicado, F1 **abre** — cliente padrão não é venda em andamento (cenário C8, regra AD-138). Acrescentado: no layout compacto F1/F2 recusam com `MOTIVO_IMPORTACAO_NO_COMPACTO` (decisão do usuário, 2026-09-15)
- [X] T024 ⚠️ [P] [US3] Escrever em `tests/unit/client/importacao/BotaoMenuImportacao.spec.tsx` que o caminho por clique continua passando pelo seletor, inalterado

### Implementation for User Story 3

- [X] T025 [US3] Migrar o `JanelaAberta` local de `src/client/features/importacao/BotaoMenuImportacao.tsx` para `janelasStore`, usando `substituir()` na escolha do seletor para não empilhar janelas (faz T024 passar)
- [X] T026 [US3] Substituir em `src/client/layout/AppShell.tsx` os no-ops de `IMPORTAR_DAV` e `IMPORTAR_NFCE`: `indisponivel` recusa no layout compacto (a importação não existe ali, FR-008 da 007) e, fora dele, chama `recusaAtual()` de `useRecusaDeImportacao` e devolve `mensagemDeRecusa(motivo)`; `executar` abre `'dav'`/`'nfce'` direto, pulando o seletor (research D6, D7). Auditoria com `origem: 'TECLADO'` (faz T022, T023 passarem; depende de T025)

**Checkpoint**: US1, US2 e US3 funcionam de forma independente.

---

## Phase 6: User Story 4 — Suspender a venda por tecla (Priority: P4)

**Goal**: F10 suspende a venda, com a mesma confirmação e as mesmas recusas do caminho por clique.

**Independent Test**: acionar F10 em venda com conteúdo e verificar que o desfecho é idêntico ao do botão, e que a venda é retomável.

### Tests for User Story 4 ⚠️

- [X] T027 ⚠️ [P] [US4] Escrever os dois casos obrigatórios de F10 em `tests/integration/appShell.atalhos.spec.tsx`, mais: em venda vazia a recusa é explicada e a tecla não vaza (cenário C9); e o segundo F10 durante o envio recusa com "Aguarde" em vez de ficar mudo ou reenviar
- [X] T028 ⚠️ [P] [US4] Escrever que F10 resolve para **suspensão** e que o descarte da venda não é oferecido em nenhum momento (FR-017, cenário US4-6 da spec)

### Implementation for User Story 4

- [X] T029 [US4] Substituir em `src/client/layout/AppShell.tsx` o no-op de `SUSPENDER_VENDA` por `useFinalizacaoVenda().suspender`, com `indisponivel` vindo de `motivoDeBloqueioDoCancelar` — os mesmos de `AcaoCancelarVenda` (research D9). O `ProvedorFinalizacaoVenda` já está montado neste arquivo. Auditoria com `origem: 'TECLADO'`. `motivoDeBloqueioDoCancelar` passou a ser exportada de `AcoesFinaisVenda.tsx`. O caso "nenhuma tecla global move a venda no mobile" de `tests/integration/appShell.spec.tsx` perdeu F1–F4/F10 da varredura — afirmava o FR-005 da 007 que FR-010 da 016 revoga para essas teclas

**Checkpoint**: os cinco atalhos funcionam. `AppShell.tsx` não tem mais nenhum no-op.

---

## Phase 7: User Story 5 — Venda rápida em PDV de toque (Priority: P5)

**Goal**: F6–F9 acionam em qualquer plataforma; a faixa visual continua só no desktop.

**Independent Test**: simular ambiente sem apontador fino e verificar que as teclas acionam e que a faixa não é renderizada.

### Tests for User Story 5 ⚠️

- [X] T030 ⚠️ [P] [US5] Ajustar `tests/unit/domain/vendaRapida/projetarAtalhos.spec.ts`: remover os casos de plataforma e verificar que a projeção devolve os atalhos independentemente dela
- [X] T031 ⚠️ [P] [US5] Escrever que a faixa **não** é renderizada no layout compacto e **é** no desktop (FR-012), e que a tecla aciona nos dois (FR-011). **Desvio de local:** a ligação tecla↔plataforma só é observável com o `AppShell` montado, e foi para `tests/integration/vendaRapidaPlataforma.spec.tsx`; `tests/unit/client/venda-rapida/DicaAtalhos.spec.tsx` ganhou o caso de dono único (a faixa sozinha não escuta tecla) e as regras de digitação passaram a exercitar `TeclasDosAtalhos`. O caso "as teclas de venda rápida não disparam nada no mobile" de `appShell.spec.tsx` foi removido — afirmava o comportamento que FR-011 revoga

### Implementation for User Story 5

- [X] T032 [US5] Remover o parâmetro `plataforma` e o curto-circuito de `src/client/domain/vendaRapida/projetarAtalhos.ts` conforme §5 do contrato; demais etapas intactas (faz T030 passar)
- [X] T033 [P] [US5] Remover `plataforma` de `src/client/domain/vendaRapida/tipos.ts`; se `PlataformaVendaRapida` ficar sem consumidor, removê-lo junto (depende de T032). Removidos `PlataformaVendaRapida` e `usePlataforma` (`src/client/layout/usePlataforma.ts`), ambos sem consumidor; saiu também a exceção de `useAtalhosVendaRapida.ts` em `tests/integration/semDuplicacaoRegra.spec.ts`
- [X] T034 [P] [US5] Ajustar `src/client/features/venda-rapida/useAtalhosVendaRapida.ts` para não consultar `usePlataforma` (depende de T032)
- [X] T035 [US5] ~~Mover a condição de exibição para `DicaAtalhos.tsx`, onde `useIsMobile` é observável~~. **Desvio (premissa do plano não se sustentava):** a faixa já só existe no desktop **por montagem** (`PainelPagamentoETotais` só é montado por `DesktopLayout`), e era ela quem **registrava** F6–F9 — por isso a tecla não chegava ao mobile de jeito nenhum. Levar `useIsMobile` para `features/` também violaria `semDuplicacaoRegra.spec.ts` (só `layout/` lê o breakpoint). O registro saiu da faixa para `src/client/features/venda-rapida/TeclasVendaRapida.tsx`, montado em `AppShell` acima da bifurcação; `DicaAtalhos` virou só apresentação. **Achado colateral corrigido:** com as janelas no store, cruzar o breakpoint com uma janela aberta a levaria para a outra árvore (a de DAV nem existe no compacto e travaria F3/F4 ali) — `AppShell` agora fecha a janela na travessia, antes de montar a árvore nova

**Checkpoint**: as cinco stories completas.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T036 Reescrever `FR-020`/`D11` em `specs/013-venda-rapida-cenario-pagamento/` **no ponto onde o leitor encontraria a informação desatualizada** — não anexar a correção ao final do parágrafo (regra do projeto para decisão superada, Constitution "Additional Constraints"). Reescritos também o edge case, a dependência e a tabela de decisões da `spec.md`, E6/I10 do `data-model.md` e — por citar a mesma informação — `FR-005` de `specs/007-layout-responsivo-mobile/spec.md`
- [X] T037 [P] Registrar o AD correspondente em `.specs/project/STATE.md`: a separação entre posse da tecla e disponibilidade da ação, o mapa fixo das cinco teclas, F11/F12 como incapturáveis, e a revogação parcial de FR-020/D11 da 013 — **AD-227**, com as duas decisões do usuário e as três premissas do `research.md` que não se sustentaram
- [X] T038 [P] Registrar em `.specs/project/PENDENCIES.md` que F5 ficou com o navegador por decisão de 2026-09-15, com o trade-off (recarregar perde a venda; `beforeunload` é a única rede) — para a reavaliação não recomeçar do zero — **item 54**; aberto também o **item 55** (F6–F9 no wizard mobile não navegam à etapa 2)
- [ ] T039 Rodar os dez cenários de `quickstart.md`. **C1–C4 exigem pressionada real de teclado num Chrome comum** — tecla injetada por CDP não passa pelos aceleradores do navegador e daria falso verde. **Pendente (2026-09-15):** não executável pela IA — sem teclado físico. C5–C10 estão cobertos por teste de componente/integração (`appShell.atalhos.spec.tsx`, `vendaRapidaPlataforma.spec.tsx`), mas a conferência visual e a de C1–C4 ficam para o operador
- [X] T040 Rodar `npx tsc --noEmit` (gate obrigatório antes de qualquer push) e a suíte completa; antes de crer numa falha E2E, derrubar a porta 3100. **Resultado (2026-09-15):** `tsc` e ESLint limpos, Prettier limpo em `src`/`tests`; Vitest 1476 testes em 101 arquivos; Playwright 183 passaram e 1 pulado (porta 3100 conferida livre antes)
- [ ] T041 Invocar `/owasp-security` antes do merge para `master` (gate da constitution). **Pendente:** gate de merge — esta tarefa não faz merge

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

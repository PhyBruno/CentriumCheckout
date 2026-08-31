---

description: "Task list template for feature implementation"
---

# Tasks: Layout Responsivo (Desktop/Mobile)

**Input**: Design documents from `specs/007-layout-responsivo-mobile/` (`plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/layout-domain-api.md`, `quickstart.md`)

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: Incluídos — `plan.md` § Testing define 3 camadas explícitas (domínio puro, integração, E2E) com arquivos-alvo nomeados.

**Organization**: Tarefas agrupadas pelas 3 user stories da spec — US1 (P2, alternância automática de layout), US2 (P2, navegação em etapas no mobile) e US3 (P3, leitura de código de barras pela câmera).

**⚠️ Ordem de implementação e dependências cruzadas**: esta feature é **presentation-only** (Constitution III) e não duplica nenhuma regra de negócio — compõe componentes já existentes das features **003** (`GridItens.tsx`/`ListaItensMobile.tsx`/`EntradaRapidaProduto.tsx`, já implementada), **005** (`ModalBuscaCliente.tsx`/`CampoClienteVenda.tsx`, já implementada), **004** (`BotaoFinalizarVenda.tsx`/`BotaoCancelarVenda.tsx`, já implementada — os dois componentes **já preveem** um equivalente mobile, AD-089) e **006** (`ModalImportacaoDav.tsx`, já implementada, exclusiva do desktop, `FR-008`). Duas dependências ainda não chegaram a `tasks.md`: **012** (seleção de vendedor — `CampoVendedorVenda.tsx` já nomeado em `plan.md`, mas não implementado) e **008** (pagamento — só tem `plan.md`, nenhum componente de UI nomeado ainda). Ambas entram por composição de ponto reservado (não por stub de função, como em outras features): `EtapaClienteProdutos.tsx`/`EtapaPagamento.tsx`/`DesktopLayout.tsx` reservam o ponto de montagem exato e documentam o nome esperado, sem bloquear esta feature. **Feature 011** (recuperação de NFCe) nem sequer tem `spec.md` ainda — idem, ponto reservado em `DesktopLayout.tsx`. O "menu gerencial" citado no contrato não corresponde a nenhuma feature numerada até o momento — ponto reservado sem referência cruzada.

**⚠️ `DesktopLayout.tsx` é criado por esta feature (T008)**: `plan.md` (§ Project Structure) já listava `desktop/DesktopLayout.tsx` na árvore da 007, mas a primeira geração deste `tasks.md` (2026-08-31) deixou de agendar a tarefa que efetivamente o cria — `AppShell` (T009) ficaria importando um arquivo inexistente. Corrigido em `/speckit-analyze` (achado I1, 2026-08-31): T008 extrai para `DesktopLayout.tsx` a composição que hoje vive inline em `src/client/App.tsx` (feature 002, T027 — branch "pronto" do `sessionStore").

**⚠️ AD-116 (achado da fase de tasks, 2026-08-31)**: `specs/008-pagamento-geral/contracts/pagamento-domain-api.md` §2 já declara que a feature 007 fornece `plataforma` dentro de `capacidades(): CapacidadesPagamento` — uma dependência injetada no `pagamentoSlice`, chamada como **função plana fora de React**. O contrato desta feature (`contracts/layout-domain-api.md`) só expunha `useIsMobile()`, um **hook React** — inutilizável nesse ponto de composição. Resolvido nesta fase acrescentando `obterPlataforma()` (T004), uma função sem estado que reaproveita `classificarLayout` lendo `window.innerWidth` diretamente, sem duplicar o limiar de 768px nem introduzir uma store nova. Ver `.specs/project/STATE.md`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência de tarefas incompletas)
- **[Story]**: A qual user story a tarefa pertence (US1, US2, US3)
- Caminhos de arquivo exatos em cada descrição

## Path Conventions

Sétima feature a estender a árvore da feature 002, primeira a introduzir a raiz de composição de UI (`plan.md` § Structure Decision):

```text
src/client/domain/layout/          # classificarLayout.ts, suportaScannerCamera.ts — puro
src/client/layout/                 # useIsMobile.ts, obterPlataforma.ts, AppShell.tsx
src/client/layout/desktop/         # DesktopLayout.tsx — criado por esta feature (T008), extraído de App.tsx (002)
src/client/layout/mobile/          # MobileWizard.tsx, EtapaClienteProdutos.tsx, EtapaPagamento.tsx, EtapaRevisao.tsx, ScannerCamera.tsx
tests/unit/domain/layout/ | tests/integration/ | tests/e2e/
```

---

## Phase 1: Setup

**Purpose**: Criar os diretórios específicos desta feature.

- [ ] T001 Criar estrutura de diretórios: `src/client/domain/layout/`, `src/client/layout/`, `src/client/layout/desktop/`, `src/client/layout/mobile/`, `tests/unit/domain/layout/` (`tests/integration/` e `tests/e2e/` já existem, criados por features anteriores)

**Checkpoint**: Diretórios prontos.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Mecanismo de classificação de layout e o ponto único de composição (`AppShell`), incluindo as duas árvores que ele decide entre — usados pelas 3 user stories.

**⚠️ CRITICAL**: Nenhuma user story pode começar até esta fase terminar.

- [ ] T002 [P] Implementar `src/client/domain/layout/classificarLayout.ts`: `classificarLayout(larguraViewportPx: number): 'DESKTOP' | 'MOBILE'` — `< 768` → `'MOBILE'`; `>= 768` → `'DESKTOP'` (`data-model.md` §1, I1/I2) — pura, sem `window`/React
- [ ] T003 [P] Unit test `tests/unit/domain/layout/classificarLayout.spec.ts`: casos de borda `767`/`768`/`767.98` e valores extremos (`0`, largura muito grande) — depende de T002
- [ ] T004 [P] Implementar `src/client/layout/obterPlataforma.ts` (AD-116): `obterPlataforma(): 'DESKTOP' | 'MOBILE'` — função plana, sem estado, `() => classificarLayout(window.innerWidth)`; ponto de leitura síncrona fora de React, reservado para a futura `capacidades().plataforma` da feature 008 (`pagamento-domain-api.md` §2) — depende de T002
- [ ] T005 [P] Unit test `tests/unit/domain/layout/obterPlataforma.spec.ts`: mocka `window.innerWidth` em `767`/`768`, confirma que o resultado é idêntico ao de `classificarLayout` para o mesmo valor — depende de T004
- [ ] T006 Implementar `src/client/layout/useIsMobile.ts`: `useIsMobile(): boolean` — conecta `classificarLayout` (T002) a `window.matchMedia('(max-width: 767.98px)')` com listener (`addEventListener('change', ...)`, `research.md` D1), reativo a mudança de viewport, sem parâmetros — depende de T002
- [ ] T007 [P] Implementar `src/client/layout/mobile/MobileWizard.tsx` (placeholder mínimo): monta sem alterar nenhum slice do `vendaStore`, renderiza um contêiner vazio identificável (para prova de troca de árvore em US1); estado completo do wizard (etapaAtual/etapasVisitadas) é adicionado em T014 (US2) — sem dependências
- [ ] T008 [P] Implementar `src/client/layout/desktop/DesktopLayout.tsx`: **extrai** para este componente a composição que hoje vive inline em `src/client/App.tsx` (feature 002, T027 — branch "pronto" do `sessionStore`); compõe, sem alterar: `GridItens.tsx`/`EntradaRapidaProduto.tsx` (003), `ModalBuscaCliente.tsx`/`CampoClienteVenda.tsx` (005), `BotaoFinalizarVenda.tsx`/`BotaoCancelarVenda.tsx` (004), `ModalImportacaoDav.tsx` (006); reserva o ponto de montagem (documentado, sem bloquear) para `CampoVendedorVenda.tsx` (012, sem `tasks.md`), o painel de pagamento (008, sem `tasks.md`), a recuperação de NFCe (011, sem `spec.md`) e o "menu gerencial" (sem feature numerada) — nenhuma lógica de domínio própria, só composição — sem dependências desta feature
- [ ] T009 Implementar `src/client/layout/AppShell.tsx`: único componente que chama `useIsMobile()` (T006); renderiza `DesktopLayout` (T008) quando `false`, `MobileWizard` (T007) quando `true` — depende de T006, T007, T008

**Checkpoint**: Mecanismo de troca de layout pronto, com as duas árvores existindo (mobile ainda como placeholder) — nenhuma user story ainda está montada na raiz do app.

---

## Phase 3: User Story 1 - Alternância automática de layout por tamanho de tela (Priority: P2) 🎯 MVP

**Goal**: A interface troca automaticamente entre tela única (desktop) e apresentação em etapas (mobile) conforme o tamanho da tela, sem perder nem duplicar o estado da venda.

**Independent Test**: Redimensionar a tela através do limiar de troca e confirmar que o estado da venda em andamento não se perde nem duplica (`quickstart.md` §2).

### Implementation for User Story 1

- [ ] T010 [US1] Em `src/client/App.tsx` (002, T027), trocar o branch "pronto" do `sessionStore` — que hoje renderiza inline a composição já extraída em T008 — para renderizar `<AppShell />` em seu lugar — depende de T009

### Tests for User Story 1

- [ ] T011 [P] [US1] Integration test `tests/integration/appShell.spec.ts`: alterna `matchMedia` mockado `true`↔`false` com um `vendaStore` populado (carrinho/cliente/vendedor); confirma que o estado é idêntico antes/depois da troca (`FR-002`, `SC-003`) — depende de T010
- [ ] T012 [P] [US1] Integration test `tests/integration/appShell.spec.ts`: com `matchMedia` mockado para mobile, nenhum `useHotkeys`/`HotkeysProvider` de escopo `venda-navegacao`/`venda-acao` é registrado na árvore montada (`FR-005`) — depende de T010
- [ ] T013 [US1] E2E `tests/e2e/layout-desktop.spec.ts` (fluxo dourado desktop, viewport larga) e `tests/e2e/layout-responsivo.spec.ts` (`quickstart.md` §2: redimensionar com carrinho populado, cliente e vendedor selecionados, cruzando o breakpoint de ida e volta, confirmando total idêntico) — depende de T010

**Checkpoint**: User Story 1 completa e testável de forma independente — `FR-001`, `FR-002`, `FR-005` (ausência de hotkeys confirmada), `SC-003`.

---

## Phase 4: User Story 2 - Navegação em etapas no mobile (Priority: P2)

**Goal**: No layout mobile, o operador navega por 3 etapas sequenciais (cliente/produtos → pagamento → revisão) e pode voltar livremente a qualquer etapa já visitada.

**Independent Test**: Avançar até a última etapa, voltar à primeira, alterar um dado e confirmar que o estado permanece consistente ao avançar de novo (`quickstart.md` §3).

### Implementation for User Story 2

- [ ] T014 [US2] Substituir o placeholder de `MobileWizard.tsx` (T007) pelo `WizardState` completo (`data-model.md` §2): `useState` local com `etapaAtual: 1 | 2 | 3` (inicia sempre em `1`, I1) e `etapasVisitadas: ReadonlySet<1|2|3>` (só cresce, I2); função de navegação que permite ir a qualquer etapa em `etapasVisitadas` a qualquer momento antes da finalização (I3, `FR-004`), sem validar campo obrigatório; nunca lê/escreve `vendaStore` (I4/I5) — depende de T007
- [ ] T015 [P] [US2] Implementar `src/client/layout/mobile/EtapaClienteProdutos.tsx`: compõe `CampoClienteVenda.tsx`/`ModalBuscaCliente.tsx` (005, já implementada), `EntradaRapidaProduto.tsx` e `ListaItensMobile.tsx` (003, já implementada — variante mobile já existe no grid de itens) e o ponto de montagem de `CampoVendedorVenda.tsx` (012, nomeado em `specs/012-selecao-vendedor/plan.md`, ainda sem `tasks.md` — reservado, não bloqueia) — nenhuma lógica de domínio própria — depende de T014
- [ ] T016 [P] [US2] Implementar `src/client/layout/mobile/EtapaPagamento.tsx`: reserva o ponto de montagem do painel de pagamento que a feature 008 vai expor (`pagamento-domain-api.md`, ainda sem `tasks.md`/componente nomeado) — **exclui explicitamente** qualquer componente de TEF (`FR-009`, AD-074; a regra de roteamento pertence a 008, este componente só garante que nada de TEF é importado aqui) — depende de T014
- [ ] T017 [P] [US2] Implementar `src/client/layout/mobile/EtapaRevisao.tsx`: compõe revisão final + `BotaoFinalizarVenda.tsx`/`BotaoCancelarVenda.tsx` (004, já implementada — ambos já preveem equivalente mobile, AD-089) — depende de T014

### Tests for User Story 2

- [ ] T018 [P] [US2] Integration test `tests/integration/mobileWizard.spec.ts`: navegar da etapa 1 até a 3, voltar à 1, alterar um dado, avançar novamente — confirma que a alteração aparece corretamente na revisão (`quickstart.md` §3) — depende de T015, T016, T017
- [ ] T019 [P] [US2] Integration test `tests/integration/pagamentoMobile.spec.ts`: `EtapaPagamento.tsx` nunca importa (estático, via análise do módulo compilado ou grep de imports do arquivo) nenhum componente/serviço de TEF (feature 010) — cobre `FR-009` com verificação automatizada, não só a exclusão declarada em T016 — depende de T016
- [ ] T020 [US2] E2E `tests/e2e/layout-mobile.spec.ts`: fluxo dourado mobile (login → etapa 1 → 2 → 3 → finalizar) — depende de T015, T016, T017

**Checkpoint**: User Stories 1 e 2 completas — `FR-003`, `FR-004`, `FR-009` (com verificação automatizada), `SC-002`.

---

## Phase 5: User Story 3 - Leitura de código de barras pela câmera (Priority: P3)

**Goal**: No mobile, em navegador/dispositivo com suporte, o operador ativa a câmera para ler um código de barras, que entra pelo mesmo caminho de leitor físico/digitação.

**Independent Test**: Ativar a leitura por câmera, apontar para um código de barras válido e confirmar que o produto correspondente é inserido na venda (`quickstart.md` §5).

### Implementation for User Story 3

- [ ] T021 [P] [US3] Implementar `src/client/domain/layout/suportaScannerCamera.ts`: `suportaScannerCamera(userAgent: string, hasBarcodeDetector: boolean): boolean` — `true` somente com `hasBarcodeDetector` **e** UA Chrome em Android, excluindo Edge/Opera/Samsung Internet (`data-model.md` §3, AD-086/AD-090) — pura
- [ ] T022 [P] [US3] Unit test `tests/unit/domain/layout/suportaScannerCamera.spec.ts`: Chrome/Android → `true`; Chrome desktop, Safari/iOS, Chrome-em-iOS (motor WebKit), UA Chrome/Android sem `BarcodeDetector` → `false` — depende de T021
- [ ] T023 [US3] Implementar `src/client/layout/mobile/ScannerCamera.tsx`: retorna `null` (nada, nem versão desabilitada) quando `suportaScannerCamera(navigator.userAgent, 'BarcodeDetector' in window)` (T021) é `false`; caso contrário, botão "Scanner" que solicita permissão de câmera e roda `BarcodeDetector.detect()` via `requestAnimationFrame` (sem Web Worker, AD-086); ao decodificar, chama `onCodigoLido(codigo: string)` — nunca chama `carrinhoSlice` diretamente (`contracts/layout-domain-api.md` §3) — depende de T021
- [ ] T024 [US3] Wire `ScannerCamera` (T023) em `EtapaClienteProdutos.tsx` (T015): `onCodigoLido` repassa `{ tipo: 'SIMPLES', codigo }` para o mesmo `EntradaCodigo` já usado por leitor físico/digitação (`specs/003-carrinho-produto-precificacao/data-model.md` §7 → `carrinhoSlice.inserirItem`), nunca um caminho de inserção próprio (`FR-007`, D5) — depende de T015, T023

### Tests for User Story 3

- [ ] T025 [P] [US3] Integration test `tests/integration/scannerCamera.spec.ts`: um código decodificado pela câmera resulta exatamente no mesmo item/preço que a mesma string via `EntradaRapidaProduto.tsx` (003) — mesmo call site, sem estrutura de dado paralela — depende de T024
- [ ] T026 [US3] E2E `tests/e2e/layout-scanner.spec.ts` (`quickstart.md` §5): em Chrome/Android, botão aparece, permissão de câmera solicitada, leitura insere o produto; fora de Chrome/Android (ex. Safari/iOS, Chrome desktop), o botão não aparece — sem mensagem (`FR-011`) — depende de T024

**Checkpoint**: Todas as user stories completas de forma independente — `FR-006`, `FR-007`, `FR-011`, `SC-001`.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verificações estruturais que abrangem a árvore mobile inteira (só fazem sentido com as 3 user stories completas) e gates finais.

- [ ] T027 Integration test `tests/integration/ausenciaEstrutural.spec.ts`: nenhum arquivo de `src/client/layout/mobile/` importa `ModalImportacaoDav.tsx` (006), qualquer componente de recuperação de NFCe (011) ou qualquer tela de gestão/retaguarda — verificação automatizada (análise estática de imports do diretório) de `FR-008`/`FR-010`, substituindo a checagem puramente manual da primeira geração deste `tasks.md` — depende de T015, T016, T017
- [ ] T028 Integration test `tests/integration/semDuplicacaoRegra.spec.ts`: nenhum arquivo de `src/client/layout/` (incluindo `desktop/` e `mobile/`) importa `carrinhoSlice`/`clienteSlice`/`vendedorSlice`/`pagamentoSlice` diretamente — toda mutação de domínio passa pelos componentes de feature já existentes (003/004/005/008/012), nunca por um caminho próprio de `layout/` — cobre `SC-001` com verificação automatizada — depende de T008, T015, T016, T017
- [ ] T029 Rodar `npx tsc --noEmit` e confirmar zero erros de tipo — gate obrigatório da Constitution (`Development Workflow`)
- [ ] T030 Rodar os 6 cenários de `quickstart.md` (alternância, navegação, hotkeys, scanner) como camada final de validação manual, complementar a T027/T028 — confirmar `SC-001` a `SC-003`
- [ ] T031 Registrar como pendência de integração ponta a ponta (não bloqueia o fechamento desta feature): `EtapaPagamento.tsx`/`DesktopLayout.tsx` (T016/T008) compõem apenas o ponto de montagem reservado até a feature 008 nomear seu componente real de UI; `CampoVendedorVenda.tsx` (T015/T008) idem até a feature 012 gerar `tasks.md`; a recuperação de NFCe (011, T008) idem até essa feature sequer ter `spec.md`; `obterPlataforma()` (T004, AD-116) só é efetivamente consumida quando a feature 008 implementar `capacidades()` no `pagamentoSlice`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Sem dependências — pode começar imediatamente
- **Foundational (Phase 2)**: Depende do Setup — BLOQUEIA as 3 user stories
- **User Stories (Phase 3-5)**: Todas dependem do Foundational
  - US1 pode começar assim que a Fase 2 terminar — MVP standalone
  - US2 depende de T007 (Foundational, placeholder de `MobileWizard`) e pode rodar em paralelo a US1 (arquivos distintos: US1 mexe em `App.tsx`/ponto de montagem raiz, US2 mexe em `MobileWizard`/etapas)
  - US3 depende de T015 (US2, `EtapaClienteProdutos.tsx`) para o wiring final (T024) — a implementação pura (T021-T023) pode começar em paralelo a US1/US2
- **Polish (Phase 6)**: T027/T028 dependem das 3 user stories completas (precisam da árvore mobile/desktop inteira montada); T029/T030/T031 dependem de T027/T028

### User Story Dependencies

- **US1 (P2)**: Depende de Foundational (T006, T008, T009); MVP standalone
- **US2 (P2)**: Depende de Foundational (T007); testável isoladamente, mesmo sem US1 estar montado na raiz do app (basta montar `MobileWizard` isolado no teste)
- **US3 (P3)**: Depende de Foundational para a parte pura (T021-T023); depende de US2 (T015) só para o wiring final (T024)

### Within Each User Story

- Domínio puro antes de hook/componente que o consome
- `MobileWizard.tsx` é editado sequencialmente entre T007 (placeholder) → T014 (estado completo)
- `App.tsx` (002) é editado sequencialmente entre T008 (extrai `DesktopLayout.tsx`) → T010 (troca pelo `AppShell`)
- Testes de integração podem ser escritos em paralelo entre si, cada um dependendo só da tarefa de implementação que cobre

### Parallel Opportunities

- T002, T004, T007, T008 (Foundational) começam em paralelo (arquivos diferentes; T004 só depende de T002 já existir como módulo)
- T015, T016, T017 (US2) em paralelo entre si (arquivos diferentes)
- T018, T019 (testes US2) podem ser escritos assim que T015-T017 existirem
- T021, T022 (US3) em paralelo com qualquer tarefa de US1/US2 — sem dependência de Foundational além dos diretórios

---

## Parallel Example: Foundational

```bash
# T002 (classificarLayout) não depende de nada; T008 (DesktopLayout) também não:
Task: "Implementar classificarLayout.ts em src/client/domain/layout/classificarLayout.ts"
Task: "Implementar DesktopLayout.tsx em src/client/layout/desktop/DesktopLayout.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Completar Phase 1: Setup
2. Completar Phase 2: Foundational (bloqueia tudo — inclui criar `DesktopLayout.tsx`)
3. Completar Phase 3: User Story 1
4. **PARAR e VALIDAR**: alternância de layout preservando o estado da venda, isoladamente
5. Nesse ponto o operador já vê a interface trocar de formato automaticamente, mas o mobile ainda é um placeholder vazio — US2 preenche o conteúdo

### Incremental Delivery

1. Setup + Foundational → mecanismo de troca pronto, com as duas árvores (desktop real, mobile placeholder)
2. US1 → validar isoladamente (alternância sem perda de estado) — MVP
3. US2 → validar isoladamente (navegação em etapas) + em conjunto com US1 (mobile completo)
4. US3 → validar isoladamente (scanner) — conveniência, não bloqueia as duas anteriores
5. Polish → verificações estruturais automatizadas (T027/T028) e gates finais

### Parallel Team Strategy

Com mais de um desenvolvedor: completar Setup + Foundational juntos (um extrai `DesktopLayout.tsx` de `App.tsx` enquanto outro monta `AppShell`/`useIsMobile`); depois um desenvolvedor segue com US1 (montagem na raiz + testes de preservação de estado), outro com US2 (as 3 etapas do wizard), um terceiro adianta a parte pura de US3 (T021-T023), sincronizando em T015 (`EtapaClienteProdutos.tsx`) para o wiring final do scanner (T024).

---

## Notes

- `[P]` = arquivos diferentes, sem dependências
- `[Story]` mapeia cada tarefa à user story correspondente para rastreabilidade
- `ListaItensMobile.tsx` (003) já foi implementada prevendo consumo mobile antes mesmo desta feature existir a nível de tasks — `EtapaClienteProdutos.tsx` (T015) a reaproveita sem alteração, confirmando que nenhuma feature de domínio precisou ser modificada para esta composição
- `BotaoFinalizarVenda.tsx`/`BotaoCancelarVenda.tsx` (004) idem — ambos já prontos com equivalente mobile (AD-089)
- Três dependências (012 — `CampoVendedorVenda.tsx`; 008 — painel de pagamento; 011 — recuperação de NFCe, sem `spec.md`) ainda não têm `tasks.md`/design; esta feature reserva o ponto de composição exato (T008/T015/T016) sem bloquear seu próprio fechamento — mesmo padrão de injeção por composição, análogo ao de dependência por stub de função usado em `specs/006-importacao-dav/tasks.md` T014
- AD-116 (`obterPlataforma`, T004) é a mudança de contrato desta fase — resolve a lacuna entre o hook React de 007 e a dependência de função plana que 008 já declarava precisar
- **Correção de `/speckit-analyze` (2026-08-31)**: a primeira geração deste `tasks.md` deixava `DesktopLayout.tsx` sem tarefa de criação (T008 agora cobre isso, extraindo de `App.tsx`/002) e três Success/Functional Criteria (`FR-008`, `FR-009`, `FR-010`, `SC-001`) sem verificação automatizada (T019, T027, T028 agora cobrem isso) — achados I1/C1/C2/C3 do relatório de análise

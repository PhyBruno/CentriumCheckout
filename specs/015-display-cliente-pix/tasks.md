---

description: "Task list for feature 015 — Display do cliente (espelho do QR Code PIX em segunda tela)"
---

# Tasks: Display do cliente — espelho do QR Code PIX em segunda tela

**Input**: Design documents from `/specs/015-display-cliente-pix/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/canal-display.md](./contracts/canal-display.md), [quickstart.md](./quickstart.md)

**Tests**: **SIM, incluídos.** A spec e o plano definem estratégia de teste explícita (research D13) e o design pede TDD nas partes de lógica — protocolo, canal e máquina de estados do display. As tarefas de teste vêm **antes** da implementação correspondente e devem falhar (RED) antes de passar.

**Organization**: agrupadas por user story, para cada uma ser implementável e testável de forma independente.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivo diferente, sem dependência pendente)
- **[Story]**: a qual user story a tarefa pertence (US1–US4)
- Todo caminho de arquivo é exato

## Path Conventions

Projeto único, com a separação já vigente: `src/shared/`, `src/client/`, `src/server/`, e testes em `tests/unit/`, `tests/integration/`, `tests/e2e/` — conforme `plan.md` § Structure Decision.

---

## ⚠️ Notas obrigatórias antes de começar

- **Pencil MCP NÃO é exigido nesta feature.** Não existe nó desta tela no `design/CentriumCheckout.pen`; o usuário autorizou (2026-09-10) derivar o visual do `ModalPix` já implementado. Registrado em `spec.md` § Assumptions e em `checklists/requirements.md`. Esta é a **exceção**, não a nova regra — qualquer outra tela continua exigindo consulta ao Pencil primeiro.
- **Ícones são do `reicon-react`** (`Qr`, `CheckCircle`), nunca `lucide-react` (AD-201).
- **Nenhum hex solto**: todo valor visual sai de token de `src/client/styles/global.css`. Tipografia: `font-mono` (Geist Mono) para o valor, `font-sans` (Inter) para texto.
- **Skills a acionar**: `zod-boundary-validation` (T005), `money-precision` (T005/T023), `vitest-testing-library-react` (todos os testes de componente), `typescript-strict` (obrigatória antes de qualquer push).
- **Base da branch**: `feat/display-cliente-pix`, saída de `fix/contrato-erp-real-pagamento-produto-cliente` — **não** de `master`.

---

## Phase 1: Setup

**Purpose**: confirmar o ponto de partida. Não há dependência nova a instalar — `BroadcastChannel` é API de plataforma (research D2).

- [X] T001 Rodar `npm run typecheck`, `npm run lint` e `npm run test` na branch `feat/display-cliente-pix` e registrar o baseline verde antes de tocar em qualquer arquivo — **baseline 2026-09-10: 83 arquivos / 1212 testes verdes**
- [X] T002 [P] Criar os diretórios `src/client/services/display/` e `src/client/features/display/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: o protocolo, o canal, a rota e a casca do display. Sem isto, **nenhuma** user story funciona.

**⚠️ CRÍTICO**: nenhuma user story pode começar antes desta fase terminar.

### Testes da fundação (escrever primeiro, ver falhar)

> **Correção de caminho (implementação, 2026-09-10).** As três tarefas abaixo citavam
> `tests/unit/*.spec.ts` na **raiz** de `tests/unit/`, mas nenhum dos 83 arquivos de teste
> da base fica lá — todos espelham a árvore de `src/`. Os caminhos reais são
> `tests/unit/shared/display.spec.ts`, `tests/unit/domain/sessao/identidadePdv.spec.ts` e
> `tests/unit/client/services/display/canalDisplay.spec.ts`. O dublê do canal mora em
> `tests/support/display.ts`, ao lado dos demais `tests/support/*`.

- [X] T003 [P] Teste dos schemas do protocolo em `tests/unit/shared/display.spec.ts`: mensagem válida passa; `tela` desconhecida, campo ausente, `valorCentavos` não inteiro e `valorCentavos` negativo são **rejeitados** (contrato §4)
- [X] T004 [P] Teste de `nomeDaLoja` em `tests/unit/domain/sessao/identidadePdv.spec.ts`: fantasia vence razão social; só razão social; ambos vazios/só espaços → `null`; `tituloDoProduto` mantém a saída atual
- [X] T005 [P] Teste de `criarCanalDisplay` (básico) em `tests/unit/client/services/display/canalDisplay.spec.ts` com canal falso injetado: `publicar` emite e memoriza (C1); `encerrar()` é idempotente (C5)

### Implementação da fundação

- [X] T006 [P] Criar `src/shared/display.ts` com as constantes (`NOME_CANAL_DISPLAY`, `NOME_JANELA_DISPLAY`, `ROTA_DISPLAY`, `MS_PULSO_DISPLAY`, `MS_SILENCIO_ATE_REPOUSO`), a união `EstadoDisplay`, a união `MensagemDisplay` e os schemas Zod — conforme `contracts/canal-display.md` §1–§4
- [X] T007 [P] Adicionar `nomeDaLoja(sessao): string | null` em `src/client/domain/sessao/identidadePdv.ts` e fazer `tituloDoProduto` chamá-la, para a regra de precedência existir uma vez só (research D1)
- [X] T008 Implementar `criarCanalDisplay(deps?)` em `src/client/services/display/canalDisplay.ts` com `publicar`/`encerrar` e a fábrica injetável `deps.criarCanal` (Dependency Inversion, Constitution II). **Só C1 e C5 nesta fase** — handshake, pulso e `pagehide` chegam nas fases das suas user stories
- [X] T009 Implementar `useCanalDisplay()` em `src/client/services/display/useCanalDisplay.ts`: cria o canal uma vez, lê `nomeLoja` do `sessionStore` via `nomeDaLoja`, devolve função estável e encerra no cleanup
- [X] T010 [P] Criar `src/client/features/display/TelaBoasVindas.tsx`: nome da loja (some quando `null`) + saudação, e **nada** da venda ou do cliente (FR-003)
- [X] T011 Teste de integração da casca em `tests/integration/DisplayCliente.spec.tsx` com canal falso: nasce em `BOAS_VINDAS`; mensagem inválida é **descartada** sem mudar a tela
- [X] T012 Criar `src/client/features/display/DisplayCliente.tsx`: assina o canal, valida cada mensagem com o schema, descarta a inválida em silêncio e escolhe a tela pelo `estado.tela`
- [X] T013 Ramificar `src/client/main.tsx` por `window.location.pathname`: `ROTA_DISPLAY` monta `<DisplayCliente/>` **fora** de `App`/`AppShell`, sem `QueryClientProvider` e sem `GooeyToaster` (FR-016, research D9). **Não mover** a chamada de `sincronizarLayoutNoDocumento()` da linha 25 — ela já cobre as duas rotas (research D10)

**Checkpoint**: `/display` abre, renderiza o repouso e sobrevive a um F5 (FR-023) sem nenhuma mudança de servidor ou de Vite (research D12).

---

## Phase 3: User Story 1 — O cliente escaneia o QR Code na tela virada para ele (P1) 🎯 MVP

**Goal**: com a tela do cliente já aberta, a cobrança PIX que o operador gera aparece nela: QR Code, valor e aviso de espera.

**Independent Test**: abrir `/display`, inserir um PIX de R$ 87,40 no checkout e conferir que o QR e o valor aparecem na tela do cliente; escanear com um celular e confirmar que o app do banco reconhece a mesma cobrança (quickstart, Cenário 1).

### Testes da US1

- [X] T014 [P] [US1] Estender `tests/integration/ModalPix.spec.tsx`: a janela chama `onEstadoDisplay` com `BOAS_VINDAS` enquanto gera, `PIX_AGUARDANDO` quando a cobrança chega, e `BOAS_VINDAS` no cleanup da desmontagem (contrato §7). Seguir o padrão do arquivo — `erpFake()` por `deps.erpClient`, `intervaloMs: 20`, sem fake timers, com `esperarAlemDeUmTick`/`esperarPollingParar`
- [X] T015 [P] [US1] Estender `tests/integration/ModalPix.spec.tsx` com os caminhos de recusa: `abaixoDoMinimo` e `emErro` publicam `BOAS_VINDAS`, nunca uma cobrança (FR-010, FR-011)
- [X] T016 [P] [US1] Estender `tests/integration/DisplayCliente.spec.tsx`: `BOAS_VINDAS` → `PIX_AGUARDANDO` renderiza QR, valor formatado e o aviso de espera; e **não** renderiza o "copia e cola" (FR-005)

### Implementação da US1

- [X] T017 [US1] Adicionar a prop opcional `onEstadoDisplay?: (estado: EstadoDisplay) => void` a `ModalPix` em `src/client/features/pagamento/pix/ModalPix.tsx`, com o `useEffect` que a alimenta nos casos `BOAS_VINDAS`/`PIX_AGUARDANDO` e publica `BOAS_VINDAS` no cleanup (contrato §7). O modal continua sem conhecer aba, canal ou display
- [X] T018 [US1] Ligar a prop ao canal em `usePixPendente`, `src/client/features/pagamento/ListaPagamentosAplicados.tsx`: chamar `useCanalDisplay()` e passar o resultado como `onEstadoDisplay` do `ModalPix`
- [X] T019 [P] [US1] Criar `src/client/features/display/TelaCobrancaPix.tsx`: QR Code grande, valor em Geist Mono e badge "aguardando pagamento", dimensionados para leitura a ~1 m (FR-006), derivados do vocabulário visual do `ModalPix`
- [X] T020 [US1] Renderizar `TelaCobrancaPix` no estado `PIX_AGUARDANDO` em `src/client/features/display/DisplayCliente.tsx`, reconvertendo `valorCentavos` com `centavos()` na fronteira antes de formatar (research D5, Constitution V)

**Checkpoint**: US1 completa e testável sozinha — o espelho funciona com a tela aberta previamente. **Este é o MVP.**

---

## Phase 4: User Story 2 — Abrir a tela pelo botão, inclusive com a cobrança já no ar (P2)

**Goal**: o botão do monitor abre a tela, cliques repetidos a reaproveitam, e uma tela aberta no meio de uma cobrança sincroniza sozinha.

**Independent Test**: inserir o PIX **primeiro** e só então clicar no botão do monitor; a tela abre já com o QR correto (quickstart, Cenário 2 — o ponto de atenção do pedido).

### Testes da US2

- [X] T021 [P] [US2] Estender `tests/unit/canalDisplay.spec.ts` com o handshake seletivo (C2): com cobrança ativa, `SOLICITAR_ESTADO` recebe resposta; **em repouso, o canal fica calado** (FR-018, research D7)
- [X] T022 [P] [US2] Estender `tests/integration/DisplayCliente.spec.tsx`: ao montar, emite `SOLICITAR_ESTADO`; ao receber a resposta com uma cobrança em curso, passa a exibi-la (FR-017)

### Implementação da US2

- [X] T023 [US2] Implementar C2 em `src/client/services/display/canalDisplay.ts`: responder `SOLICITAR_ESTADO` **apenas** quando `ultimoEstado.tela !== 'BOAS_VINDAS'`
- [X] T024 [US2] Emitir `SOLICITAR_ESTADO` na montagem em `src/client/features/display/DisplayCliente.tsx`, de forma idempotente sob `StrictMode` (research D9)
- [X] T025 [US2] Trocar o `BotaoInerte` do monitor por um botão ativo em `src/client/layout/BarraSuperior.tsx`: `window.open(ROTA_DISPLAY, NOME_JANELA_DISPLAY)` **sem `noopener`** (research D3), e remover "(ainda não disponível)" do rótulo. O `BotaoInerte` continua existindo para a engrenagem
- [X] T026 [P] [US2] Teste do botão em `tests/integration/BarraSuperior.spec.tsx`: o botão do monitor não está mais desabilitado, o rótulo não fala em indisponibilidade, e o clique chama `window.open` com a rota e o **nome** da janela — e sem `noopener`

**Checkpoint**: US1 e US2 funcionam independentemente. A tela pode ser aberta a qualquer momento.

---

## Phase 5: User Story 3 — Confirmação do pagamento e volta ao repouso (P3)

**Goal**: aprovado o pagamento, a tela mostra a confirmação com contador regressivo e volta sozinha ao repouso, junto com a tela do operador.

**Independent Test**: aprovar um PIX e cronometrar — confirmação aparece, contador decresce, tela volta ao repouso em 10 s; clicar "Concluir" aos ~3 s faz as duas telas voltarem juntas (quickstart, Cenário 4).

### Testes da US3

- [X] T027 [P] [US3] Estender `tests/integration/DisplayCliente.spec.tsx`: `PIX_APROVADO` renderiza a confirmação e o contador; ao fim de `voltaEmMs` volta a `BOAS_VINDAS` sozinho (FR-024)
- [X] T028 [P] [US3] Estender `tests/integration/DisplayCliente.spec.tsx`: um `BOAS_VINDAS` que chegue **antes** do fim encerra o contador e vira a tela na hora (FR-025); e a troca de `trnGuid` reinicia a tela descartando o contador em curso, mesmo saindo de `PIX_APROVADO` (FR-026)
- [X] T029 [P] [US3] Estender `tests/integration/ModalPix.spec.tsx`: ao aprovar, a janela publica `PIX_APROVADO` com `voltaEmMs` igual ao `atrasoFechamentoMs` daquela instância (contrato §7)

### Implementação da US3

- [X] T030 [P] [US3] Criar `src/client/features/display/TelaPagamentoAprovado.tsx`: confirmação com o ícone `CheckCircle` do reicon, valor confirmado e o contador regressivo visível
- [X] T031 [US3] Tratar `PIX_APROVADO` em `src/client/features/display/DisplayCliente.tsx`: contador de `voltaEmMs`, volta automática, aceite de `BOAS_VINDAS` antecipado e reinício por troca de `trnGuid` (data-model §4, D4/D5)
- [X] T032 [US3] Estender o `useEffect` de `src/client/features/pagamento/pix/ModalPix.tsx` com o ramo `aprovado === true` → `PIX_APROVADO`, usando `atrasoFechamentoMs` como `voltaEmMs`

**Checkpoint**: o ciclo completo da venda aparece na tela do cliente, do QR à confirmação.

---

## Phase 6: User Story 4 — A tela nunca mostra uma cobrança que não vale mais (P4)

**Goal**: nenhum QR obsoleto sobrevive na tela, e o repouso não expõe nada de ninguém.

**Independent Test**: com o QR no ar, fechar a aba do checkout (volta imediata) e, separadamente, matá-la pelo gerenciador de tarefas do navegador (volta em ≤ 15 s) — quickstart, Cenário 5.

### Testes da US4

- [X] T033 [P] [US4] Estender `tests/unit/canalDisplay.spec.ts`: o pulso (C3) liga com cobrança ativa, republica a cada `MS_PULSO_DISPLAY` e **desliga** ao voltar ao repouso
- [X] T034 [P] [US4] Estender `tests/unit/canalDisplay.spec.ts`: `pagehide` publica `BOAS_VINDAS` antes de a aba morrer (C4, FR-021)
- [X] T035 [P] [US4] Estender `tests/integration/DisplayCliente.spec.tsx`: com cobrança na tela, `MS_SILENCIO_ATE_REPOUSO` sem mensagem volta ao repouso (FR-020); e o pulso chegando mantém o QR de pé
- [X] T036 [P] [US4] Estender `tests/integration/DisplayCliente.spec.tsx`: mensagem **inválida** é descartada e **não** atualiza `recebidoEm` — uma aba emitindo lixo a cada 5 s não segura um QR morto (contrato §4)
- [X] T037 [P] [US4] Teste de privacidade em `tests/integration/DisplayCliente.spec.tsx`: no repouso não há nome, documento, item, preço nem total na árvore renderizada (FR-003, SC-006)

### Implementação da US4

- [X] T038 [US4] Implementar o pulso (C3) em `src/client/services/display/canalDisplay.ts`: republica a cada `MS_PULSO_DISPLAY` enquanto há cobrança ativa e encerra o temporizador no repouso e em `encerrar()`
- [X] T039 [US4] Registrar o ouvinte de `pagehide` (C4) em `src/client/services/display/canalDisplay.ts`, removido em `encerrar()`
- [X] T040 [US4] Implementar o corte por silêncio em `src/client/features/display/DisplayCliente.tsx`: só verifica enquanto o estado ≠ `BOAS_VINDAS`, e `recebidoEm` só avança em mensagem **válida** (data-model §4, D2/D3)

**Checkpoint**: todas as user stories funcionam independentemente e a tela é segura para ficar ligada o dia inteiro.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T041 Criar `tests/e2e/display-cliente.spec.ts` (Playwright): duas páginas no **mesmo contexto** de browser — uma insere o PIX no checkout, a outra abre `/display` **depois** que o QR já está na tela e prova que o handshake traz a cobrança correta. Contra a stack do `erp-mock`; **derrubar a porta 3100 antes** de crer em qualquer falha (AD-159)
- [X] T042 [P] Registrar os ADs novos em `.specs/project/STATE.md`: canal entre abas (o primeiro do projeto), `noopener` abandonado no botão do monitor, display sem polling próprio, e `nomeDaLoja` separada de `tituloDoProduto`
- [X] T043 [P] Fechar o item 28 em `.specs/project/PENDENCIES.md`, apontando para esta feature (AD-066)
- [X] T044 [P] Acrescentar a feature 015 à tabela de `.specs/project/ROADMAP.md`
- [X] T045 [P] Acrescentar a seção "a segunda aba e o canal" em `.specs/codebase/ARCHITECTURE.md`
- [X] T046 [P] Atualizar a nota do fluxograma "Tela do cliente" em `Fluxograma - Diagrama - Alinhamentos/FLUXOS-MERMAID.md`: o gap saiu do estado "não decidido", e a propaganda do passo "Exibe imagem" ficou **fora** desta versão (research D14) — reescrever no ponto do aviso, nunca anexar ao final (Constitution, correção de decisão superada)
- [X] T047 Rodar `npm run typecheck`, `npm run lint`, `npm run test` e `npm run test:e2e` — **`typecheck`, `lint` e `test` verdes** (86 arquivos, 1288 testes); `test:e2e` **178 de 180**, com os 3 cenários novos do display passando. **As 2 falhas são pré-existentes e alheias a esta feature**, herdadas de AD-209 (2026-09-10), que revogou a troca de cliente com carrinho populado sem atualizar os dois E2E correspondentes: `identificacao-cliente.spec.ts:180` ("trocar o cliente com carrinho populado reprecifica por SKU") tenta preencher um campo que AD-209 tornou `readOnly` — daí o timeout em "visible, enabled and **editable**" —, e `carrinho-precificacao.spec.ts:269` ("o rótulo do campo de código reflete `UsuarioTipoCodigoProduto`") espera um rótulo que a faixa de bloqueio por vendedor substituiu. `git log` confirma que nenhum dos dois arquivos foi tocado pelo commit de AD-209. **Corrigi-los é decisão sobre a 209, não sobre a 015** — o primeiro precisa ser apagado ou reescrito para afirmar a **recusa**, e essa escolha é do usuário
- [ ] T048 Percorrer os 9 cenários de [quickstart.md](./quickstart.md) manualmente, com as duas telas lado a lado — **NÃO FEITO: exige dois monitores físicos e um operador humano.** Os cenários 1, 2 e 5a estão cobertos automaticamente pelo E2E (`tests/e2e/display-cliente.spec.ts`, duas páginas no mesmo contexto de browser, canal real). Continuam sem verificação: 3 (reaproveitamento da janela em três cliques), 4 (contador e volta conjunta ao clicar "Concluir"), 5b (matar a aba pelo `Shift+Esc` do Chromium), 6 (duas abas de checkout + handshake calado), 7 (conferir a olho que o repouso mostra `Mercado Aurora` e não `Centrium Checkout - Mercado Aurora`), 8 (segundo PIX com a confirmação na tela) e 9 (F5 na URL direta contra o build). Nada da 015 foi exercitado contra o **ERP real**
- [X] T049 Commit + push na branch `feat/display-cliente-pix` e abertura do PR (`rules.md`) — commit `351014a`, PR [#69](https://github.com/PhyBruno/CentriumCheckout/pull/69)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Fase 1)**: sem dependências
- **Foundational (Fase 2)**: depende da Fase 1 — **bloqueia todas as user stories**
- **US1 (Fase 3)** → **US2 (Fase 4)** → **US3 (Fase 5)** → **US4 (Fase 6)**: em ordem de prioridade; cada uma testável sozinha
- **Polish (Fase 7)**: depende das user stories desejadas

### User Story Dependencies

- **US1 (P1)**: só depende da fundação. É o MVP.
- **US2 (P2)**: só depende da fundação. Testável sem US3/US4 — mas o **valor** dela (sincronizar com uma cobrança em curso) só é observável com US1 pronta, porque é preciso haver cobrança para sincronizar.
- **US3 (P3)**: só depende da fundação; na prática se valida sobre uma cobrança da US1.
- **US4 (P4)**: só depende da fundação; valida-se sobre uma cobrança da US1.

### Arquivos tocados em mais de uma fase (nunca marcar [P] entre si)

| Arquivo | Fases |
|---|---|
| `src/client/services/display/canalDisplay.ts` | T008 (base) → T023 (handshake) → T038/T039 (pulso, `pagehide`) |
| `src/client/features/display/DisplayCliente.tsx` | T012 (casca) → T020 (cobrança) → T024 (handshake) → T031 (aprovado) → T040 (silêncio) |
| `src/client/features/pagamento/pix/ModalPix.tsx` | T017 (mapa base) → T032 (ramo aprovado) |
| `tests/integration/DisplayCliente.spec.tsx` | T011, T016, T022, T027, T028, T035, T036, T037 |
| `tests/integration/ModalPix.spec.tsx` | T014, T015, T029 |
| `tests/unit/canalDisplay.spec.ts` | T005, T021, T033, T034 |

As tarefas marcadas `[P]` dentro de uma mesma fase que citam o **mesmo** arquivo de teste (por exemplo T027 e T028) são paralelizáveis apenas como *redação independente de casos*; se forem executadas por agentes distintos, serializar a escrita do arquivo.

### Within Each User Story

- Testes escritos **antes** e vistos falhar (RED) antes da implementação
- Protocolo antes do canal; canal antes da ponte React; ponte antes da UI que a consome
- Story completa antes de passar à prioridade seguinte

---

## Parallel Opportunities

**Fase 2 (fundação)** — o maior ganho real:

```bash
# Testes RED, três arquivos distintos:
Task: "T003 schemas do protocolo em tests/unit/display-protocolo.spec.ts"
Task: "T004 nomeDaLoja em tests/unit/identidadePdv.spec.ts"
Task: "T005 canalDisplay básico em tests/unit/canalDisplay.spec.ts"

# Implementações independentes entre si:
Task: "T006 protocolo em src/shared/display.ts"
Task: "T007 nomeDaLoja em src/client/domain/sessao/identidadePdv.ts"
Task: "T010 TelaBoasVindas em src/client/features/display/TelaBoasVindas.tsx"
```

**Fase 3 (US1)**: T019 (`TelaCobrancaPix.tsx`) é independente de T017/T018 (`ModalPix`/`ListaPagamentosAplicados`) — arquivos disjuntos, podem correr juntos.

**Fase 7**: T042 a T046 são cinco documentos distintos e correm todos em paralelo.

**Atenção**: `canalDisplay.ts` e `DisplayCliente.tsx` recebem tarefas em quase toda fase (ver tabela acima) — é o preço de entregar as user stories como incrementos independentes, e não um erro de decomposição. Nunca paralelizar duas tarefas que tocam qualquer um dos dois.

---

## Implementation Strategy

### MVP primeiro (Fases 1–3)

1. Fase 1: Setup
2. Fase 2: Fundação (**bloqueia tudo**)
3. Fase 3: US1
4. **PARAR E VALIDAR**: Cenário 1 do quickstart, com a tela aberta antes da cobrança
5. Já entrega o ganho operacional inteiro para quem lembra de abrir a tela no início do turno

### Entrega incremental

1. Setup + Fundação → `/display` existe e fica em repouso
2. + US1 → **MVP**: a cobrança aparece na tela do cliente
3. + US2 → o botão liga e a tela sincroniza a qualquer momento (fecha o item 28 de verdade)
4. + US3 → o ciclo fecha com confirmação e volta automática
5. + US4 → seguro para ficar ligado o dia inteiro — **pré-requisito para produção**, não opcional

> ⚠️ **US4 não é polimento.** É a única fase que impede um QR obsoleto de ficar na tela e o cliente seguinte pagar a cobrança do anterior. A feature pode ser demonstrada sem ela; não pode ir a produção sem ela.

---

## Notes

- `[P]` = arquivos diferentes, sem dependência pendente
- Verificar que cada teste falha antes de implementar
- Commit por tarefa ou grupo lógico coerente
- Parar em qualquer checkpoint para validar a story isoladamente
- `npm run typecheck` é gate obrigatório antes de qualquer push (Constitution)

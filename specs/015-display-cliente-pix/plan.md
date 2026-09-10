# Implementation Plan: Display do cliente — espelho do QR Code PIX em segunda tela

**Branch**: `feat/display-cliente-pix` | **Date**: 2026-09-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/015-display-cliente-pix/spec.md`

> A branch de trabalho é `feat/display-cliente-pix` (saída de
> `fix/contrato-erp-real-pagamento-produto-cliente`, **não** de `master`). O
> `setup-plan.ps1` deriva `015-display-cliente-pix` do nome do diretório da
> feature; o nome real do branch git é o de cima.

## Summary

Uma segunda aba, aberta pelo botão do monitor da barra superior e arrastada para o
monitor voltado ao cliente, espelha a cobrança PIX que o operador tem à frente: QR
Code grande, valor, "aguardando pagamento", depois confirmação com contador e volta
sozinha ao repouso.

O núcleo técnico é que a `CobrancaPix` hoje vive **só** no `useState` do `ModalPix`
(`ModalPix.tsx:185`) — não está no `vendaStore`, não está no Dexie, e os stores rodam
sem `persist` (Constitution VI). A segunda aba, portanto, nasce vazia e não tem de onde
ler. A abordagem: introduzir um canal entre abas do próprio navegador
(`BroadcastChannel`, API nativa — **nenhuma dependência nova**), com o checkout como
único publicador e o display como terminal burro que só desenha o que recebe. A
mensagem é validada por Zod na chegada, como toda fronteira do projeto.

Três invariantes moldam o desenho e não são negociáveis:

1. **O display nunca gera nem consulta cobrança** (FR-013/014). As travas de dupla
   geração do `ModalPix` são `useRef` **por instância** (`geracaoIniciada`,
   `ModalPix.tsx:213`); uma segunda aba rodando o mesmo hook criaria uma segunda
   cobrança real, órfã, sem endpoint de cancelamento (invariante J5).
2. **Uma aba de checkout em repouso fica calada no handshake** (FR-018), senão apagaria
   o QR publicado por outra aba de checkout.
3. **Pulso e corte por silêncio** (FR-019/020): o QR não pode ficar preso na tela se a
   aba do checkout travar — o risco concreto é o cliente seguinte pagar o PIX do anterior.

## Technical Context

**Language/Version**: TypeScript 5.x `strict`, React 19, Node ≥ 22 (`package.json` `engines`)

**Primary Dependencies**: React 19 + Vite; Zod 4 (validação da mensagem do canal);
`reicon-react` (ícones `Qr`/`CheckCircle`, AD-201 — nunca `lucide`); tokens do
`src/client/styles/global.css`. **Nenhuma dependência nova**: `BroadcastChannel` é API
nativa do navegador. A rota `/display` **não** usa TanStack Query, Zustand, Dexie nem
`goey-toast`.

**Storage**: N/A. Nada é persistido em lado nenhum — o estado do canal vive em memória
em cada aba, e o display não escreve `localStorage`, `sessionStorage` nem IndexedDB.

**Testing**: Vitest + Testing Library (`tests/unit/`, `tests/integration/`); Playwright
(`tests/e2e/`). Scripts: `npm run test`, `npm run test:e2e`, `npm run typecheck`, `npm run lint`.

**Target Platform**: navegador do PDV (Chromium), segunda saída de vídeo da **mesma**
máquina. Não é display remoto — `BroadcastChannel` só atravessa contextos da mesma
origem no mesmo navegador, e isso coincide exatamente com o escopo declarado na spec.

**Project Type**: SPA React + BFF Fastify mínimo no mesmo processo Node.

**Performance Goals**: espelhamento de mudança de estado ≤ 1 s (SC-002); handshake de
abertura ≤ 2 s (SC-003); pulso a cada 5 s (FR-019).

**Constraints**: o display não faz nenhuma chamada de rede (FR-014/016); QR obsoleto
sobrevive no máximo 15 s (FR-020, SC-005); nada da venda ou do cliente no repouso
(FR-003, SC-006); zero mudança no servidor e no Vite.

**Scale/Scope**: uma tela de display por estação de PDV. 8 arquivos novos, 4 alterados
no código; 4 documentos de `.specs/` a atualizar.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Veredito | Como o desenho satisfaz |
|---|---|---|
| **I. Spec-Driven Development** | ✅ Passa | `spec.md` ratificado antes deste plano; `design.md` o precede e foi rebaixado a insumo. Rastreabilidade FR → contrato → tarefa mantida nos artefatos desta fase. |
| **II. Arquitetura SOLID** | ✅ Passa | *SRP*: protocolo, publicador, ponte React e três telas, um arquivo por responsabilidade. *DIP*: `criarCanalDisplay(deps?)` recebe a fábrica do canal (`deps.criarCanal`), o que torna o teste determinístico sem depender do `BroadcastChannel` do jsdom. *ISP*: o `ModalPix` ganha **uma** prop opcional e continua sem saber o que é aba, canal ou display — recebe uma função e a chama, como já faz com `onAprovado`. |
| **III. ERP como fonte única de verdade** | ✅ Reforça | O display não fala com o ERP em nenhum caminho. FR-014 existe justamente para não criar uma segunda fonte de verdade capaz de divergir (aprovar no display e não no caixa). |
| **IV. Tipagem estrita e validação de fronteira** | ✅ Passa | A mensagem do canal é entrada externa — outra aba pode rodar um bundle antigo depois de um deploy — e passa por Zod na chegada (FR-022). `EstadoDisplay` é união discriminada; nenhum `any`/`as` não justificado. |
| **V. Precisão monetária** | ✅ Passa | O valor atravessa o canal como inteiro de centavos e é reconstruído por `centavos()` (`dinheiro.ts:37`), que **lança** em não-inteiro. A marca `Centavos` não atravessa o canal porque uma mensagem clonada estruturalmente é dado, não valor tipado — reconverter na fronteira é a regra, não um atalho. |
| **VI. Sem estado de venda persistido no cliente** | ✅ Reforça | O canal é volátil por construção: nada sobrevive ao fechamento das duas abas. O display **não** monta dentro do `AppShell`, que chamaria `abrirSessaoDeVenda('NOVA')`, registraria o `beforeunload` de `useAvisoAoSair` e ligaria o polling de `GetStatusSistema` (FR-016). |
| **Containerização total** | ✅ Neutro | Zero mudança de infra: `/display` cai no `setNotFoundHandler` do Fastify (`src/server/index.ts:50`), que já devolve `index.html` para qualquer GET fora de `/api/`, e no fallback de SPA do Vite em dev. |
| **Sem backend próprio de domínio** | ✅ Neutro | Nenhuma rota nova no BFF. |
| **Stack fixada** | ✅ Passa | Nenhum pacote novo. `BroadcastChannel` é plataforma. |

**Gates: todos aprovados. Nenhuma entrada em Complexity Tracking.**

**Re-check pós-Fase 1 (após `research.md`, `data-model.md`, `contracts/` e `quickstart.md`):**
os gates seguem aprovados, sem violação nova. O desenho detalhado *reforçou* dois deles em
vez de pressioná-los — a Constitution V ficou mais protegida com a reconversão por
`centavos()` na fronteira (research D5), que transforma payload corrompido em falha alta; e
a Constitution IV ganhou uma regra explícita de descarte silencioso (contrato §4) que a
Fase 0 ainda não tinha. A única alteração de escopo trazida pela Fase 1 é a função
`nomeDaLoja` em `identidadePdv.ts` (research D1) — arquivo já listado como alterado, sem
dependência nova e sem novo ponto de acoplamento.

Duas decisões precisam ficar registradas explicitamente por serem desvios conscientes de
precedente, não violações de princípio — detalhe e alternativas em
[research.md](./research.md) D3 e D7:

- **`window.open` sem `noopener`** (FR-028), divergindo de `BotaoMenuGerencial.tsx:40`.
  Pela especificação HTML, `noopener` faz o **nome** da janela ser ignorado e uma aba nova
  nascer a cada clique, quebrando o requisito de reaproveitamento. O alvo é página da
  própria origem e a comunicação é por canal, nunca por `window.opener`.
- **Repouso não usa `tituloDoProduto`**, ao contrário do que o `design.md` supunha —
  ver D1, que é o achado mais relevante desta fase.

## Project Structure

### Documentation (this feature)

```text
specs/015-display-cliente-pix/
├── design.md            # Insumo pré-Spec Kit (2026-09-10); a spec prevalece sobre ele
├── spec.md              # /speckit-specify
├── checklists/
│   └── requirements.md  # /speckit-specify
├── plan.md              # Este arquivo (/speckit-plan)
├── research.md          # Fase 0 (/speckit-plan)
├── data-model.md        # Fase 1 (/speckit-plan)
├── quickstart.md        # Fase 1 (/speckit-plan)
├── contracts/
│   └── canal-display.md # Fase 1 — o protocolo do canal é contrato de verdade
└── tasks.md             # Fase 2 (/speckit-tasks — NÃO criado aqui)
```

### Source Code (repository root)

```text
src/
├── shared/
│   └── display.ts                      # NOVO — protocolo: união EstadoDisplay, schemas Zod, constantes
├── client/
│   ├── main.tsx                        # ALTERADO — branch por location.pathname
│   ├── layout/
│   │   └── BarraSuperior.tsx           # ALTERADO — botão do monitor deixa de ser inerte
│   ├── domain/
│   │   └── sessao/
│   │       └── identidadePdv.ts        # ALTERADO — exporta nomeDaLoja() (ver research D1)
│   ├── services/
│   │   └── display/
│   │       ├── canalDisplay.ts         # NOVO — publicador: canal injetável, handshake, pulso, pagehide
│   │       └── useCanalDisplay.ts      # NOVO — ponte React do publicador para usePixPendente
│   └── features/
│       ├── display/
│       │   ├── DisplayCliente.tsx      # NOVO — assina, valida, escolhe a tela, corta por silêncio
│       │   ├── TelaBoasVindas.tsx      # NOVO — repouso: marca + saudação
│       │   ├── TelaCobrancaPix.tsx     # NOVO — QR Code + valor + aguardando
│       │   └── TelaPagamentoAprovado.tsx # NOVO — confirmação + contador regressivo
│       └── pagamento/
│           ├── pix/ModalPix.tsx        # ALTERADO — prop onEstadoDisplay + useEffect que a alimenta
│           └── ListaPagamentosAplicados.tsx # ALTERADO — usePixPendente liga a prop ao canal
└── server/                             # SEM MUDANÇA (o notFoundHandler já cobre /display)

tests/
├── unit/
│   ├── display-protocolo.spec.ts       # NOVO — schemas Zod rejeitam mensagem de versão antiga
│   ├── canalDisplay.spec.ts            # NOVO — publica, handshake seletivo, pulso, pagehide
│   └── identidadePdv.spec.ts           # ALTERADO — casos de nomeDaLoja
├── integration/
│   ├── DisplayCliente.spec.tsx         # NOVO — máquina de estados da tela do cliente
│   └── ModalPix.spec.tsx               # ALTERADO — sequência de onEstadoDisplay
└── e2e/
    └── display-cliente.spec.ts         # NOVO — duas páginas no mesmo contexto de browser
```

**Structure Decision**: projeto único, com a separação já vigente `src/shared` (código
que os dois lados compartilham) / `src/client` / `src/server`. O protocolo mora em
`src/shared/display.ts` pelo mesmo motivo de `src/shared/gerencial.ts`: é vocabulário
comum, e centralizá-lo faz um rename quebrar a compilação em vez de virar erro silencioso
em runtime. O publicador fica em `src/client/services/` (fala com a plataforma) e as
telas em `src/client/features/display/` (só desenham), mantendo a fronteira que o resto
da base já usa.

## Complexity Tracking

> Constitution Check passou sem violações — nada a justificar aqui.

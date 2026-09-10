# Display do cliente — espelho do QR Code PIX em segunda tela (feature 015)

> Documento de design, escrito antes do ciclo do Spec Kit (2026-09-10). É a entrada
> para `/speckit-specify` desta feature: `spec.md`, `plan.md` e `tasks.md` nascem daqui
> e passam a valer sobre ele em caso de divergência.

## Contexto

Hoje o QR Code do PIX só existe na tela do operador, dentro do `ModalPix`. O cliente
precisa esticar o pescoço por cima do balcão para escanear o código — ou o operador
gira o monitor. O produto já previa a solução: o botão do monitor na barra superior
existe desde sempre, **desabilitado**, com o rótulo literal "Display do cliente (ainda
não disponível)" (`src/client/layout/BarraSuperior.tsx:80`), e o gap está registrado
como item 28 de `.specs/project/PENDENCIES.md` (AD-066) e desenhado em
`Fluxograma - Diagrama - Alinhamentos/FLUXOS-MERMAID.md`, seção "Tela do cliente".

Esta feature liga aquele botão. Ele abre uma segunda aba, `/display`, que o operador
arrasta para o monitor virado ao cliente e deixa ligada o dia inteiro. A aba tem três
telas: boas-vindas (o estado de repouso), cobrança PIX (QR Code + valor + "aguardando
pagamento") e pagamento confirmado (com contador regressivo de volta às boas-vindas).

O ponto de atenção do pedido — "essa tela tem que identificar nessa nova aba o mesmo
PIX que está sendo exibido na tela para o operador" — é o núcleo técnico do trabalho.
Hoje a `CobrancaPix` (`trnGuid`, `qrCodeFonte`, `copiaECola`, `valor`) vive **só** no
`useState` do `ModalPix` (`src/client/features/pagamento/pix/ModalPix.tsx:185`): não
está no `vendaStore`, não está no Dexie, não está em lugar nenhum que outra aba possa
ler. Os stores Zustand rodam sem `persist` por decisão de arquitetura (AD-006), então
a segunda aba nasce com a venda vazia. E o projeto **não tem hoje nenhum canal entre
abas** — nada de `BroadcastChannel`, `SharedWorker`, evento `storage`, SSE ou
WebSocket. Esta feature introduz o primeiro.

## Decisões já tomadas (respostas do usuário, 2026-09-10)

1. **Abertura:** botão + URL fixa. O botão já existe — é o do monitor na barra
   superior, hoje inerte.
2. **Fonte de verdade do status:** só o checkout decide. O display é terminal burro —
   não chama o ERP, não faz polling, não gera cobrança.
3. **Tela de repouso:** marca (nome da loja) + saudação. Sem itens, sem preços, sem
   dados do cliente — a tela fica horas à vista de qualquer um na loja.
4. **Contador pós-aprovação:** 10 s, o mesmo `MS_FECHAMENTO_APOS_APROVACAO` do modal
   do operador, para as duas telas voltarem juntas.
5. **Base da branch:** `feat/display-cliente-pix` sai de
   `fix/contrato-erp-real-pagamento-produto-cliente` (a branch atual), **não** de
   `master`. Motivo: `master` está 15 commits atrás, ainda em `lucide-react` (pré
   AD-201) e sem AD-203/205–209; o `ModalPix`, a `BarraSuperior` e a
   `ListaPagamentosAplicados` que esta feature toca são os desta branch. `npm run
   typecheck` passa nela agora.
6. **Processo:** Spec Kit completo em `specs/015-display-cliente-pix/`.

## Por que o display não pode gerar nem consultar o PIX

Regra dura, e a razão de ela existir: `useGerarPix` protege contra dupla geração com
guardas `useRef` **por instância** (`pixQueries.ts`, `ModalPix.tsx:213`). Uma segunda
aba rodando o mesmo hook criaria uma **segunda cobrança real** no adquirente, órfã e
sem caminho de cancelamento — o contrato não tem endpoint de cancelamento de PIX
(invariante J5).

Pelo mesmo motivo ele não roda o polling de `StatusPIX`: dobraria as chamadas ao ERP e
criaria duas fontes de verdade que podem divergir (aprovar no display e não no caixa).

## Arquitetura

### 1. O protocolo (`src/shared/display.ts`)

Módulo compartilhado de tipos e constantes, no mesmo espírito de
`src/shared/gerencial.ts` e `src/shared/erroAcesso.ts`. Contém:

- `NOME_CANAL_DISPLAY = 'centrium-checkout-display'` e
  `NOME_JANELA_DISPLAY = 'centrium-checkout-display'`;
- `ROTA_DISPLAY = '/display'`;
- a união discriminada do estado que o display desenha:

```ts
type EstadoDisplay =
  | { readonly tela: 'BOAS_VINDAS' }
  | { readonly tela: 'PIX_AGUARDANDO'; readonly trnGuid: string;
      readonly valorCentavos: number; readonly qrCodeFonte: string;
      readonly copiaECola: string }
  | { readonly tela: 'PIX_APROVADO'; readonly trnGuid: string;
      readonly valorCentavos: number; readonly voltaEmMs: number };
```

- as mensagens do canal:
  `{ tipo: 'ESTADO'; estado: EstadoDisplay; nomeLoja: string | null; origemId: string; emitidoEm: number }`
  e `{ tipo: 'SOLICITAR_ESTADO' }`.

Quatro escolhas que precisam ficar explícitas:

- **`voltaEmMs` viaja no payload** em vez de o display importar
  `MS_FECHAMENTO_APOS_APROVACAO` de `ModalPix.tsx`. Mantém uma constante só, e evita
  que a tela do cliente importe um componente de feature do checkout.
- **`nomeLoja` viaja no payload**, calculado no checkout por `tituloDoProduto`
  (`src/client/domain/sessao/identidadePdv.ts`). A alternativa — o display rodar o
  bootstrap para descobrir o nome — custaria um `fetch /api/bootstrap` de ~5 MB e um
  Web Worker por aba, para exibir uma string.
- **`Centavos` não atravessa o canal como tipo de marca**; vai como `number` cru e o
  display o reconverte na fronteira. Uma mensagem de `BroadcastChannel` é dado
  estruturado-clonado, não valor tipado — validar na entrada é a regra de fronteira do
  projeto (Zod, `.specs/codebase/STACK.md`).
- **A mensagem é validada por Zod na chegada.** É a mesma fronteira de sempre: quem
  publica pode ser uma aba com versão antiga do bundle depois de um deploy.

### 2. O publicador (`src/client/services/display/canalDisplay.ts`)

Uma função `criarCanalDisplay(deps?)` que devolve `{ publicar, encerrar }`, com a
fábrica do canal injetável (`deps.criarCanal`) — Dependency Inversion, Constitution
II, e é o que torna o teste determinístico sem depender do `BroadcastChannel` do jsdom.

Responsabilidades, todas pequenas:

- guarda o último `EstadoDisplay` publicado;
- publica no canal a cada mudança;
- **responde `SOLICITAR_ESTADO` apenas quando tem um PIX ativo.** Uma aba de checkout
  em repouso fica calada de propósito: se ela respondesse `BOAS_VINDAS`, o handshake
  de um display aberto no meio de uma cobrança apagaria o QR Code publicado por outra
  aba de checkout. É a regra que faz o sistema se comportar com duas abas de checkout
  abertas;
- **pulso a cada 5 s enquanto há PIX na tela.** O display volta a `BOAS_VINDAS` depois
  de 15 s sem notícia. Cobre o caso que o `pagehide` não cobre: a aba do checkout
  travar ou morrer com o QR no ar, deixando um código de cobrança preso na tela virada
  ao cliente — o risco concreto é o cliente seguinte pagar o PIX do anterior;
- `pagehide` publica `BOAS_VINDAS` antes de a aba morrer, para o caso normal de
  fechamento.

### 3. Onde o checkout publica

O `ModalPix` ganha **uma** prop opcional,
`onEstadoDisplay?: (estado: EstadoDisplay) => void`, e a chama num `useEffect` que
deriva o estado do que ele já sabe:

| Situação interna do `ModalPix` | `EstadoDisplay` publicado |
|---|---|
| `abaixoDoMinimo`, `emErro`, ou `cobranca === null` (gerando) | `BOAS_VINDAS` |
| cobrança gerada, não resolvida | `PIX_AGUARDANDO` |
| `aprovado === true` | `PIX_APROVADO` |
| desmontagem / `onFechar` / `abandonar` | `BOAS_VINDAS` |

O `ModalPix` continua sem saber o que é uma aba, um canal ou um display — recebe uma
função e a chama, exatamente como já faz com `onAprovado`/`onAbandonado`. O fio até o
`BroadcastChannel` é atado em `usePixPendente`
(`src/client/features/pagamento/ListaPagamentosAplicados.tsx:307`), que é quem já monta
o modal e já tem a closure do pagamento.

O estado "gerando" mapeia para boas-vindas de propósito: não há QR Code a mostrar
ainda, e um esqueleto na tela do cliente prometeria algo que pode falhar.

### 4. A rota `/display`

**Nenhuma mudança no servidor nem no Vite.** O `setNotFoundHandler` do Fastify já
devolve `index.html` para qualquer GET fora de `/api/` (`src/server/index.ts:50`), e o
fallback de SPA do Vite faz o mesmo em dev — `/display` sobrevive a um F5 direto na URL
nas duas pontas. O que muda é `src/client/main.tsx`: um `if` sobre
`window.location.pathname` decide entre montar `<App/>` (o checkout inteiro) e
`<DisplayCliente/>`.

O display monta **fora** do `App` e do `AppShell`. Isso não é preferência de estilo: o
`AppShell` chama `abrirSessaoDeVenda('NOVA')` na montagem, registra o `beforeunload` de
`useAvisoAoSair` e liga o polling de `GetStatusSistema`. Uma aba de display dentro dele
abriria uma segunda sessão de auditoria e um segundo polling, para uma tela que não
vende nada.

O display também dispensa `QueryClientProvider` (não faz rede) e `GooeyToaster` (toasts
são conversa com o operador, não com o cliente). Herda `global.css` e chama
`sincronizarLayoutNoDocumento()` — a segunda tela costuma ser um monitor sem toque, e
sem o atributo `data-layout` o `md:` do projeto (AD-198) não resolve.

### 5. A tela (`src/client/features/display/`)

Sem nó no Pencil — o usuário autorizou inferir a partir do `ModalPix`. A tela é o
mesmo vocabulário visual, ampliado para leitura a um metro de distância: fundo
`--cc-color-canvas`, QR Code em cartão de raio 24 com hairline, valor em **Geist Mono**
no bloco `--cc-color-surface-dark`, badge `--cc-color-up-soft` com o ponto pulsando, e
os ícones `Qr` / `CheckCircle` do **reicon** (AD-201 — nunca lucide). Nada de hex solto:
todo valor sai de token de `src/client/styles/global.css`.

Três componentes pequenos, um por estado, orquestrados por `DisplayCliente.tsx`:
`TelaBoasVindas`, `TelaCobrancaPix`, `TelaPagamentoAprovado`.

Detalhes que a tela do cliente exige e o modal não:

- **Sem "copia e cola" e sem botão de copiar.** O cliente não tem teclado nem mouse
  nessa tela; um código de 130 caracteres que ninguém consegue copiar é ruído. Só o QR
  Code, grande.
- **O contador é do display.** Ao receber `PIX_APROVADO`, ele conta `voltaEmMs` para
  trás na tela ("voltando em 8…") e volta sozinho às boas-vindas. Aceita também um
  `BOAS_VINDAS` que chegue antes — se o operador clicar "Concluir" no décimo segundo 3,
  as duas telas viram juntas.
- **Um PIX novo reinicia tudo.** O `trnGuid` é a identidade da cobrança: se ele muda, a
  tela troca e o contador zera, mesmo que o estado anterior fosse `PIX_APROVADO`.

### 6. O botão da barra superior

`src/client/layout/BarraSuperior.tsx` deixa de renderizar `BotaoInerte` para o monitor
e passa a chamar `window.open(ROTA_DISPLAY, NOME_JANELA_DISPLAY)`. A janela **nomeada**
é o que faz o segundo clique focar a aba já aberta em vez de abrir uma terceira.

Divergência consciente do precedente `BotaoMenuGerencial.tsx:40`, que usa
`'_blank', 'noopener'`: pela especificação HTML, `noopener` faz o nome da janela ser
ignorado e uma aba nova nascer a cada clique. Como a comunicação é por
`BroadcastChannel` e não por `window.opener`, abrir mão do `noopener` não custa nada
funcionalmente — e o alvo é uma página da própria origem. Precisa virar linha de AD.

O `BotaoInerte` continua existindo: a engrenagem segue sem destino. O rótulo do monitor
perde o "(ainda não disponível)".

## Arquivos

**Novos**

| Arquivo | Papel |
|---|---|
| `src/shared/display.ts` | protocolo: tipos, schemas Zod, constantes de canal/rota/janela |
| `src/client/services/display/canalDisplay.ts` | publicador: canal injetável, handshake, pulso, `pagehide` |
| `src/client/services/display/useCanalDisplay.ts` | ponte React do publicador para `usePixPendente` |
| `src/client/features/display/DisplayCliente.tsx` | assina o canal, valida a mensagem, escolhe a tela |
| `src/client/features/display/TelaBoasVindas.tsx` | repouso: marca + saudação |
| `src/client/features/display/TelaCobrancaPix.tsx` | QR Code + valor + "aguardando pagamento" |
| `src/client/features/display/TelaPagamentoAprovado.tsx` | confirmação + contador regressivo |

**Alterados**

| Arquivo | Mudança |
|---|---|
| `src/client/main.tsx` | branch por `location.pathname`; display fora de `App`/providers do checkout |
| `src/client/layout/BarraSuperior.tsx` | botão do monitor deixa de ser inerte e abre a janela nomeada |
| `src/client/features/pagamento/pix/ModalPix.tsx` | nova prop `onEstadoDisplay` + `useEffect` que a alimenta |
| `src/client/features/pagamento/ListaPagamentosAplicados.tsx` | `usePixPendente` liga a prop ao canal |
| `.specs/project/STATE.md` | AD novos: canal entre abas, `noopener` abandonado, display sem polling próprio |
| `.specs/project/PENDENCIES.md` | fecha o item 28 |
| `.specs/project/ROADMAP.md` | feature 015 na tabela |
| `.specs/codebase/ARCHITECTURE.md` | seção nova: a segunda aba e o canal |

**Reaproveitar, não reescrever:** `formatarCentavos`/`Centavos`
(`src/client/domain/precificacao/dinheiro.ts`), `tituloDoProduto`
(`src/client/domain/sessao/identidadePdv.ts`), os tokens de
`src/client/styles/global.css`, `Qr`/`CheckCircle` de `reicon-react`, e a classe
`cc-shimmer` se algum estado de espera precisar dela.

## Execução

1. `git checkout -b feat/display-cliente-pix` a partir de
   `fix/contrato-erp-real-pagamento-produto-cliente`.
2. `/speckit-specify` → `specs/015-display-cliente-pix/spec.md`. Traz junto o item 28
   de `PENDENCIES.md` e o fluxo do `FLUXOS-MERMAID.md`.
3. `/speckit-plan` → `plan.md` + `research.md` + `contracts/` (o protocolo do canal é
   um contrato de verdade e merece o arquivo).
4. `/speckit-tasks` → `tasks.md`, seguido de `/speckit-analyze`.
5. `/speckit-implement`, com TDD nas partes de lógica (protocolo, canal, máquina de
   estados do display) — skills `zod-boundary-validation`,
   `vitest-testing-library-react`, `typescript-strict`.
6. `npm run typecheck` + `npm run lint` + `npm run test` antes do push; commit + push na
   branch e PR (`rules.md`).

## Verificação

**Unitário** (`tests/unit/`): os schemas Zod do protocolo rejeitam mensagem de versão
antiga; `canalDisplay` publica a cada mudança, responde `SOLICITAR_ESTADO` **só** com
PIX ativo, emite pulso e limpa no `pagehide` — tudo com um canal falso injetado, sem
depender do `BroadcastChannel` do jsdom.

**Integração** (`tests/integration/`): dois pontos que precisam de prova.

1. `DisplayCliente` com um canal falso: `BOAS_VINDAS` → `PIX_AGUARDANDO` →
   `PIX_APROVADO` → volta sozinho ao fim de `voltaEmMs`; volta antes se chegar
   `BOAS_VINDAS`; troca de `trnGuid` reinicia o contador; silêncio de 15 s cai para
   boas-vindas.
2. `ModalPix.spec.tsx` estendido: a máquina de estados do modal emite a sequência certa
   de `onEstadoDisplay`. Seguir o padrão do arquivo — `erpFake()` injetado por
   `deps.erpClient`, `intervaloMs: 20`, sem fake timers e sem mock de `fetch`, com os
   helpers `esperarAlemDeUmTick`/`esperarPollingParar` que já existem lá.

**E2E** (`tests/e2e/display-cliente.spec.ts`, Playwright): duas páginas no **mesmo
contexto** de browser — `BroadcastChannel` atravessa páginas do mesmo contexto. Uma
insere um PIX no checkout, a outra abre `/display` **depois** que o QR já está na tela e
prova que o handshake traz a cobrança correta (é literalmente o ponto de atenção do
pedido). Contra a stack do `erp-mock`; antes de crer em qualquer falha, derrubar a
porta 3100 (AD-159).

**Manual:** `npm run dev`, `/session/start` com as credenciais do tenant de teste,
inserir um PIX, clicar no botão do monitor, e conferir nas duas telas — inclusive
fechando a aba do checkout com o QR no ar para ver o display voltar sozinho.

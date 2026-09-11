# Contrato — Canal do display do cliente (feature 015)

**Plano**: [../plan.md](../plan.md) · **Modelo**: [../data-model.md](../data-model.md) · **Data**: 2026-09-10

Este é o primeiro canal entre abas do projeto (research D2), então o contrato é explícito:
quem pode publicar, quem só escuta, o que acontece com uma mensagem que não valida, e o
que cada ponta pode assumir da outra. Módulo: `src/shared/display.ts`.

**Papéis, fixos:** a aba de checkout **publica**; a aba de display **escuta**. A única
mensagem que o display emite é `SOLICITAR_ESTADO`, que não carrega dado nenhum. O display
nunca publica estado, nunca gera cobrança e nunca consulta o ERP (FR-013/014/015).

---

## 1. Constantes

```ts
/** Nome do BroadcastChannel. Mesma origem, mesmo navegador. */
export const NOME_CANAL_DISPLAY = 'centrium-checkout-display';

/** Nome da janela em `window.open` — é o que faz o 2º clique reaproveitar (FR-028). */
export const NOME_JANELA_DISPLAY = 'centrium-checkout-display';

/** Rota da tela do cliente. */
export const ROTA_DISPLAY = '/display';

/** Pulso do checkout enquanto há cobrança na tela (FR-019). */
export const MS_PULSO_DISPLAY = 5_000;

/** Silêncio a partir do qual o display volta ao repouso (FR-020). */
export const MS_SILENCIO_ATE_REPOUSO = 15_000;
```

`MS_SILENCIO_ATE_REPOUSO` é 3× `MS_PULSO_DISPLAY` de propósito: duas mensagens perdidas
não derrubam um QR válido (research D8). Quem mexer em um dos dois precisa preservar essa
folga.

---

## 2. Tipos do estado

Definição canônica e semântica campo a campo: [../data-model.md](../data-model.md) §1.

```ts
export type EstadoDisplay =
  | { readonly tela: 'BOAS_VINDAS' }
  | { readonly tela: 'PIX_AGUARDANDO'; readonly trnGuid: string;
      readonly valorCentavos: number; readonly qrCodeFonte: string;
      readonly copiaECola: string }
  | { readonly tela: 'PIX_APROVADO'; readonly trnGuid: string;
      readonly valorCentavos: number; readonly voltaEmMs: number };
```

---

## 3. Mensagens

```ts
export type MensagemDisplay =
  | {
      readonly tipo: 'ESTADO';
      readonly estado: EstadoDisplay;
      readonly nomeLoja: string | null;
      readonly origemId: string;
      readonly emitidoEm: number;
    }
  | { readonly tipo: 'SOLICITAR_ESTADO' };
```

**Exemplo de `ESTADO` (valores sintéticos, nunca dado real de produção):**

```jsonc
{
  "tipo": "ESTADO",
  "estado": {
    "tela": "PIX_AGUARDANDO",
    "trnGuid": "00000000-0000-4000-8000-000000000001",
    "valorCentavos": 8740,
    "qrCodeFonte": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg...",
    "copiaECola": "00020126580014BR.GOV.BCB.PIX0136exemplo-sintetico-nao-pagavel..."
  },
  "nomeLoja": "Mercado Aurora",
  "origemId": "aba-3f2a9c",
  "emitidoEm": 1789077600000
}
```

`valorCentavos: 8740` é **R$ 87,40** — inteiro de centavos, nunca decimal (research D5).

---

## 4. Validação de fronteira (FR-022)

Schemas Zod no mesmo módulo, aplicados pelo display **a cada** mensagem recebida.

**Regras de aceite**

| Situação | Resultado |
|---|---|
| Mensagem válida | aplicada; `recebidoEm` atualizado |
| `tela` desconhecida (bundle mais novo na outra aba) | **descartada em silêncio** |
| Campo obrigatório ausente ou de tipo errado | **descartada em silêncio** |
| `valorCentavos` não inteiro ou negativo | **descartada em silêncio** |
| Objeto que não é `MensagemDisplay` | **descartada em silêncio** |

Descartar **não** é o mesmo que voltar ao repouso, e a diferença importa: uma aba antiga
publicando um formato que o display novo não entende não é evidência de que a cobrança
acabou. Quem tira um QR obsoleto da tela é sempre o corte por silêncio (§5), nunca a
validação. Descartar também **não** atualiza `recebidoEm` — senão uma aba emitindo lixo a
cada 5 s manteria um QR morto na tela indefinidamente.

Nenhum descarte produz toast, alerta ou texto de erro: a tela é virada ao cliente
(FR-011).

---

## 5. Publicador — `criarCanalDisplay`

```ts
export interface DepsCanalDisplay {
  /** Fábrica injetável do canal — Dependency Inversion (Constitution II). */
  readonly criarCanal?: (nome: string) => CanalBruto;
  readonly agora?: () => number;
}

export interface CanalDisplay {
  /** Publica o estado e o memoriza; (re)liga ou desliga o pulso conforme o caso. */
  readonly publicar: (estado: EstadoDisplay, nomeLoja: string | null) => void;
  /** Limpa pulso, ouvintes e fecha o canal. Idempotente. */
  readonly encerrar: () => void;
}

export function criarCanalDisplay(deps?: DepsCanalDisplay): CanalDisplay;
```

**Obrigações do publicador** (detalhadas em [../data-model.md](../data-model.md) §3):

| # | Regra | Requisito |
|---|---|---|
| C1 | `publicar` emite e memoriza como `ultimoEstado` | FR-009 |
| C2 | Responde `SOLICITAR_ESTADO` **só** com cobrança ativa; em repouso fica calado | FR-018 |
| C3 | Pulso de `MS_PULSO_DISPLAY` enquanto há cobrança; desligado no repouso | FR-019 |
| C4 | `pagehide` publica `BOAS_VINDAS` antes de a aba morrer | FR-021 |
| C5 | `encerrar()` é idempotente (`StrictMode` desmonta duas vezes) | research D9 |

`criarCanal` é o ponto de injeção que torna o teste determinístico sem depender do
`BroadcastChannel` do jsdom (research D13). `CanalBruto` é a fatia mínima da API usada —
`postMessage`, `addEventListener('message')`, `close` —, não o tipo do DOM inteiro:
depender só do que se usa é o que permite o dublê ser três linhas.

---

## 6. Ponte React — `useCanalDisplay`

```ts
/** Devolve o publicador estável para `usePixPendente`; encerra ao desmontar. */
export function useCanalDisplay(): (estado: EstadoDisplay) => void;
```

Cria o canal uma vez, lê `nomeLoja` do `sessionStore` via `nomeDaLoja(...)` e devolve uma
função estável, pronta para virar a prop `onEstadoDisplay` do `ModalPix`. É o único lugar
que conhece **ao mesmo tempo** React, o store e o canal — as três coisas que nem o modal
nem o publicador devem conhecer.

---

## 7. Ponto de contato no checkout — `ModalPix`

**Uma** prop nova, opcional:

```ts
readonly onEstadoDisplay?: (estado: EstadoDisplay) => void;
```

O `ModalPix` continua sem saber o que é aba, canal ou display: recebe uma função e a
chama, exatamente como já faz com `onAprovado`/`onAbandonado` — o que preserva a Interface
Segregation que o seu próprio TSDoc defende ("não importa `vendaStore` […] tudo chega por
prop", `ModalPix.tsx:113-115`).

**Mapa de estados** (research D11) — obrigações do `useEffect` que alimenta a prop:

| Situação interna | Publica |
|---|---|
| `abaixoDoMinimo`, `emErro`, ou `cobranca === null` | `BOAS_VINDAS` |
| cobrança gerada, `!resolvido` | `PIX_AGUARDANDO` |
| `aprovado === true` | `PIX_APROVADO` com `voltaEmMs = atrasoFechamentoMs` |
| cleanup do efeito (desmontagem) | `BOAS_VINDAS` |

Dois fatos do código atual que o contrato assume, ambos verificados:

- O retorno antecipado `if (abaixoDoMinimo) return null` (`ModalPix.tsx:361`) acontece
  **depois** de todos os hooks, então o efeito de publicação roda também nesse caminho.
- `voltaEmMs` sai de `atrasoFechamentoMs` (`ModalPix.tsx:149/183`), não da constante
  importada — assim o valor publicado acompanha o que aquela instância usa de fato,
  inclusive sob injeção de teste.

Quem liga a prop ao canal é `usePixPendente` (`ListaPagamentosAplicados.tsx:307`), que já
monta o modal e já tem a closure do pagamento.

---

## 8. Abertura da janela — `BarraSuperior`

```ts
window.open(ROTA_DISPLAY, NOME_JANELA_DISPLAY);
```

- **Sem `noopener`** — desvio consciente de `BotaoMenuGerencial.tsx:40`, justificado em
  research D3: `noopener` faz o nome da janela ser ignorado e uma aba nova nascer a cada
  clique, quebrando FR-028. Alvo é a própria origem; a comunicação é por canal, nunca por
  `window.opener`.
- O botão do monitor deixa de ser `BotaoInerte` e perde o "(ainda não disponível)" do
  rótulo (FR-027). O `BotaoInerte` **continua existindo** — a engrenagem segue sem destino
  (`BarraSuperior.tsx:83`).

---

## 9. O que este contrato **não** oferece

Explícito para que nenhuma implementação futura o assuma por engano:

- **Nenhum caminho do display para o checkout** além de `SOLICITAR_ESTADO`. O display não
  aprova, não cancela, não confirma, não altera a venda (FR-015).
- **Nenhuma garantia de entrega.** `BroadcastChannel` não confirma recebimento; é por isso
  que existem o handshake (FR-017) e o pulso (FR-019), e não um ACK.
- **Nenhum alcance fora do navegador local.** Outra máquina, outro perfil de navegador ou
  outra origem não recebem nada — coerente com a premissa declarada na spec.
- **Nenhuma persistência.** Fechadas as duas abas, não sobra estado em lugar nenhum
  (Constitution VI).

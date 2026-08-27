# Phase 1 — Data Model: Pagamento — PIX

**Feature**: `009-pagamento-pix` | **Date**: 2026-08-27 | **Plan**: `specs/009-pagamento-pix/plan.md`

Modelo de dados do módulo `src/client/domain/pix/` e do hook de query `src/client/services/pix/`. Toda grandeza monetária é `Centavos` (branded, inteiro), tipo importado de `src/client/domain/precificacao/` (feature 003) — não redefinido aqui (Constitution V). O estado de pagamento (`PagamentoAplicado`, `IntegracaoPagamento`, `StatusPagamento`) é o já definido em `specs/008-pagamento-geral/data-model.md`, §2 — esta feature não acrescenta campos ao slice de pagamento, só preenche `pixGuid` e chama as actions já existentes.

---

## 1. `CobrancaPix` — estado local do módulo, fora do slice de pagamento

Vive em um estado de UI local (ex.: `useState`/`useReducer` no componente do modal, ou um slice próprio `pixSlice` só com este único registro) — **não** é persistido em `vendaStore` de forma duradoura; existe só enquanto o modal PIX está montado. Ao fechar o modal (D11) ou ao confirmar/recusar, este estado é descartado — o que sobrevive é só o `PagamentoAplicado` já existente na feature 008.

```ts
export interface CobrancaPix {
  readonly trnGuid: string;           // gerado no cliente (research.md, D3)
  readonly idPagamento: string;       // correlaciona com PagamentoAplicado.idPagamento (008)
  readonly qrCodeImagemBase64: string; // GerarPIXOutput.Trnbase64image
  readonly copiaECola: string;         // GerarPIXOutput.Trnbase64text, decodificado (atob)
  readonly valor: Centavos;            // saldoRestante no momento da geração (research.md, D6)
}
```

**Invariante**: existe no máximo uma `CobrancaPix` por vez — o modal PIX é modal (bloqueia outras ações de pagamento enquanto aberto), então não há necessidade de lista/mapa.

---

## 2. Resultado da interpretação de status

```ts
export type StatusTransacaoLiteral = 'C' | 'A' | 'G' | 'P' | 'M' | 'X' | 'R' | 'E' | 'F' | 'O';

export type ResultadoStatusPix =
  | { readonly situacao: 'PENDENTE' }
  | { readonly situacao: 'APROVADO' }
  | { readonly situacao: 'FALHA_TERMINAL'; readonly motivo: 'EXPIRADA' | 'RECUSADA' | 'ERRO' | 'FECHADA' | 'ASSOCIACAO_REMOVIDA' | 'DESCONHECIDO' };

export function interpretarStatusPix(statusTransacao: string): ResultadoStatusPix;
```

Literais confirmados diretamente pelo usuário (`research.md`, D8, AD-102 — resolve o item 33 de `PENDENCIES.md`):

| Literal | Significado (ERP) |
|---|---|
| `'C'` | Criada |
| `'A'` | Aberta |
| `'G'` | Aguardando Pagamento |
| `'P'` | Pagamento Recebido |
| `'M'` | Pagamento Liberado Manualmente |
| `'X'` | Expirada |
| `'R'` | Recusada |
| `'E'` | Erro |
| `'F'` | Fechada |
| `'O'` | Removido Associação PIX |

- `'P'` ou `'M'` → `{ situacao: 'APROVADO' }` — **ambos** indicam que o PIX foi recebido e o Checkout pode dar continuidade (confirmado pelo usuário; `'M'` é liberação manual, tratada de forma idêntica a `'P'`).
- `'C'`, `'A'` ou `'G'` → `{ situacao: 'PENDENTE' }`.
- `'X'` → `motivo: 'EXPIRADA'`; `'R'` → `motivo: 'RECUSADA'`; `'E'` → `motivo: 'ERRO'`; `'F'` → `motivo: 'FECHADA'`; `'O'` → `motivo: 'ASSOCIACAO_REMOVIDA'`.
- Qualquer valor fora dos 10 literais → `{ situacao: 'FALHA_TERMINAL', motivo: 'DESCONHECIDO' }` — nunca `'APROVADO'` (Constitution IV, `research.md` D15), guarda defensiva mantida mesmo com a união agora fechada.

União discriminada — o call site não lê `motivo` sem checar `situacao === 'FALHA_TERMINAL'`, e nunca confunde `PENDENTE` com `APROVADO` por engano de tipo.

---

## 3. Entrada de `gerarCobrancaPix`

```ts
export interface DadosPagadorPix {
  readonly nome: string;
  readonly documento: string;   // '' quando ClienteVenda.documento é null (research.md, D7)
  readonly email: string;       // sempre '' nesta versão (gap documentado, D7)
  readonly telefone: string;    // sempre '' nesta versão (gap documentado, D7)
}

export function gerarCobrancaPix(
  formaCodigo: number,
  meioPagtoNFe: 'Pix',
  valor: Centavos,
  pagador: DadosPagadorPix,
): Promise<CobrancaPix>;
```

- `valor` é sempre `saldoRestante` no momento da chamada (`research.md`, D6) — nunca recalculado depois; se o saldo mudar entre a geração e a aprovação (não deveria, pois `podeMutarCarrinho()` já bloqueia mutação com pagamento aprovado, mas outro pagamento `APROVADO` pode ter sido aplicado em paralelo antes desta cobrança confirmar), a reconciliação é responsabilidade de `derivarValores`/`calcularSaldo` (008) no momento em que a integração confirma — este módulo não recalcula sozinho.
- Pré-condição (garantida pelo call site, não por este módulo): `saldoRestante >= ConfiguracoesPIX.MinimoPix` (`research.md`, D13) e `resolverIntegracao(...) === 'PIX_DINAMICO'` já verificado.

---

## 4. Máquina de estados da `CobrancaPix` (dentro do modal)

```text
gerarCobrancaPix() ──► GERANDO ──sucesso──► EXIBINDO_QRCODE ──polling detecta APROVADO──► (fecha modal, confirmarPagamentoIntegrado)
        │                                        │
        │ falha de rede/validação                │ polling detecta FALHA_TERMINAL
        ▼                                        ▼
     ERRO_GERACAO ──"tentar novamente"──►  GERANDO (novo TrnGUID, research.md D12)
                                                  │
                                        (aviso + recusarPagamentoIntegrado, research.md D8/D11)

                              operador fecha o modal manualmente em qualquer momento de EXIBINDO_QRCODE
                                                  │
                                                  ▼
                                    (aviso de desassociação manual + recusarPagamentoIntegrado, research.md D11)
```

- `FALHA_TERMINAL` detectada pelo polling e fechamento manual convergem para o **mesmo** tratamento (aviso + `recusarPagamentoIntegrado`, sem chamada de cancelamento) — não são dois caminhos de código distintos, é o mesmo call site acionado por dois gatilhos diferentes.
- Não existe transição de `EXIBINDO_QRCODE` de volta para `GERANDO` sem passar por um fechamento explícito — uma vez gerada, a cobrança é imutável até resolver (aprovar, falhar, ou ser abandonada).

---

## 5. Invariantes

| # | Invariante | Onde é garantida |
|---|---|---|
| J1 | No máximo uma `CobrancaPix` ativa por vez | modal é a única superfície que cria cobrança; fechar descarta antes de permitir nova |
| J2 | `interpretarStatusPix` nunca devolve `APROVADO` para um valor de `StatusTransacao` que não seja exatamente `'P'` ou `'M'` | `research.md` D8/D15 (AD-102), teste de fronteira cobrindo string vazia/valor desconhecido/os 8 literais não-aprovados |
| J3 | O polling (`refetchInterval`) só roda enquanto o modal está montado e o pagamento está `PENDENTE_INTEGRACAO` — nunca em background após fechar | `research.md` D9 |
| J4 | Toda tentativa de `GerarPIX` (inclusive retry) usa um `TrnGUID` novo, nunca reaproveitado | `research.md` D3/D12 |
| J5 | Nenhuma chamada de cancelamento é feita para uma cobrança abandonada (fechamento manual ou falha terminal detectada) | `research.md` D11, mesmo teste negativo de rede da feature 008 (`FR-018`) |
| J6 | `TrnValor` enviado é sempre `saldoRestante` convertido de `Centavos`, nunca o subtotal cheio | `research.md` D6 |

---

## 6. Relacionamento com as demais features

| Feature | Direção | O que atravessa a fronteira |
|---|---|---|
| 001 — auditoria | 009 → 001 (indireto, via 008) | nenhum evento próprio; `FORMA_PAGAMENTO_APLICADA`/`PAGAMENTO_RECUSADO` disparados pelo slice de pagamento |
| 002 — sessão/bootstrap | 002 → 009 | `ConfiguracoesPIX.MinimoPix` para a validação de D13; proxy `/api/erp/*` para `GerarPIX`/`StatusPIX` |
| 005 — cliente | 005 → 009 | `clienteAtual` (nome/documento) para `DadosPagadorPix` (`research.md`, D7, AD-100) |
| 008 — pagamento geral | 008 → 009 | veredito `PIX_DINAMICO`, `saldoRestante`, `formaCodigo`; 009 → 008: `confirmarPagamentoIntegrado(idPagamento, { pixGuid })` / `recusarPagamentoIntegrado(idPagamento, motivo)` |

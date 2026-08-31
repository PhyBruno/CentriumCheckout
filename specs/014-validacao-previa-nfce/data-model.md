# Phase 1 — Data Model: Validação Prévia da Venda no ERP (`ValidarNFCe`)

**Feature**: `specs/014-validacao-previa-nfce/` | **Data**: 2026-08-31

Esta feature não introduz entidade persistida. Tudo aqui vive em memória, no `vendaStore` (Zustand + Immer, sem `persist`), com o mesmo ciclo de vida da venda — Constitution VI.

---

## 1. Entidades

### `RetratoVenda`

A venda como ela ficaria após a inserção pretendida. **Não é um tipo novo**: é o mesmo `CheckoutFaturarNFCe` que a feature 004 envia na emissão, produzido pelo montador compartilhado `montarRetratoVenda` (`research.md`, D3).

| Campo relevante para o gate | Origem | Por que importa |
|---|---|---|
| `Empresa` | `SessaoUsuario` (feature 002) | Primeiro campo avaliado; ausente ⇒ recusa imediata |
| `clienteCodigo` | feature 005 (identificado ou default) | Cliente default + condição a prazo ⇒ recusa |
| `CondicaoPagamentoCodigo` | feature 008 (condição vigente **após** o gesto) | Define se a venda é à vista ou a prazo |
| `FormasDePagamento[]` | feature 008 **+ a forma candidata** (`research.md`, D2) | Cada item precisa de `FormaFpgUtiCar` e `FormaEntrada` para o cálculo de crediário |
| `produtos[]`, totais | feature 003 | Compõem o retrato; não são avaliados por este endpoint hoje |
| `Log` | feature 001 | Transportado por identidade com a emissão; irrelevante para o veredito |

**Invariante de construção**: o retrato enviado ao gate e o retrato enviado à emissão são produzidos pela **mesma função**, diferindo apenas na operação e na lista de pagamentos. Divergência entre eles é o modo de falha mais grave desta feature (I5).

---

### `Veredito`

União discriminada — é o que impede um call site de ler mensagens sem antes decidir o desfecho.

```ts
type Veredito =
  | { readonly resultado: 'ACEITA';       readonly avisos: readonly MensagemValidacao[] }
  | { readonly resultado: 'RECUSADA';     readonly motivos: readonly MensagemValidacao[] }
  | { readonly resultado: 'INDISPONIVEL'; readonly causa: 'REDE' | 'TIMEOUT' | 'SERVIDOR' | 'RESPOSTA_INVALIDA' };
```

| Estado | Efeito na venda | Apresentação | Auditoria |
|---|---|---|---|
| `ACEITA` com `avisos` vazio | inserção efetivada | nenhuma notificação | — |
| `ACEITA` com avisos | inserção efetivada | uma notificação de **aviso** por mensagem | — (`research.md`, D9) |
| `RECUSADA` | nenhuma mutação | uma notificação de **erro** por mensagem; lista vazia ⇒ mensagem genérica (`FR-008`) | `VALIDACAO_VENDA_RECUSADA` |
| `INDISPONIVEL` | nenhuma mutação | notificação de erro **distinta** da recusa de negócio (`FR-009`) | `VALIDACAO_VENDA_RECUSADA` com a causa |

---

### `MensagemValidacao`

```ts
interface MensagemValidacao {
  readonly id: string;          // 'Id' do ERP — hoje sempre '9999'; não é usado para lógica
  readonly severidade: SeveridadeERP;  // apenas apresentação (research.md, D4)
  readonly texto: string;       // 'Description' — repassado íntegro, sem reescrita (FR-007)
}
```

**Armadilha explícita**: `severidade` **não** decide bloqueio. No ERP real, três dos quatro casos de recusa por crédito chegam como `Warning`, e o único caso que **não** bloqueia também chega como `Warning`. Coberto por teste negativo (`quickstart.md`, cenário 3).

---

### `VeredictoVigente` (estado do slice)

```ts
interface EstadoValidacaoVenda {
  readonly vereditoVigente: Veredito | null;  // null = nenhuma autorização de finalização
  readonly emValidacao: boolean;              // exclusão mútua (FR-011)
}
```

---

## 2. Invariantes

| # | Invariante | Onde é garantida |
|---|---|---|
| I1 | Nenhuma forma/condição é efetivada sem um `Veredito` com `resultado === 'ACEITA'` obtido para **aquele** gesto | `pagamentoSlice.aplicarPagamento` só muta após `await validarInsercao(...)`; teste de integração |
| I2 | O retrato enviado ao gate contém as formas já aplicadas **mais** a candidata | `projetarPagamentos(pagamentosAtuais, candidata)` é a única entrada de `montarRetratoVenda` no caminho do gate (`FR-002`) |
| I2a | Toda inserção gera a sua própria consulta — `n` formas aplicadas numa venda ⇒ `n` consultas bem-sucedidas, nunca menos | ausência de cache/coalescência (`research.md` D10); teste que aplica três formas e conta três requisições (`FR-001a`) |
| I3 | Uma resposta com `Valido = false` **nunca** é interpretada como aceite, qualquer que seja `Type` das mensagens | `interpretarRespostaValidacao` ramifica só em `Valido` (`FR-006`) |
| I4 | Falha de comunicação nunca efetiva a inserção | `INDISPONIVEL` não tem ramo de mutação; mutation sem retry (`FR-009`) |
| I5 | O retrato validado e o retrato emitido são produzidos pela mesma função | `montarRetratoVenda` único; teste que compara os dois retratos da mesma venda |
| I6 | `vereditoVigente !== null && resultado === 'ACEITA'` é condição necessária para emitir | seletor `podeFinalizar()` consumido pela feature 004 (`FR-015`) |
| I7 | Remover um pagamento zera `vereditoVigente` | `removerPagamento` (008) chama `invalidarVeredito()` injetado (`FR-014`) |
| I8 | Enquanto `emValidacao === true`, nenhuma nova consulta é iniciada | guarda de entrada em `validarInsercao` (`FR-011`) |
| I9 | Nenhuma integração externa é iniciada antes de um veredito de aceite | ordem de `research.md` D7; teste que espiona `iniciarIntegracao` (`FR-010`) |
| I10 | Havendo qualquer pagamento aplicado, carrinho, cliente, vendedor e desconto de capa ficam congelados | extensão de I7 da feature 008 (`FR-016`, `research.md` D6) |
| I11 | O texto das mensagens do ERP chega ao operador sem reescrita | mapper só copia `Description` (`FR-007`) |

---

## 3. Fluxo de estados de uma inserção

```text
        gesto do operador (botão da 008 ou tecla da 013)
                        │
                        ▼
        ┌───────────────────────────────┐
        │ validações locais da 008      │── falha ──▶ toast local, sem consulta (FR-012)
        │ (podeAplicarForma)            │
        └───────────────┬───────────────┘
                        │ ok
                        ▼
        ┌───────────────────────────────┐
        │ emValidacao = true            │── novo acionamento ──▶ ignorado (FR-011)
        │ projeta candidata + monta     │
        │ retrato + POST ValidarNFCe    │
        └───────────────┬───────────────┘
                        │
        ┌───────────────┼────────────────────────────┐
        ▼               ▼                            ▼
   RECUSADA        INDISPONIVEL                   ACEITA
        │               │                            │
        ▼               ▼                            ▼
 toast de erro   toast de erro                 aplica pagamento
 venda intacta   (causa distinta)              + avisos em toast
 auditoria       venda intacta                 + vereditoVigente = ACEITA
                 auditoria                            │
                                                      ▼
                                      integração externa (TEF/PIX), se houver
```

Invalidação do veredito:

```text
vereditoVigente = ACEITA
        │
        ├── removerPagamento ──────────▶ null   (FR-014)
        ├── selecionarCondicao ────────▶ null   (esvazia pagamentos, I9 da 008)
        └── limparPagamentos ──────────▶ null   (fim da venda, feature 004)
```

---

## 4. Relações com outras features

| Feature | Direção | O que atravessa |
|---|---|---|
| 008 — pagamento | 014 → 008 | `validarInsercao` e `invalidarVeredito` injetados no `pagamentoSlice`; 008 → 014: a forma candidata e a condição vigente |
| 004 — finalização | 014 → 004 | `podeFinalizar()` (I6); 004 → 014: `montarRetratoVenda` generalizado (D3) |
| 013 — venda rápida | — | nenhuma ligação direta: o atalho chama `aplicarPagamento` da 008, que já contém o gate. Um veredito de recusa aborta o encadeamento da finalização automática |
| 009/010 — PIX/TEF | — | nenhuma mudança: continuam reagindo ao roteamento da 008, que agora só é alcançado após o aceite (I9) |
| 001 — auditoria | 014 → 001 | novo tipo de evento `VALIDACAO_VENDA_RECUSADA` (D9) |
| 003/005/012 — carrinho, cliente, vendedor | 003/005/012 → 014 | compõem o retrato; e passam a respeitar o congelamento de I10 |

# Data Model: Motor de desconto do Checkout (capa e item)

**Feature**: [spec.md](./spec.md) | **Pesquisa**: [research.md](./research.md)

Todo valor monetário é `Centavos` (inteiro com marca); toda quantidade é `Milesimos`. Nenhum `number` solto entra em cálculo (Constitution V). Percentuais do ERP são `number` e só viram dinheiro por `aplicarPercentual`.

## 1. Alterações em tipos existentes

### 1.1 `SnapshotPrecoProduto` (`domain/precificacao/linha.ts`)

| Campo | Tipo | Mudança |
|---|---|---|
| `precoMinimo` | `Centavos` | **NOVO**, obrigatório. `0` = sem mínimo. Vem de `SDTCheckout_GetProduto.PrecoMinimo`, convertido na fronteira Zod. |

Os demais campos (`precoBase`, `precosFaixa`, `limiaresFaixa`, `pesavelEditavel`) não mudam. `precoBase` ganha o papel de **referência do desconto** (D1).

### 1.2 `LinhaCarrinho`

**Nenhum campo novo** (D1). Muda a **semântica** de dois campos para linhas `'E'` com `precoBase > 0`:

| Campo | Antes | Depois |
|---|---|---|
| `precoUnitario` | preço digitado pelo operador | preço de referência: `precoBase`, ou o preço digitado quando ele é maior que `precoBase` |
| `descontoManual` | desconto independente | `(precoBase − preçoPraticado) × quantidade`, derivado pela barra e validado pelo slice |

Invariantes preservados: I8 (`desconto ≤ totalBruto`), I9 (total nunca armazenado), `TOTAL_MINIMO_DA_LINHA` (R$ 0,01).

### 1.3 `DescontoCapa` (`domain/pagamento/descontoCapa.ts`)

| Campo | Tipo | Mudança |
|---|---|---|
| `modo` | `'PERCENTUAL' \| 'VALOR'` | — |
| `entrada` | `number` | — (percentual em `PERCENTUAL`, `Centavos` em `VALOR`). Na capa automática pode ter mais de 1 casa decimal (D9). |
| `valorResolvido` | `Centavos` | — (fotografia no momento da aplicação) |
| `origem` | `'CONDICAO' \| 'MANUAL'` | **NOVO**, obrigatório. Alimenta o evento de auditoria (D10). |

### 1.4 `CondicaoPagamento` (`domain/pagamento/formaPagamento.ts`)

**Sem mudança de campo.** `desconto` e `descontoMaximo` já existem e já são percentuais (`pagamentoMapper.ts:58-59`). Muda só o TSDoc, que hoje afirma que eles "não" alimentam nem limitam a capa.

### 1.5 `CheckoutFaturarNFCe` (`domain/venda/montarRetratoVenda.ts`)

| Campo | Tipo | Mudança |
|---|---|---|
| `DescontoCapaValor` | `number` (reais, opcional) | **NOVO**. Ausente com a chave desligada; presente (zero quando não há capa) com ela ligada. |

`produtos[].DescontoValor` com a chave **ligada** = convênio + manual (sem parcela de capa) e `ValorTotal = totalLinha`. Desligada: soma a parcela rateada, como hoje.

### 1.6 `BootstrapPayload` (`shared/schemas/bootstrap.schema.ts`)

| Campo | Tipo | Mudança |
|---|---|---|
| `recursos` | `{ descontoCapaNoErp: boolean }` | **NOVO**, nível da raiz (ao lado de `tenant` e `codigoEmpresa`). `default({ descontoCapaNoErp: false })`, para o registro antigo do Dexie ser revalidado sem derrubar o bootstrap. |

### 1.7 `Env` (`server/config/env.ts`)

| Campo | Origem | Mudança |
|---|---|---|
| `descontoCapaNoErp` | `DESCONTO_CAPA_NO_ERP` (`'true' \| 'false'`, padrão `'false'`) | **NOVO** |

## 2. Tipos novos

### 2.1 `DescontoCapaNoRetrato` (`domain/venda/montarRetratoVenda.ts`)

```text
DescontoCapaNoRetrato =
  | { tipo: 'RATEADA',      rateio: ReadonlyMap<idLinha, Centavos> }   // chave desligada (comportamento atual)
  | { tipo: 'NO_CABECALHO', valor: Centavos }                          // chave ligada
```

Produzido **somente** por `pagamentoSlice.montarPagamentosParaPayload()`. Consumido por `montarRetratoVenda` e repassado, sem interpretação, por `useFinalizarOuSuspenderVenda` e `validacaoVendaSlice`. Substitui o campo `rateioDescontoCapa` do retorno daquela função e de `ValidacaoDeps`.

### 2.2 Resultado dos módulos puros de item (`domain/precificacao/descontoItem.ts`)

```text
ItemConsolidado   = { precoUnitario: Centavos, descontoManual: Centavos }
AjusteDeMinimo    = { desconto: Centavos, ajustado: boolean }
```

### 2.3 Recusas da capa (`domain/pagamento/descontoCapa.ts`)

`RecusaDescontoCapa` passa de `'ZERA_A_VENDA' | 'ZERA_UM_ITEM'` para `'ZERA_A_VENDA' | 'ZERA_UM_ITEM' | 'CONDICAO_SEM_DESCONTO'`. `ACIMA_DO_TETO` **não** é recusa — é ajuste (D8) e sai por um campo do resultado, não pela união.

### 2.4 Evento de auditoria (`domain/auditoria/eventos.ts`)

```text
EventoDescontoCapaAplicado = {
  tipo: 'DESCONTO_CAPA_APLICADO',
  timestamp,
  detalhes: { origem: 'CONDICAO' | 'MANUAL', modo: 'PERCENTUAL' | 'VALOR', entrada: number, valor: Centavos }
}
```

Catálogo de 20 → 21 tipos. Factory `eventoDescontoCapaAplicado` ao lado das demais.

## 3. Regras de cálculo

Notação: `B` = `precoBase`, `M` = `precoMinimo`, `P` = preço praticado, `q` = quantidade, `D` = `descontoManual`. `vinculavel` = produto `'E'` e `B > 0`.

| Regra | Fórmula | Condição |
|---|---|---|
| Desconto pelo preço | `D = (B − P) × q` | `vinculavel` e `P < B` |
| Preço sem desconto | `precoUnitario = P`, `D = 0` | `vinculavel` e `P ≥ B` |
| Preço pelo desconto | `P = B − dividirPorQuantidade(D, q)` | `vinculavel`; resultado com piso em zero |
| Limite de desconto | `L = (B − M) × q`, piso `0` | `vinculavel` e `M > 0`; sem `M`, sem limite |
| Ajuste | `D' = min(D, L)`; `ajustado = D > L` | idem |
| Mudança de quantidade | `D' = (B − P) × q'` com `P` = preço exibido | `vinculavel` |
| Total da linha | `max(0, P·q − (convênio + D))` | inalterado (`calcularTotalLinha`) |

Capa:

| Regra | Fórmula |
|---|---|
| Base | `subtotal = totalVenda(linhas)` — já líquido de convênio e manual (inalterado) |
| Teto | `T = aplicarPercentual(subtotal, descontoMaximo)`; `T = 0` quando `descontoMaximo ≤ 0` |
| Aplicação | `v = resolverDescontoCapa(modo, entrada, subtotal)`; `v > T` ⇒ ajusta para `T` |
| Capa automática | `modo = PERCENTUAL`, `entrada = min(desconto, descontoMaximo)` |
| Sem condição | sem teto (`T = null`) |

## 4. Transições de estado

### 4.1 Capa

```text
                    selecionarCondicao(c)                           aplicarDescontoCapa(m, e)
 sem capa ───────────────────────────────────► capa(CONDICAO) ◄────────────────────────────── qualquer estado
    ▲                (c.desconto > 0 e                │                (sem pagamento vivo)
    │                 c.descontoMaximo > 0)           │
    │                                                 │ digitação do operador
    │            selecionarCondicao(c')               ▼
    └──────────── descarta capa anterior ───────► capa(MANUAL) ──── v > T ──► capa(MANUAL, ajustada a T) + aviso
                 (FR-019)                              │
                                                       └── T = 0 e v > 0 ──► recusa CONDICAO_SEM_DESCONTO (nada muda)
```

`selecionarCondicao` e `aplicarDescontoCapa` seguem recusando com pagamento vivo (`pagamentosVivos() > 0`). `descartarPagamento` e `limparPagamentos` zeram condição e capa, como hoje.

### 4.2 Barra de entrada (item `'E'` vinculável)

```text
 mestre ∈ { PRECO, DESCONTO }

 digita preço     → mestre = PRECO     → desconto := (B − P) × q          (ou 0 se P ≥ B)
 digita desconto  → mestre = DESCONTO  → preço    := B − dividirPorQuantidade(D, q)
 muda quantidade  →  mantém preço exibido → desconto := (B − P) × q'
 sai do campo / confirma →  D > L ? ajusta D := L, recalcula o outro campo, avisa (uma vez)
```

## 5. Invariantes novos

| # | Invariante | Onde é garantido |
|---|---|---|
| I-D1 | Nenhuma linha `'E'` vinculável tem `D > (precoUnitario − M) × q` quando `M > 0` | `descontoItem.ts` + guarda em `carrinhoSlice` (`inserirItem`, `atualizarItem`) |
| I-D2 | `P` exibido e `D` armazenado só divergem pelo arredondamento de 1 centavo por unidade | `descontoItem.ts`; teste de propriedade |
| I-D3 | A capa nunca excede o teto da condição escolhida (centavos) | `pagamentoSlice.aplicarDescontoCapa` |
| I-D4 | `selecionarCondicao` e a capa resultante são gravados no mesmo `set` | `pagamentoSlice.selecionarCondicao` |
| I-D5 | Retrato validado e retrato emitido recebem a **mesma** `DescontoCapaNoRetrato` | `montarPagamentosParaPayload` é o único produtor (estende I5 da 014) |
| I-D6 | Com a chave desligada, o corpo enviado é idêntico ao anterior à feature (sem `DescontoCapaValor`) | teste de contrato do retrato |
| I-D7 | Uma edição de item é aplicada por inteiro ou não é aplicada | `carrinhoSlice.atualizarItem` |

# Phase 1 — Data Model: Pagamento (Geral)

**Feature**: `008-pagamento-geral` | **Date**: 2026-08-26 | **Plan**: `specs/008-pagamento-geral/plan.md`

Modelo de dados do slice `pagamento` e dos tipos do domínio puro `src/client/domain/pagamento/`. Toda grandeza monetária é `Centavos` (branded, inteiro) e toda quantidade é `Milesimos` — os tipos vêm de `src/client/domain/precificacao/` (feature 003), **não** são redefinidos aqui (Constitution V, AD-071).

---

## 1. Entidades de catálogo (leitura, vindas do bootstrap)

Derivadas de `SessaoUsuario.CondicoesDePagamento[]` de `GetSessao`, expostas ao JS por `GET /api/bootstrap` (ver `research.md`, D1). São **imutáveis** dentro de uma venda.

### `CondicaoPagamento`

| Campo | Tipo | Origem no contrato | Nota |
|---|---|---|---|
| `codigo` | `number` | `CondicaoCodigo` | chave; vai em `CheckoutFaturarNFCe.CondicaoPagamentoCodigo` |
| `descricao` | `string` | `CondicaoDescricao` | rótulo exibido |
| `prazo` | `number` | `CondicaoPrazo` | dias; não usado por esta feature, preservado para a 004 |
| `minimoEntrada` | `Centavos` | `CondicaoMinimoEntrada` | convertido de `double` na fronteira Zod |
| `desconto` | `number` | `CondicaoDesconto` | percentual da condição; **não** é o desconto manual de capa |
| `descontoMaximo` | `number` | `CondicaoDescontoMaximo` | teto da condição; **não** limita o desconto manual (`FR-015` é sem teto) |
| `formas` | `readonly FormaPagamento[]` | `CondicaoFormasDePagamento[]` | pelo menos uma para a condição ser selecionável |

### `FormaPagamento`

| Campo | Tipo | Origem no contrato | Nota |
|---|---|---|---|
| `codigo` | `number` | `FormaCodigo` | vai em `FormasDePagamento[].FormaCodigo` |
| `descricao` | `string` | `FormaDescricao` | rótulo exibido |
| `entrada` | `string` | `FormaEntrada` | flag de entrada do ERP; ecoado, não interpretado |
| `meioPagtoNFe` | `MeioPagtoNFe` | `FormaMeioPagtoNFe` | **fonte de verdade do roteamento** (`PAY-08`) |
| `integracaoCartao` | `'1' \| '2' \| ''` | `FormaIntegracaoCartao` | `1` = TEF, `2` = POS/avulso (AD-078); ecoado, não interpretado nesta fase (`research.md`, D6) |
| `tipoTransacaoTEF` | `string` | `FormaTipoTransacaoTEF` | consumido pela feature 010; ecoado aqui |
| `fpgUtiCar` | `string` | `FormaFpgUtiCar` | elegibilidade de vale devolução; **vazio = elegível** (AD-048) |

### `MeioPagtoNFe`

União fechada sobre o domínio `NFCe_FormaPagto` da KB, confirmado por AD-023 (o typo `ProgaramaFidelidade` é reproduzido tal como existe no ERP — corrigi-lo aqui produziria um valor que nunca casa):

```ts
type MeioPagtoNFe =
  | 'Dinheiro' | 'Cheque' | 'CartaoCredito' | 'CartaoDebito' | 'CreditoLoja'
  | 'ValeAlimentacao' | 'ValeRefeicao' | 'ValePresente' | 'ValeCombustivel'
  | 'DuplicataMercantil' | 'BoletoBancario' | 'DepositoBancario' | 'Pix'
  | 'TransferenciaBancaria' | 'ProgaramaFidelidade' | 'PixEstatico'
  | 'CreditoEmLoja' | 'PagamentoNaoInformado' | 'SemPagamento'
  | 'PagamentoPosterior' | 'Outros';
```

Um valor fora dessa união reprovado pelo Zod de fronteira **não derruba a tela**: a forma é descartada do catálogo com um aviso no console, para que um valor novo cadastrado no ERP não impeça o operador de vender pelas demais formas.

---

## 2. Entidades de estado (slice `pagamento`)

Vivem em memória, sem `persist`, mesmo ciclo de vida do carrinho e da auditoria (Constitution VI, AD-006).

### `PagamentoAplicado`

| Campo | Tipo | Nota |
|---|---|---|
| `idPagamento` | `string` | identidade local (uuid), estável para remoção e para o React key |
| `formaCodigo` | `number` | referência à `FormaPagamento` do catálogo |
| `meioPagtoNFe` | `MeioPagtoNFe` | **cópia congelada** no momento da aplicação — não referencia o catálogo ao vivo |
| `integracaoCartao` | `'1' \| '2' \| ''` | cópia congelada, ecoada no payload |
| `valorAplicado` | `Centavos` | o que quita a venda; é o que vai em `FormaValor` |
| `valorRecebido` | `Centavos \| null` | só para `Dinheiro`; `null` nas demais formas (`research.md`, D3) |
| `integracao` | `IntegracaoPagamento` | veredito de `resolverIntegracao` no momento da aplicação |
| `status` | `StatusPagamento` | ver máquina de estados, §4 |
| `dadosTEF` | `DadosTEF \| null` | preenchido pela feature 010; opaco para esta feature |
| `pixGuid` | `string \| null` | preenchido pela feature 009; opaco para esta feature |
| `ticketDevolucao` | `string \| null` | código do vale vinculado a **esta** forma (`FormasDePagamento[].TicketDevolucao`) |

**Regra de fronteira** (mesma da feature 003, `.specs/codebase/ARCHITECTURE.md`): `meioPagtoNFe` e `integracaoCartao` são copiados para dentro do `PagamentoAplicado` na aplicação. O pagamento nunca resolve seus dados olhando o catálogo depois — um bootstrap revalidado no meio da venda não pode reclassificar um pagamento já aprovado.

### `StatusPagamento`

```ts
type StatusPagamento = 'PENDENTE_INTEGRACAO' | 'APROVADO' | 'RECUSADO';
```

### `IntegracaoPagamento`

```ts
type IntegracaoPagamento = 'NENHUMA' | 'TEF' | 'PIX_DINAMICO';
```

### `DescontoCapa`

| Campo | Tipo | Nota |
|---|---|---|
| `modo` | `'PERCENTUAL' \| 'VALOR'` | escolha do operador (`FR-015`) |
| `entrada` | `number \| Centavos` | percentual (`number`) quando `modo = 'PERCENTUAL'`; `Centavos` quando `'VALOR'` |
| `valorResolvido` | `Centavos` | sempre em centavos — é este valor que rateia; recalculado quando o subtotal muda |

O estado guarda **um único** `DescontoCapa | null`. Aplicar de novo substitui; não acumula.

### `ValeDevolucaoAplicado`

| Campo | Tipo | Nota |
|---|---|---|
| `codigo` | `string` | o que o operador digitou; vai em `FormasDePagamento[].TicketDevolucao` |
| `valor` | `Centavos` | `ValorTicket` da resposta, convertido na fronteira |
| `idPagamento` | `string` | a forma à qual foi vinculado |

Consumido uma única vez, na aplicação — **nunca** revalidado na finalização (`FR-009`, `PAY-06`).

### `SaldoPagamento` (derivado, nunca armazenado)

| Campo | Tipo | Fórmula |
|---|---|---|
| `totalLiquido` | `Centavos` | subtotal do carrinho − `descontoCapa.valorResolvido` |
| `totalAplicado` | `Centavos` | `Σ valorAplicado` dos pagamentos com `status = 'APROVADO'` |
| `saldoRestante` | `Centavos` | `max(0, totalLiquido − totalAplicado)` |
| `troco` | `Centavos` | ver §6 |

Nada disso é gravado no estado — é seletor puro sobre carrinho + pagamentos (invariante I9 da feature 003, mesmo princípio).

---

## 3. Invariantes

| # | Invariante | Onde é garantida |
|---|---|---|
| I1 | Existe no máximo **uma** condição de pagamento selecionada por venda | tipo do slice (`condicaoSelecionada: CondicaoPagamento \| null`), `research.md` D2 |
| I2 | Existe no máximo **um** pagamento com `meioPagtoNFe === 'Dinheiro'` | `podeAplicarForma` (domínio puro), `FR-013`/AD-036 |
| I3 | `valorRecebido !== null` **se e somente se** `meioPagtoNFe === 'Dinheiro'` | construtor de `PagamentoAplicado` |
| I4 | `troco > 0` só é possível quando existe pagamento em dinheiro | `calcularSaldo`, `FR-012` |
| I5 | `Σ valorAplicado` (aprovados) nunca excede `totalLiquido` | `aplicarPagamento` recusa valor acima do `saldoRestante`, exceto o excedente em dinheiro, que vira troco e **não** entra em `valorAplicado` |
| I6 | Um pagamento com `integracao !== 'NENHUMA'` e `status = 'APROVADO'` é **irreversível** | `removerPagamento`, `research.md` D11 |
| I7 | `podeMutarCarrinho() === false` sempre que existir algum pagamento `APROVADO` | seletor exposto à feature 003, AD-030/`CART-09` |
| I8 | `descontoCapa.valorResolvido <= subtotal` do carrinho | guarda de entrada de `aplicarDescontoCapa`, `research.md` D8 passo 1 |
| I9 | Ao trocar a condição de pagamento, a lista de pagamentos é esvaziada | `selecionarCondicao`, `research.md` D2 |
| I10 | Nenhum caminho de código invoca impressão para `DuplicataMercantil` | teste negativo, `FR-018`/AD-064 |
| I11 | Nenhum pagamento entra na lista sem um veredito favorável da validação prévia obtido **para aquele gesto** | `aplicarPagamento` só muta após `await validarInsercao(...)`; `FR-019`, feature 014 (I1) |
| I12 | Havendo qualquer pagamento aplicado, além do carrinho (I7) também ficam congelados **cliente, vendedor e desconto de capa** | guardas de `aplicarDescontoCapa` e predicado exposto às features 005/012; `FR-023`, AD-113 |

---

## 4. Máquina de estados de `PagamentoAplicado`

```text
                   resolverIntegracao === 'NENHUMA'
   (aplicação) ─────────────────────────────────────────► APROVADO
        │                                                    │
        │  resolverIntegracao ∈ {TEF, PIX_DINAMICO}          │ removerPagamento
        ▼                                                    │ (só se integracao = NENHUMA)
  PENDENTE_INTEGRACAO ──── aprovação da feature 009/010 ──►  │
        │                                                  (removido)
        └──── recusa da feature 009/010 ────► RECUSADO ────► (removido automaticamente)
```

- `PENDENTE_INTEGRACAO` **não** conta para `totalAplicado` nem bloqueia o carrinho — só um pagamento aprovado o faz (`FR-004`/`FR-005`: "só registra o pagamento após a aprovação").
- `RECUSADO` é um estado terminal e efêmero: emite `PAGAMENTO_RECUSADO` na auditoria (`FR-017`) e é retirado da lista, para que o operador possa tentar outra forma.
- Não há transição de `APROVADO` para `RECUSADO` — um estorno é operação do ERP/adquirente, fora do escopo do Checkout.

---

## 5. Algoritmo — rateio do desconto de capa (divisão igual com clamp)

Implementa `FR-016`/`PAY-10` AC3 com o critério escolhido pelo usuário em 2026-08-26 (AD-098, ver `research.md` D8). Entrada: `descontoCapa: Centavos` e as linhas **ativas** do carrinho (canceladas não participam).

```text
pré-condição: descontoCapa <= Σ totalLiquido(linhas)   // garantida por I8

elegiveis  := linhas ativas
fixadas    := {}
restante   := descontoCapa

repetir:
    parcelas := distribuirPorMaiorResto(restante, pesosIguais(|elegiveis|))
    estouro  := { L ∈ elegiveis : parcelas[L] > totalLiquido(L) }
    se estouro = ∅:
        devolver fixadas ∪ parcelas
    para cada L ∈ estouro:
        fixadas[L] := totalLiquido(L)
        restante   := restante − totalLiquido(L)
        elegiveis  := elegiveis \ {L}
```

- `distribuirPorMaiorResto` e `pesosIguais` vêm de `src/client/domain/precificacao/dinheiro.ts` (feature 003) — o método do maior resto **não** é reimplementado (AD-072).
- Terminação: cada iteração remove ao menos uma linha de `elegiveis`, e a pré-condição garante que o conjunto nunca se esvazia antes de `restante` zerar.
- Pós-condições testadas: `Σ resultado === descontoCapa` e `resultado[L] <= totalLiquido(L)` para toda linha.
- O resultado é convertido em `DescontoValor` por item na montagem do payload (feature 004). `DescontoPercentual` é enviado como `0` para o desconto de capa — o rateio é sempre expresso em valor absoluto, porque o percentual por item não reproduziria o mesmo centavo.

**Caso de borda coberto por teste**: 3 itens de `70,00 / 29,00 / 1,00` com desconto de capa de `10,00` → primeira passada dá `3,34 / 3,33 / 3,33`; a terceira linha estoura (`3,33 > 1,00`), é fixada em `1,00`, e os `9,00` restantes são redivididos entre as duas primeiras → `4,50 / 4,50 / 1,00`, soma exata de `10,00`.

---

## 6. Algoritmo — saldo e troco

```text
totalLiquido  := subtotalCarrinho − (descontoCapa?.valorResolvido ?? 0)
aprovados     := pagamentos com status = APROVADO
totalAplicado := Σ aprovados.valorAplicado
saldoRestante := max(0, totalLiquido − totalAplicado)

dinheiro := aprovados encontrado com meioPagtoNFe = 'Dinheiro'   // no máximo um, por I2
troco    := dinheiro ? max(0, dinheiro.valorRecebido − dinheiro.valorAplicado) : 0
```

Na aplicação de um pagamento em dinheiro, o slice deriva os dois valores a partir do que o operador digitou (`valorRecebido`) e do saldo daquele instante:

```text
valorAplicado := min(valorRecebido, saldoRestanteNoMomento)
```

Ou seja, o excedente **nunca** entra em `valorAplicado` — ele existe apenas como troco exibido. Para qualquer forma diferente de `Dinheiro`, `valorRecebido` é `null` e `valorAplicado` é exatamente o valor informado/autorizado, limitado ao `saldoRestante` (`FR-012`: nenhuma outra forma gera troco).

---

## 7. Resultado da validação de ticket

```ts
type ResultadoTicket =
  | { readonly valido: true;  readonly valor: Centavos }
  | { readonly valido: false; readonly mensagem: string };
```

Construído por `interpretarRespostaTicket` a partir de `ValidaTicketDevolucaoOutput` (`ValorTicket`, `Valido`) conforme AD-101 (`research.md`, D9 — corrige o fallback de `Mensagem` que AD-099 exigia): usa só `Valido`, sempre preenchido pelo procedure. União discriminada — o call site não consegue ler `valor` sem antes checar `valido`.

---

## 8. Relacionamento com as demais features

| Feature | Direção | O que atravessa a fronteira |
|---|---|---|
| 001 — auditoria | 008 → 001 | 5 eventos via `registrarEventoAuditoria` (`research.md`, D13) |
| 002 — sessão/bootstrap | 002 → 008 | `CondicoesDePagamento[]`, `ConfiguracoesTEF.TEFAtivo`, `ConfiguracoesPIX.UtilizaCentriumPAG` |
| 003 — carrinho | 008 → 003 | `podeMutarCarrinho()` injetado; 003 → 008: subtotal e linhas ativas para o rateio |
| 004 — finalização | 008 → 004 | `CondicaoPagamentoCodigo`, `FormasDePagamento[]` montados e o rateio do desconto de capa |
| 007 — layout mobile | 007 → 008 | `plataforma` nas `CapacidadesPagamento` (exclusão de TEF, AD-074) |
| 009 — PIX | 008 → 009 | veredito `PIX_DINAMICO`; 009 → 008: aprovação/recusa e `FormaPixGUID` |
| 010 — TEF | 008 → 010 | veredito `TEF`; 010 → 008: aprovação/recusa e os campos `TEF*` |

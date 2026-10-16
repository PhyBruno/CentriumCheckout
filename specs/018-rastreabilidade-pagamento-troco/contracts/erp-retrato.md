# Contract: o que o ERP passa a receber (`ValidarNFCe` / `FaturarNFCe`)

Fonte do SDT: `Fluxograma - Diagrama - Alinhamentos/ApiCentriumOAuth.yaml:1640` (`CheckoutFaturarNFCe.FormasDePagamento_FormasDePagamentoItem`). Nenhum campo novo no corpo, só mudança de valor e de conteúdo do `Log`.

## `FormasDePagamento[].FormaValor`

Venda de R$ 87,00, cliente entrega R$ 100,00 em dinheiro:

```jsonc
// antes
{ "FormaMeioPagtoNFe": "01", "FormaValor": 87.00, ... }
// depois
{ "FormaMeioPagtoNFe": "01", "FormaValor": 100.00, ... }
```

Split cartão R$ 60,00 + dinheiro recebido R$ 50,00 numa venda de R$ 100,00:

```jsonc
[
  { "FormaMeioPagtoNFe": "03", "FormaValor": 60.00, "TEFPagId": "..." },
  { "FormaMeioPagtoNFe": "01", "FormaValor": 50.00 }
]
// Σ FormaValor = 110,00; troco esperado na NFCe = 10,00
```

**Expectativa sobre o ERP**, a verificar antes do merge da US3 (research D1):
- `ValidarNFCe` aceita, porque não confere a soma.
- `FaturarNFCe` grava a NFCe com troco = `Σ FormaValor − total`.

## `Log` — evento `FORMA_PAGAMENTO_REMOVIDA`

```jsonc
// antes
{ "tipo": "FORMA_PAGAMENTO_REMOVIDA", "timestamp": "...", "detalhes": { "formaPagamento": "Cartão Débito" } }
// depois — TEF estornado
{ "tipo": "FORMA_PAGAMENTO_REMOVIDA", "timestamp": "...",
  "detalhes": { "formaPagamento": "Cartão Débito", "valor": 5000, "motivo": "ESTORNO_TEF", "tefPagId": "a1b2c3" } }
// depois — dinheiro descartado pelo Limpar
{ "tipo": "FORMA_PAGAMENTO_REMOVIDA", "timestamp": "...",
  "detalhes": { "formaPagamento": "Dinheiro", "valor": 3000, "motivo": "LIMPAR" } }
```

`valor` em centavos inteiros, como nos demais eventos de pagamento do `Log`. `tefPagId` é o mesmo valor que vai em `TEFPagId` no faturamento.

# Contract: polling de `GetStatusSistema`

Contrato de **consumo** via proxy `/api/erp/*` do BFF (feature 002), mesmo padrão de autenticação dos demais endpoints do ERP. Fonte: `Fluxograma - Diagrama - Alinhamentos/APICentriumOAuth.yaml`, semântica confirmada por decisão direta do usuário em AD-088 (`.specs/project/STATE.md`).

---

## `GET /api/erp/GetStatusSistema`

### Parâmetros

| Parâmetro | Tipo | Origem |
|---|---|---|
| `Empresa` | `int64` | Injetado pelo BFF |
| `Cadmaqcod` | `string` | `SessaoUsuario.CadMaqCod` (retornado por `GetSessao`, bootstrap da feature 002) — **não** é um valor arbitrário do cliente (AD-088) |

### Resposta

```jsonc
0   // integer puro, sem wrapper
```

> Valor sintético.

### Semântica (AD-075, corrigida por AD-080, confirmada em produção por AD-088)

| Valor | Significado | Ação do Checkout |
|---|---|---|
| `0` | Nada do que foi enviado em `GetSessao` mudou desde a última captura pelo Checkout | Nenhuma ação |
| `>= 1` | Algo mudou (o significado específico de valores acima de `1` não importa para esta decisão binária) | Rechama `GetSessao` por completo (`refetchBootstrap()`, feature 002) para atualizar `SessaoUsuario` local |

### Guarda de disparo (`FR-013`)

| Condição | Polling |
|---|---|
| Carrinho vazio **e** nenhum cliente identificado ("entre vendas") | Ativo — chamada a cada 60 segundos |
| Carrinho com pelo menos 1 item **ou** cliente já identificado ("venda ativa") | Suspenso — nenhuma chamada nesse intervalo |

A guarda lê estado das features 003 (carrinho) e 005 (cliente) — este módulo não muta nenhum dos dois, só observa para decidir se o intervalo deve rodar.

### Erros

| Situação | Comportamento |
|---|---|
| Falha de rede/timeout | O ciclo de polling simplesmente tenta de novo no próximo intervalo de 60s — não é uma operação crítica como `FaturarNFCe`, não há necessidade de confirmação manual nem de estado de erro visível ao operador |
| `401` | Tratado no BFF (renovação silenciosa, feature 002) — invisível a este módulo |

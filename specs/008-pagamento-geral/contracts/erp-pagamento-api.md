# Contract: consumo da API do ERP para pagamento

Como a feature 008 conversa com o ERP. Toda chamada passa pelo proxy autenticado `/api/erp/*` do BFF (feature 002), que injeta `Authorization` e `Empresa` no servidor — o JS **nunca** monta esses cabeçalhos (`.specs/codebase/ARCHITECTURE.md`, AD-019/AD-022).

Fonte do contrato: `Fluxograma - Diagrama - Alinhamentos/APICentriumOAuth.yaml`. Toda resposta é validada com Zod na fronteira antes de entrar no domínio (Constitution IV).

---

## 1. Catálogo de condições e formas — `GET /api/bootstrap`

**Não existe endpoint dedicado de formas de pagamento** (`research.md`, D1 → AD-097). O catálogo vem embutido no payload de sessão.

```jsonc
// GET /api/bootstrap → trecho relevante (valores sintéticos)
{
  "codigoEmpresa": 1,
  "tenant": "exemplo",
  "SessaoUsuario": {
    "CondicoesDePagamento": [
      {
        "CondicaoCodigo": 1,
        "CondicaoDescricao": "A VISTA",
        "CondicaoPrazo": 0,
        "CondicaoMinimoEntrada": 0,
        "CondicaoDesconto": 0,
        "CondicaoDescontoMaximo": 0,
        "CondicaoFormasDePagamento": [
          { "FormaCodigo": 1, "FormaDescricao": "DINHEIRO",  "FormaEntrada": "S",
            "FormaMeioPagtoNFe": "Dinheiro",      "FormaIntegracaoCartao": "",
            "FormaTipoTransacaoTEF": "",          "FormaFpgUtiCar": "" },
          { "FormaCodigo": 2, "FormaDescricao": "CARTAO CREDITO", "FormaEntrada": "N",
            "FormaMeioPagtoNFe": "CartaoCredito", "FormaIntegracaoCartao": "1",
            "FormaTipoTransacaoTEF": "CREDITO",   "FormaFpgUtiCar": "VDV" },
          { "FormaCodigo": 3, "FormaDescricao": "PIX",       "FormaEntrada": "S",
            "FormaMeioPagtoNFe": "Pix",           "FormaIntegracaoCartao": "",
            "FormaTipoTransacaoTEF": "",          "FormaFpgUtiCar": "" }
        ]
      }
    ],
    "ConfiguracoesTEF": { "TEFAtivo": true },
    "ConfiguracoesPIX": { "UtilizaCentriumPAG": true, "MinimoPix": 0, "TempoEspera": 10 }
  }
}
```

**Política de cache**: TanStack Query, `staleTime: 30 * 60 * 1000` (30 min, `PAY-01`). É a única query desta feature — todo o resto do catálogo é derivado dela por seletor puro.

**Contrato de conversão da fronteira Zod**:

| Campo do ERP | Tipo no contrato | Tipo no domínio | Conversão |
|---|---|---|---|
| `CondicaoMinimoEntrada` | `number/double` | `Centavos` | `Math.round(v * 100)` |
| `CondicaoDesconto`, `CondicaoDescontoMaximo` | `number/double` | `number` (percentual) | sem conversão — não é dinheiro |
| `FormaMeioPagtoNFe` | `string` | `MeioPagtoNFe` | união fechada; valor desconhecido → forma descartada com aviso, sem derrubar a tela (`data-model.md`, §1) |
| `FormaIntegracaoCartao` | `string` | `'1' \| '2' \| ''` | `''` quando ausente/`null` |
| `FormaFpgUtiCar` | `string` | `string` | `''` quando ausente — e `''` significa **elegível** (AD-048) |

Nenhum `double` de dinheiro atravessa a fronteira: a conversão para `Centavos` acontece no schema, não no componente.

**Flags de disponibilidade** (`FR-002`/`FR-003`): `ConfiguracoesTEF.TEFAtivo` e `ConfiguracoesPIX.UtilizaCentriumPAG` chegam pelo mesmo payload e alimentam as `CapacidadesPagamento` injetadas no domínio.

---

## 2. Validação de vale devolução — `POST /api/erp/ValidaTicketDevolucao`

**Request** (`ValidaTicketDevolucaoInput`, yaml linhas 772-778):

```jsonc
{ "Empresa": 1, "ticketDevolucao": "TCK-000000-EXEMPLO" }
```

`Empresa` é injetado pelo BFF a partir do `codigoEmpresa` persistido (AD-019) — o JS envia apenas `ticketDevolucao`.

**Response** (`ValidaTicketDevolucaoOutput`, yaml linhas 668-676):

```jsonc
{ "ValorTicket": 25.50, "Valido": true, "Mensagem": "Ticket Válido" }
```

**Interpretação** (AD-099, `research.md` D9):

```ts
// src/client/domain/pagamento/valeDevolucao.ts
if (resposta.Valido !== undefined) return resposta.Valido;
return resposta.Mensagem === 'Ticket Válido';
```

> ⚠️ **Pendência aberta (item 32 de `.specs/project/PENDENCIES.md`, AD-099):** o campo `Valido` **existe** neste contrato, mas AD-023 — a partir de inspeção da KB real (`PCheckout_ValidaTicketDevolucao` → `PValidaTicketNfCe.Call`) — afirmava que a validade só era expressa pelo literal em `Mensagem`. Enquanto o ERP não confirmar que `Valido` é efetivamente preenchido, o fallback acima é obrigatório. **Não** remova o fallback nem o teste que o cobre.

`ValorTicket` (`double`) é convertido para `Centavos` no schema Zod. Este endpoint é chamado **uma única vez por vale**, no momento da aplicação — a finalização nunca o chama de novo (`FR-009`, `PAY-06`).

---

## 3. Contribuição para `POST /api/erp/FaturarNFCe`

Esta feature **não chama** `FaturarNFCe` — quem chama é a feature 004. O que ela entrega é a parte de pagamento do payload, através do contrato de domínio (`pagamento-domain-api.md`, `montarPagamentosParaPayload`).

```jsonc
// CheckoutFaturarNFCe — só os campos que a feature 008 preenche (valores sintéticos)
{
  "CondicaoPagamentoCodigo": 1,          // escalar: UMA condição por venda (research.md, D2)
  "FormasDePagamento": [
    { "FormaCodigo": 1, "FormaMeioPagtoNFe": "Dinheiro", "FormaValor": 30.00,
      "FormaIntegracaoCartao": "", "TicketDevolucao": "" },
    { "FormaCodigo": 2, "FormaMeioPagtoNFe": "CartaoCredito", "FormaValor": 70.00,
      "FormaIntegracaoCartao": "1", "TEFidentificacao": 123456, "TEFCNPJ": "00000000000000",
      "TEFBandeira": "EXEMPLO", "TEFNumeroAutorizacao": "000000", "TEFTipoIntegracao": "1",
      "TicketDevolucao": "" }
  ],
  "produtos": [
    // DescontoValor por item = parcela do rateio do desconto de capa (data-model.md, §5)
    { "sequencial": 1, "codigoProduto": "EXEMPLO-A", "quantidade": 1, "precoUnitario": 70.00,
      "DescontoPercentual": 0, "DescontoValor": 4.50, "ValorBruto": 70.00, "ValorTotal": 65.50 }
  ]
}
```

**Regras de montagem que este contrato fixa:**

| Regra | Motivo |
|---|---|
| `Σ FormaValor` é exatamente o total líquido da venda | não há campo de troco no contrato — o excedente em dinheiro fica fora do payload (`research.md`, D3) |
| Só pagamentos com `status = 'APROVADO'` entram em `FormasDePagamento[]` | `FR-004`/`FR-005` — pendente e recusado nunca são registrados |
| `CondicaoPagamentoCodigo` é escalar | contrato (yaml linha 1431); split é entre formas, não entre condições |
| O desconto de capa vira `DescontoValor` **por item**, nunca um campo de cabeçalho | **não existe campo de desconto de capa** em `CheckoutFaturarNFCe` — o rateio de `FR-016` não é preferência de design, é a única forma de expressar o desconto no contrato |
| `DescontoPercentual` do rateio é sempre `0` | o percentual por item não reproduz o mesmo centavo do rateio (`data-model.md`, §5) |
| `TicketDevolucao` vai na forma à qual o vale foi vinculado | o campo é por-forma no contrato (yaml linha 1545), não por-venda |
| Campos `TEF*` e `FormaPixGUID` são preenchidos pelas features 010 e 009 | esta feature os transporta como opacos (`data-model.md`, §2) |
| Nenhum documento é gerado para `DuplicataMercantil` | `FR-018`/AD-064 — garantido por teste negativo |

---

## 4. O que esta feature **não** chama

| Endpoint | Quem chama | Por quê não aqui |
|---|---|---|
| `POST /GerarPIX`, `GET /StatusPIX` | feature 009 | esta feature só emite o veredito `PIX_DINAMICO` (`research.md`, D5) |
| integração TEF local (HTTP na máquina do PDV) | feature 010 | protocolo é bloqueio deliberado, item 25 de `PENDENCIES.md` (AD-037); não bloqueia este design (`research.md`, D14) |
| `POST /FaturarNFCe` | feature 004 | esta feature entrega os dados, não faz o envio |

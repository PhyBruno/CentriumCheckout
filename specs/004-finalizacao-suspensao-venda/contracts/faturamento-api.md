# Contract: consumo de `FaturarNFCe` (finalização e suspensão)

Contrato de **consumo**, não de exposição — o Checkout não publica API própria. A chamada passa pelo proxy autenticado `/api/erp/*` do BFF (feature 002), que injeta `Authorization` e `Empresa` no servidor. O frontend nunca chama o ERP diretamente nem manipula `access_token`.

Fonte dos campos: `Fluxograma - Diagrama - Alinhamentos/APICentriumOAuth.yaml` (schema `CheckoutFaturarNFCe`/`CheckoutFaturarNFCeOutput`), confirmado campo a campo contra o código-fonte real de `PCheckout_FaturarNFCe` na KB do GenExus (AD-024).

---

## `POST /api/erp/FaturarNFCe`

> **Pré-condição (2026-08-31, AD-113):** esta chamada só acontece com um **veredito favorável vigente** da validação prévia (feature 014), obtido na última inserção de pagamento aceita — não há nova consulta aqui. Vale para `FATURAR`; `SUSPENDER` não tem essa pré-condição.
>
> **Origem do corpo (2026-08-31, AD-111):** o objeto abaixo é produzido por `montarRetratoVenda` (`src/client/domain/venda/`), o **mesmo** módulo que monta o corpo de `ValidarNFCe` — ver `specs/014-validacao-previa-nfce/contracts/erp-validacao-api.md`. Os dois retratos diferem apenas em `SuspenderOuFaturar`. O nome anterior deste módulo (`montarPayloadFaturarNFCe`) não existe mais.

### Corpo da requisição — `CheckoutFaturarNFCe`

```jsonc
{
  "Empresa": 1,                        // injetado pelo BFF
  "SuspenderOuFaturar": "FATURAR",     // ou "SUSPENDER" — mesmo endpoint, campo decide a operação
  "NumeroNota": 0,                     // 0 = venda nova; != 0 = rascunho/DAV pré-existente (identidadeVenda.numeroNota)
  "CadSerieNFCe": "1",                 // sempre SessaoUsuario.CadSerieNFCe (AD-034) — nunca escolhido pelo operador
  "vendedorCodigo": 42,                // vendedor selecionado no modal (feature 012, VEND-05) — nunca o operador logado
  "produtos": [
    {
      "sequencial": 1,
      "codigoProduto": "001234",
      "quantidade": 3.0,
      "precoUnitario": 10.00,
      "DescontoPercentual": 0,
      "DescontoValor": 0,
      "ValorBruto": 30.00,
      "UDM": "UN",
      "ValorTotal": 30.00
    }
  ],
  "Log": "[{\"tipo\":\"VENDA_INICIADA\",\"timestamp\":\"2026-08-26T17:32:07.123Z\",\"detalhes\":{\"origem\":\"NOVA\"}}, ...]"
  // demais campos de pagamento — feature 008, fora do escopo deste plano
}
```

> Valores sintéticos, não dados de produção. Campos de `produtos[]` e de pagamento são preenchidos por outras features (003 e 008 respectivamente) — esta feature só monta `Empresa`, `SuspenderOuFaturar`, `NumeroNota`, `CadSerieNFCe`, `vendedorCodigo` e `Log`, e repassa os demais sem alterar.

### Resposta — sucesso (2xx)

```jsonc
{
  "NotaFiscal": {
    "PDFImpressao": "JVBERi0xLjQKJc...",   // base64 do PDF já gerado pelo ERP
    "XMLImpressao": "<NFe>...</NFe>"        // XML cru, usado só na impressão direta (contracts/impressao-local-api.md)
  }
}
```

> Valores sintéticos. Não existe "impressão direta pelo servidor" nem opção de PDF configurável no ERP — a resposta sempre traz os dois arquivos prontos; o Checkout decide como apresentá-los (`data-model.md`, §5).

### Validação de fronteira (Zod) — `src/shared/schemas/faturarNFCe.schema.ts`

Obrigatória (Constitution IV). Valida que `NotaFiscal.PDFImpressao`/`XMLImpressao` são strings não-vazias. Uma resposta 2xx sem esse shape é tratada como `falha-negocio` (`data-model.md`, §4), nunca como sucesso.

### Erros e comportamento

| Situação | Detecção | Comportamento |
|---|---|---|
| Falha de rede (sem resposta) | `fetch` rejeita antes de qualquer resposta HTTP | Estado `falha-rede` — **sem** reenvio automático; exige confirmação manual do operador (`FR-004`, AD-038, `research.md` D2) |
| Falha de negócio (ERP responde com erro) | Resposta HTTP de erro | Estado `falha-negocio` — reenvio livre após correção, sem trava adicional |
| `401` | — | Tratado no BFF (renovação silenciosa, feature 002) — invisível a esta feature |
| Falha de validação Zod na resposta 2xx | — | Tratada como `falha-negocio` (erro de fronteira, Constitution IV) |

### Regra de não-reenvio automático

Nenhum código desta feature reenvia `FaturarNFCe` sozinho após uma falha de rede — nem com backoff, nem uma única vez. O único caminho de reenvio após `falha-rede` é a ação explícita do operador em `DialogoConfirmarReenvio` (`data-model.md`, §4). O log de auditoria acumulado (incluindo o evento `FATURAMENTO_FALHOU`, contrato de `specs/001-auditoria-acoes-operador/`) é preservado entre tentativas — o `Log` reenviado é sempre estritamente maior que o da tentativa que falhou.

### Efeito colateral em sucesso

Em qualquer resposta de sucesso (`FATURAR` ou `SUSPENDER`), na mesma transação de UI:
1. `removeQueries({ queryKey: ['produto'] })` — descarta o cache de produto (mesma chave definida em `specs/003-carrinho-produto-precificacao/contracts/erp-produto-api.md`).
2. Reset do slice `carrinho` (feature 003).
3. `descartarAuditoria()` (feature 001, `specs/001-auditoria-acoes-operador/contracts/auditoria-events.md`).
4. Reset do slice `identidadeVenda` (`data-model.md`, §1).
5. Decisão de impressão (`data-model.md`, §5) — só para `FATURAR`; `SUSPENDER` não produz documento fiscal a apresentar.

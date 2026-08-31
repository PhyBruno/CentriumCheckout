# Contract: `ValidarNFCe` — validação prévia da venda no ERP

Contrato de rede consumido por esta feature. Fonte: `Fluxograma - Diagrama - Alinhamentos/ApiCentriumOAuth.yaml` (`info.version: 20260827192357`) e leitura do código-fonte de `PCheckout_ValidarNFCe` na KB `CentriumDEVU6` (2026-08-31).

---

## `POST /api/erp/ValidarNFCe`

Chamada através do proxy autenticado do BFF (feature 002), como toda chamada ao ERP. Nenhuma rota nova de servidor é introduzida.

### Corpo da requisição — `ValidarNFCeInput`

```jsonc
{
  "CheckoutFaturarNFCe": { /* mesmo shape enviado em FaturarNFCe */ }
}
```

O corpo é **byte a byte** o mesmo objeto que a feature 004 monta para a emissão, com duas diferenças produzidas pelo montador compartilhado (`research.md`, D3):

| Campo | Na emissão (004) | Nesta consulta (014) |
|---|---|---|
| `SuspenderOuFaturar` | `"FATURAR"` / `"SUSPENDER"` | irrelevante para o veredito — enviado com o valor que a venda teria ao ser faturada |
| `FormasDePagamento[]` | as formas efetivamente aplicadas | as formas aplicadas **mais a candidata** (`FR-002`) |

Campos de cada item de `FormasDePagamento[]` que o ERP **de fato lê** nesta validação:

| Campo | Exemplo sintético | Uso no ERP |
|---|---|---|
| `FormaValor` | `150.00` | soma do crediário |
| `FormaFpgUtiCar` | `'CRD'` / `''` | identifica crediário |
| `FormaEntrada` | `'N'` / `'S'` | exclui a parcela de entrada do crediário |

> **`FormaEntrada` é obrigatório na prática.** Ausente ou vazio, a comparação `FormaEntrada = 'N'` falha, `&TotalCrediario` fica `0` e todo o bloco de limite de crédito é pulado — o gate aprovaria exatamente o caso que existe para barrar. O campo vem de `CondicaoFormasDePagamento[].FormaEntrada` (`FpgEnt`) em `GetSessao` e é responsabilidade da feature 008 carregá-lo no catálogo.

### Resposta — `ValidarNFCeOutput`

```jsonc
{
  "Valido": false,
  "messages": [
    { "Id": "9999", "Type": 2, "Description": "Cliente está com crédito bloqueado, não será possivel realizar venda a prazo!" }
  ]
}
```

| Campo | Tipo | Interpretação |
|---|---|---|
| `Valido` | `boolean` | **Único** determinante de bloqueio (`FR-006`) |
| `messages[].Id` | `string` | Hoje sempre `'9999'`; não usado em nenhuma decisão |
| `messages[].Type` | `integer` | Severidade GeneXus — **apresentação apenas** |
| `messages[].Description` | `string` | Texto exibido ao operador, íntegro (`FR-007`) |

### Matriz real de respostas (código-fonte, 2026-08-31)

| Situação | `Valido` | `Type` | Efeito no Checkout |
|---|---|---|---|
| `Empresa` vazia ou inexistente | `false` | Error | recusa |
| `CondicaoPagamentoCodigo` inexistente | `false` | Error | recusa |
| `clienteCodigo` inexistente na empresa | `false` | Error | recusa |
| Condição a prazo com cliente default | `false` | Error | recusa |
| Crediário acima do limite, `EmpLimCre = 'A'` | **`true`** | **Warning** | **aceita**, exibe aviso |
| Crediário acima do limite, `EmpLimCre = 'B'` | `false` | Warning | recusa |
| Data limite de crédito vencida | `false` | Warning | recusa |
| Cliente com crédito bloqueado | `false` | Warning | recusa |

As três primeiras linhas são *fail-fast*: o procedure retorna imediatamente, com **uma** mensagem. Uma venda com dois problemas pode exigir duas rodadas de correção — comportamento do ERP, não contornável pelo Checkout sem reimplementar regra de negócio (proibido pela Constitution III).

### Validação de fronteira (Zod) — `src/shared/schemas/validarNFCe.schema.ts`

```ts
export const mensagemValidacaoSchema = z.object({
  Id: z.string().default(''),
  Type: z.number().int(),
  Description: z.string(),
});

export const validarNFCeOutputSchema = z.object({
  Valido: z.boolean(),                              // sem default: ausência é resposta inválida
  messages: z.array(mensagemValidacaoSchema).default([]),
});
```

- `Valido` **não** tem default. Uma resposta sem o campo é `RESPOSTA_INVALIDA` (⇒ `INDISPONIVEL`, `FR-009`), nunca um aceite presumido.
- `messages` ausente é normalizado para lista vazia — combinado com `Valido = false`, aciona a mensagem genérica de `FR-008`.
- `Type` é lido como número cru e mapeado para severidade de apresentação no mapper; um valor desconhecido cai na apresentação neutra, sem derrubar a tela.

### Erros e comportamento

| Situação | Veredito | Retry automático |
|---|---|---|
| Timeout (limite explícito na mutation) | `INDISPONIVEL / TIMEOUT` | não |
| Falha de rede / offline | `INDISPONIVEL / REDE` | não |
| HTTP 4xx/5xx | `INDISPONIVEL / SERVIDOR` | não |
| Corpo que não passa no schema | `INDISPONIVEL / RESPOSTA_INVALIDA` | não |
| `401` do proxy | tratado pela feature 002 (sessão), antes de virar veredito | — |

Nenhum retry automático em nenhuma linha (`research.md`, D5): a nova tentativa é sempre um gesto do operador.

### Efeitos colaterais

**Nenhum.** `PCheckout_ValidarNFCe` não grava, não reserva numeração e não altera estado no ERP — é consulta pura. Por isso é seguro chamá-la a cada inserção, e por isso ela é modelada como *mutation* (disparada por gesto) e não como *query* com cache (`research.md`, D10).

# Contract: ERP — Recuperação de NFCe

**Feature**: `specs/011-recuperacao-nfce/` | Fonte: `Fluxograma - Diagrama - Alinhamentos/ApiCentriumOAuth.yaml`

Ambos os endpoints são acessados via proxy do BFF (`/api/erp/*`, feature 002) — o frontend nunca chama `ApiCentriumOAuth` diretamente.

## `GET /api/erp/GetListaNFCes`

| Param | Tipo | Origem/regra |
|---|---|---|
| `Empresa` | `int64` | injetado pelo BFF |
| `Txtbusca` | `string` | termo digitado pelo operador — filtra só nome de cliente/vendedor no servidor (`research.md` D1) |
| `Pagina` | `int32` | página corrente |
| `Tamanhopagina` | `int64` | `min(solicitado, 50)` — nunca enviado sem teto (`research.md` D2) |

**Resposta** (`GetListaNFCesOutput`):

```yaml
CheckoutListaRascunhos:
  PaginaAtual: integer
  RegistrosPorPagina: integer
  TotalRegistros: integer
  TotalPaginas: integer
  Rascunho:
    - NumeroNota: integer
      Cliente: string
      Vendedor: string
      Operador: string
      Emissao: string (date-time)
      Total: number (double)
messages: GeneXus.Common.Messages_Message[]
```

Validado por `src/shared/schemas/recuperacaoNFCe.schema.ts` (Zod) → `RascunhoListado[]` (`data-model.md` §1).

## `GET /api/erp/CarregarNFCe`

| Param | Tipo | Origem/regra |
|---|---|---|
| `Empresa` | `int64` | injetado pelo BFF |
| `Numeronota` | `int64` | `NumeroNota` da linha selecionada na listagem |
| `Serienota` | `string` | `SessaoUsuario.CadSerieNFCe` (bootstrap) — nunca da listagem (`research.md` D4) |

**Resposta** (`CarregarNFCeOutput`):

```yaml
OutCheckoutFaturarNFCe:  # $ref CheckoutFaturarNFCe — mesmo shape de FaturarNFCeOutput/GetDavOutput
  Empresa: integer
  SuspenderOuFaturar: string   # ignorado nesta feature — não é usado para decidir nada aqui
  clienteCodigo: integer
  vendedorCodigo: integer
  CondicaoPagamentoCodigo: integer
  NumeroNota: integer
  CadSerieNFCe: string
  UsuarioCodigo: integer
  DavNum: string                # ignorado — só relevante ao fluxo de DAV (feature 006, futura)
  Log: string                   # ignorado — log de auditoria da suspensão original, não reaproveitado (auditoria reinicia zerada, D10)
  produtos:
    - sequencial: integer
      codigoProduto: string
      quantidade: number
      precoUnitario: number
      DescontoPercentual: number   # ignorado — ver data-model.md §3
      DescontoValor: number
      UDM: string
      ValorBruto: number           # ignorado — derivado, não armazenado
      ValorTotal: number           # ignorado — derivado, não armazenado
  FormasDePagamento:
    - FormaCodigo: integer
      FormaMeioPagtoNFe: string
      FormaValor: number
      FormaIntegracaoCartao: string
      TEFidentificacao: integer
      TEFCNPJ: string
      TEFBandeira: string
      TEFNumeroAutorizacao: string
      TEFTipoIntegracao: string
      FormaPixGUID: string
      TicketDevolucao: string
  NotaFiscal: object              # ignorado — só relevante à resposta de FaturarNFCe (feature 004), CarregarNFCe não fatura nada
messages: GeneXus.Common.Messages_Message[]
```

Validado pelo **mesmo** schema Zod já usado para `FaturarNFCeOutput`/`GetDavOutput` (`research.md` D3) → `RascunhoCarregado` (`data-model.md` §3), descartando os campos marcados "ignorado" acima.

**404**: rascunho não encontrado (ex.: já faturado por outro operador entre a listagem e a seleção, ou expirou a janela de 30 dias) — tratado como erro de negócio (mensagem ao operador, sem retry automático), nunca como lista vazia silenciosa.

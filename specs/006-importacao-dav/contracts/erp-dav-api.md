# Contract: Consumo de `ListaDAVs`/`GetDav` via `/api/erp/*`

Superfície de rede consumida por esta feature — sempre via o proxy autenticado do BFF (`/api/erp/*`, feature 002, AD-022), nunca chamando `ApiCentriumOAuth.yaml` diretamente do navegador. Nomes/tipos de campo abaixo vêm do contrato real (`Fluxograma - Diagrama - Alinhamentos/APICentriumOAuth.yaml`, `info.version: 20260827192357` — revisado nesta versão em 2026-08-31, junto de AD-107; a versão anterior citada aqui era `20260826163735`).

---

## 1. `GET /api/erp/ListaDAVs`

**Query params**:

| Param | Tipo | Obrigatório | Observação |
|---|---|---|---|
| `Empresa` | `int64` | Sim (injetado pelo BFF a partir da sessão) | `codigoEmpresa` |
| `Txtbusca` | `string` | Não | busca em `DavNum`/`DavTit`/`DavCliNom` (AD-024) |
| `Datainicial` | `date` (`YYYY-MM-DD`) | Não | filtro real de período (AD-077/AD-087) — ausência = sem piso de data |
| `Datafinal` | `date` (`YYYY-MM-DD`) | Não | idem |
| `Pagina` | `int32` | Sim | 1-based |
| `Tamanhopagina` | `int64` | Sim | **o Checkout deve limitar este valor no próprio request** — bug de paginação conhecido no servidor anula o cap de 50 quando o parâmetro vem preenchido (AD-024) |

**Resposta** (`ListaDAVsOutput.CheckoutListaDAVs`):

```ts
interface CheckoutListaDAVsResponse {
  PaginaAtual: number;
  RegistrosPorPagina: number;
  TotalRegistros: number;
  TotalPaginas: number;
  DAV: Array<{
    NumeroDAV: string;
    Titulo: string;
    Senha: string;          // não modelado em DavListado — sem uso no fluxo
    DataEmissao: string;    // "YYYY-MM-DD"
    ClienteCodigo: number;
    ClienteNome: string;
    VendedorCodigo: number; // sem VendedorNome correspondente — AD-095
    ValorTotal: number;     // double do ERP — exibição, não usado em cálculo
  }>;
}
```

Schema Zod valida este shape 1:1 — **sem** `VendedorNome`, **sem** `Status`/`Ativo` (não existem no schema real).

**Filtros não suportados** (documentado, não implementado): cliente por seleção estruturada (só busca livre por nome via `Txtbusca`), status, vendedor, tipo, origem — nenhum parâmetro correspondente existe em `DpCheckout_GetDavs` (AD-024, herdado sem mudança nesta fase).

---

## 2. `GET /api/erp/GetDav`

**Query params**: `Empresa: int64`, `Numerodav: string`.

**Resposta** (`GetDavOutput.OutCheckoutFaturarNFCe`) — **mesmo schema de `CarregarNFCeOutput`/`FaturarNFCeOutput`** (AD-057):

```ts
interface CheckoutFaturarNFCe {
  Empresa: number;
  SuspenderOuFaturar: string;   // não usado na importação — só relevante ao chamar FaturarNFCe depois
  clienteCodigo: number;
  vendedorCodigo: number;
  CondicaoPagamentoCodigo: number;
  NumeroNota: number;           // preservar e reenviar INTACTO em FaturarNFCe (NFCE-02, mesma regra de recuperacao-nfce).
                                // Único elo com o DAV de origem desde a remoção de DavNum (AD-107): é por este
                                // rascunho que o ERP reconhece a origem em DAV. Zerar/omitir quebra o vínculo.
  CadSerieNFCe: string;
  UsuarioCodigo: number;
  // SEM DavNum — removido do contrato em 20260827192357 e desnecessário: o ERP identifica sozinho
  // que a NFCe faturada veio de um DAV (AD-107, mesma mecânica de AD-058)
  Log: string;                   // não usado na importação — auditoria do Checkout é trilha própria (feature 001)
  produtos: Array<{
    sequencial: number;
    codigoProduto: string;
    quantidade: number;          // double do ERP → Milesimos na fronteira
    precoUnitario: number;       // double do ERP → Centavos na fronteira — congelado
    DescontoPercentual: number;
    DescontoValor: number;       // double do ERP → Centavos na fronteira — congelado
    UDM: string;
    ValorBruto: number;
    ValorTotal: number;
    // SEM campo de descrição — AD-096
  }>;
  FormasDePagamento: Array<{
    FormaCodigo: number;
    FormaMeioPagtoNFe: string;
    FormaValor: number;
    FormaIntegracaoCartao: string;
    FormaFpgUtiCar: string;      // presente no shape real; não consumido por esta feature (ressalva de AD-048)
    FormaEntrada: string;        // novo em 20260827192357; não consumido por esta feature — tratamento pertence à 008 (item 36 de PENDENCIES.md)
    TEFidentificacao: number;
    TEFCNPJ: string;
    TEFBandeira: string;
    TEFNumeroAutorizacao: string;
    TEFTipoIntegracao: string;
    FormaPixGUID: string;
    TicketDevolucao: string;
  }>;
  NotaFiscal: { /* não consumido na importação — só relevante pós-FaturarNFCe */ };
}
```

Schema Zod (`shared/schemas/dav.schema.ts`) valida este shape completo — reaproveitado sem alteração pela feature 011 quando `CarregarNFCe` for consumido (mesmo `$ref` no contrato real).

**Erros esperados**: DAV já faturado/processado por outro operador (sem lock no Checkout, AD-052) — tratado como erro genérico de request, exibido via toast, sem popular o carrinho (D7, `research.md`).

---

## 3. Reuso de `GET /api/erp/GetProduto` (lote best-effort, AD-096)

Não é um endpoint novo — reaproveita o contrato já documentado em `specs/003-carrinho-produto-precificacao/contracts/erp-produto-api.md`. Chamado **uma vez por `codigoProduto` distinto** do documento importado, só para capturar `Descricao`/conferir `UDM` — **nunca** para reobter `PrecoVenda`/`PrecoVenda1..5` (o preço da linha importada é sempre o do DAV, nunca o de `GetProduto`). Falha em uma chamada individual não bloqueia as demais nem a importação em si.

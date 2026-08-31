# Phase 1 — Data Model: Importação e Faturamento de DAV

**Feature**: `specs/006-importacao-dav/` | **Date**: 2026-08-26

Todas as estruturas abaixo vivem **em memória**. Não introduzem estado novo persistido — reaproveitam `LinhaCarrinho` (`specs/003-carrinho-produto-precificacao/data-model.md`) e os slices de cliente/vendedor já definidos por outras features.

---

## 1. `DavListado` — item da listagem (`ListaDAVs`)

```ts
export interface DavListado {
  readonly numeroDav: string;      // CheckoutListaDAVs.DAV_DAV.NumeroDAV
  readonly titulo: string;         // .Titulo
  readonly dataEmissao: string;    // .DataEmissao, ISO date (YYYY-MM-DD)
  readonly clienteCodigo: number;  // .ClienteCodigo
  readonly clienteNome: string;    // .ClienteNome — única origem do nome do cliente (D4, research.md)
  readonly vendedorCodigo: number; // .VendedorCodigo — sem nome correspondente (AD-095)
  readonly valorTotal: number;     // .ValorTotal, double do ERP — só exibição na lista, não usado no cálculo da venda
}
```

`Senha` (campo presente no schema real) não é modelado — não há requisito de uso no fluxo do Checkout (fora de escopo, nenhuma acceptance criteria a exige).

---

## 2. `VendaImportada` — saída de `mapearVendaExistente`

```ts
export interface VendaImportada {
  readonly numeroNota: number;              // CheckoutFaturarNFCe.NumeroNota — reenviado INTACTO em FaturarNFCe (NFCE-02).
                                            // Único elo com o DAV de origem (AD-107): sem DavNum no contrato, é por este
                                            // rascunho que o ERP reconhece a origem em DAV e fecha o DAV (AD-058).
  readonly clienteCodigo: number;           // .clienteCodigo — sempre sobrescreve o cliente atual (FR-007)
  readonly clienteNome: string;             // capturado do DavListado selecionado (D4) — não vem de GetDav
  readonly vendedorCodigo: number;          // .vendedorCodigo — sempre sobrescreve o vendedor atual (FR-007)
  readonly vendedorNome: string | null;     // null — sem origem disponível (AD-095); UI exibe "Vendedor #<código>"
  readonly linhas: readonly LinhaImportada[];
  readonly formasDePagamento: readonly FormaPagamentoImportada[];
}
```

## 3. `LinhaImportada`

```ts
export interface LinhaImportada {
  readonly codigoProduto: string;      // produtos[].codigoProduto
  descricao: string | null;            // resolvida best-effort via GetProduto (AD-096); null até resolver, nunca bloqueia a importação
  readonly quantidade: Milesimos;      // produtos[].quantidade, convertido na fronteira (mesmo .transform() de Centavos/Milesimos, ver 003)
  readonly precoUnitario: Centavos;    // produtos[].precoUnitario — congelado, nunca passa por resolvePrecoUnitario
  readonly descontoLinha: Centavos;    // produtos[].DescontoValor — absoluto, já resolvido pelo ERP
  readonly udm: string;                // produtos[].UDM
}
```

**Conversão para `LinhaCarrinho`** (tipo já definido em `specs/003-carrinho-produto-precificacao/data-model.md`):

```ts
function paraLinhaCarrinho(li: LinhaImportada): LinhaCarrinho {
  return {
    idLinha: crypto.randomUUID(),
    snapshot: {
      codigoProduto: li.codigoProduto,
      descricao: li.descricao ?? li.codigoProduto,   // fallback: código no lugar do nome, nunca string vazia
      unidadeMedida: li.udm,
      precoBase: li.precoUnitario,
      precosFaixa: [0, 0, 0, 0, 0] as const,          // TipoPreco = 8 não se aplica a linha congelada — nunca lida
      limiaresFaixa: [0, 0, 0, 0] as const,
      pesavelEditavel: '',                             // linha congelada nunca reabre edição de pesagem
    },
    quantidade: li.quantidade,
    precoUnitario: li.precoUnitario,
    descontoLinha: li.descontoLinha,
    cancelada: false,
    precoCongelado: true,                               // I5 de 003/data-model.md: origem ∈ {'RASCUNHO','DAV'}
    origem: 'DAV',
  };
}
```

Satisfaz as invariantes I3/I5/I6 já definidas por `specs/003-carrinho-produto-precificacao/data-model.md` sem exigir nenhuma mudança nelas — `origem: 'DAV'` e `precoCongelado: true` já estavam previstos no union type daquele plano.

## 4. `FormaPagamentoImportada`

```ts
export interface FormaPagamentoImportada {
  readonly formaCodigo: number;             // FormasDePagamento[].FormaCodigo
  readonly formaMeioPagtoNFe: string;       // .FormaMeioPagtoNFe
  readonly valor: Centavos;                 // .FormaValor
  readonly tef: TefImportado | null;        // campos TEFidentificacao/TEFCNPJ/TEFBandeira/TEFNumeroAutorizacao/TEFTipoIntegracao, agrupados quando presentes
  readonly pixGuid: string | null;          // .FormaPixGUID
  readonly ticketDevolucao: string | null;  // .TicketDevolucao
}
```

Copiado 1:1 para o estado de pagamento da venda (feature 008) — nenhum campo é recalculado (D6, `research.md`).

---

## 5. Fluxo de dados

```
Operador clica DAV na lista
        │  (DavListado já em memória: clienteNome, vendedorCodigo)
        ▼
GET /GetDav?Numerodav=...
        │  CheckoutFaturarNFCe
        ▼
mapearVendaExistente(checkoutFaturarNFCe, davListadoSelecionado)
        │  VendaImportada (linhas ainda sem descricao resolvida)
        ▼
importarVendaExistente() [orquestração, davQueries.ts]
        ├─ carrinhoSlice.importarLinhasCongeladas(linhas)         // extensão nova, contracts/importacao-domain-api.md
        ├─ fetchClientePorCodigo(clienteCodigo) → clienteSlice.selecionarCliente(cliente, 'DAV')  // 005, AD-115
        ├─ vendedorSlice.trocarVendedor({codigo, nome: null})      // 012, assinatura desenhada — stub até tasqueada
        ├─ pagamentoSlice.importarFormasDePagamento(formas)        // 008 — ação nova, stub até tasqueada
        ├─ registrarEventoAuditoria(criarEventoDavImportado({numeroDav, numeroNota, ...}))  // 001, tipo #20, AD-114
        └─ dispara em paralelo: GetProduto(codigoProduto) por SKU distinto
                 │  sucesso → atualiza snapshot.descricao da(s) linha(s) daquele SKU
                 └─ falha → mantém fallback (código no lugar do nome), sem bloquear as demais linhas
```

---

## 6. Eventos de auditoria emitidos

Consumidos via o dispatcher da feature 001 (`specs/001-auditoria-acoes-operador/contracts/auditoria-events.md`).

| Ação | Evento | `detalhes` |
|---|---|---|
| DAV importado com sucesso | `DAV_IMPORTADO` | `{ numeroDav, numeroNota, quantidadeLinhas, quantidadeFormasDePagamento }` |

Nenhum evento de `PRODUTO_INSERIDO` é emitido pelas linhas importadas — `carrinhoSlice.importarLinhasCongeladas` é uma action distinta de `inserirItem` justamente para não confundir "inserção manual" com "importação em lote" na trilha de auditoria (mesma filosofia de `research.md` D11 da feature 003: só ação do operador gera evento próprio, não uma tradução automática de dado já existente no ERP).

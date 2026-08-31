# Phase 1 — Data Model: Seleção de Vendedor

**Feature**: `specs/012-selecao-vendedor/` | **Date**: 2026-08-27

Todas as estruturas abaixo vivem **em memória**, no slice `vendedor` do `vendaStore` (Zustand + Immer, sem `persist` — Constitution VI / AD-006). Nada aqui é gravado em Dexie, `localStorage` ou IndexedDB, e nada sobrevive a F5.

---

## 1. `VendedorVenda` — snapshot do vendedor atual da venda

Cópia dos dois campos relevantes de `VendedoresItem` (nome TS-facing do schema `CheckoutListaVendedores.Vendedores_Vendedores`, ver `contracts/erp-vendedor-api.md`) (ou de `GetSessao`, no caso do default) — nunca uma referência viva ao cache do TanStack Query, mesma regra de fronteira já usada por produto (003) e cliente (005). Ao contrário de `ClienteVenda` (005), não há campo indisponível por lacuna de contrato (`research.md` D3) — o único caso de dado parcial é `nome: null`, quando a origem é uma retomada/importação sem nome disponível (`research.md` D4).

```ts
export interface VendedorVenda {
  readonly codigo: number;           // VendedoresItem.VendedorCodigo / SessaoUsuario.VendedorCodigo
  readonly nome: string | null;      // VendedoresItem.VendedorNome / SessaoUsuario.VendedorNome — null só para origem 'RASCUNHO'/'DAV' (research.md D4)
  readonly origem: OrigemVendedor;
}

export type OrigemVendedor = 'DEFAULT' | 'BUSCA' | 'RASCUNHO' | 'DAV';
```

**Nota de origem por campo**:

| Origem | `nome` | Como chega |
|---|---|---|
| `DEFAULT` (pré-seleção automática, AD-032) | preenchido — `SessaoUsuario.VendedorNome` sempre acompanha `VendedorCodigo` | `inicializarVendedorPadrao`, sem chamada de rede |
| `BUSCA` (seleção no modal, `GetListaVendedores`) | preenchido — vem direto do item da lista (`research.md` D1) | `selecionarVendedor` |
| `RASCUNHO` (retomada via `CarregarNFCe`) | `null` — `CheckoutFaturarNFCe` só tem `vendedorCodigo` (`research.md` D4) | `trocarVendedor({ codigo, nome: null }, 'RASCUNHO')`, chamado pela feature 004/011 |
| `DAV` (importação, feature 006) | `null` — mesma lacuna de `ListaDAVs`/`GetDav` (AD-095) | `trocarVendedor({ codigo, nome: null })`, já reservado por `specs/006-importacao-dav/contracts/importacao-domain-api.md` |

**UI**: quando `nome === null`, o campo de vendedor da venda exibe `"Vendedor #<codigo>"` até o operador reabrir o modal e selecionar explicitamente (mesmo padrão de `AD-095`).

---

## 2. Estado do slice

```ts
export interface VendedorState {
  readonly vendedorAtual: VendedorVenda | null; // null só quando a empresa nunca configurou vendedor default (FR-006/VEND-07, AD-053)
  readonly houveEscolhaExplicita: boolean;      // interno — decide VENDEDOR_SELECIONADO vs. VENDEDOR_TROCADO, ver research.md D6
}
```

### Invariantes

| # | Invariante | Requisito |
|---|---|---|
| I1 | `vendedorAtual` só é `null` quando `SessaoUsuario.VendedorCodigo` veio vazio **e** o operador ainda não selecionou nenhum vendedor | `FR-006`, `VEND-07`, AD-053 |
| I2 | `houveEscolhaExplicita` reseta para `false` só no início/retomada de uma venda (mesmo call site de `resetarAuditoria`, feature 001) — nunca no meio de uma venda em andamento | `research.md` D6 |
| I3 | A pré-seleção automática do default (`inicializarVendedorPadrao`) e a sobrescrita por retomada/importação (`trocarVendedor` chamado por 004/006/011) nunca alteram `houveEscolhaExplicita` nem disparam evento de auditoria | `research.md` D3, D4, D6 |
| I4 | `selecionarVendedor`/`trocarVendedor` são no-op quando `podeMutarCarrinho()` retorna `false` (pagamento aprovado) — `vendedorAtual` permanece inalterado | `FR-013`, `VEND-09`, AD-043 |
| I5 | Nenhum indicador de origem (`origem`) é exposto na UI do campo vendedor — o campo mostra só o nome (ou `"Vendedor #<codigo>"` quando `nome === null`), sem distinguir `DEFAULT` de seleção manual | `AD-053` |
| I6 | O sistema nunca associa `UsuarioCodigo` (operador logado) a `vendedorAtual` — são sempre dois campos distintos, mesmo quando coincidentes por acaso | `FR-008`, Out of Scope, `AD-056` (Fato F1) |

---

## 3. Ações do slice

```ts
function inicializarVendedorPadrao(sessaoUsuario: SessaoUsuario): void;
// Chamado uma única vez, no início/retomada de uma sessão de venda — mesmo call site que zera carrinho, cliente e auditoria.
// Não dispara evento de auditoria (I3). Ver research.md D3.

function selecionarVendedor(vendedor: { codigo: number; nome: string }): void;
// Chamada pelo modal de busca (ModalBuscaVendedor.tsx) ao clicar numa linha da tabela.
// Aplica o predicado podeMutarCarrinho() antes de mutar, se houver carrinho populado (I4).
// Dispara VENDEDOR_SELECIONADO (primeira escolha) ou VENDEDOR_TROCADO (substituição) — ver research.md D6.

function trocarVendedor(vendedor: { codigo: number; nome: string | null }, origem: 'RASCUNHO' | 'DAV' = 'DAV'): void;
// Superfície pública já reservada por specs/006-importacao-dav/contracts/importacao-domain-api.md
// (chamada de 2 argumentos da 006 continua válida — `origem` é opcional, default 'DAV').
// Usada por origens que não passam pelo modal — importação de DAV (006, usa o default) e
// retomada de rascunho (004/011, MUST passar origem: 'RASCUNHO' explicitamente) —
// sempre sobrescreve incondicionalmente (research.md D4), nunca dispara evento de auditoria (I3),
// e não altera houveEscolhaExplicita (a escolha não foi feita nesta sessão).
```

`selecionarVendedor` (ação do operador, no modal) e `trocarVendedor` (sobrescrita programática, por outra feature) são duas actions distintas — ao contrário de `ClienteVenda` (005), que unifica em uma só `selecionarCliente` — porque só a primeira decide `SELECIONADO`/`TROCADO` e dispara auditoria; a segunda nunca audita e sempre aceita `nome: null` (`research.md` D4).

---

## 4. Eventos de auditoria emitidos

Consumidos via o contrato da feature 001 (`specs/001-auditoria-acoes-operador/contracts/auditoria-events.md`). Shapes **já fixados** em `specs/001-auditoria-acoes-operador/data-model.md` (linhas 25-26, definidos antes desta fase) — este plano não escolhe os campos, só os reaproveita:

| Ação do operador | Evento | `detalhes` |
|---|---|---|
| Primeira seleção explícita de vendedor (modal) | `VENDEDOR_SELECIONADO` | `{ codigoVendedor: number, nome: string }` |
| Substituição de um vendedor já escolhido explicitamente (modal) | `VENDEDOR_TROCADO` | `{ codigoVendedorAnterior: number, codigoVendedorNovo: number }` |

Regra completa de qual evento dispara quando: `research.md`, D6. Pré-seleção automática do default e sobrescrita por retomada de rascunho/importação de DAV nunca geram evento algum (I3).

# Phase 1 — Data Model: Recuperação de NFCe

**Feature**: `specs/011-recuperacao-nfce/` | **Date**: 2026-08-27

Estado desta feature vive só como efeito colateral em memória sobre slices já existentes (`identidadeVenda` de 004, `carrinho` de 003, `pagamentos` de 008, `cliente` de 005, `auditoria` de 001) mais um estado local efêmero do modal de listagem. Nada aqui é persistido (Constitution VI).

---

## 1. `RascunhoListado` (item da listagem)

Mapeado de `CheckoutListaRascunhos.Rascunho_Rascunho` (`ApiCentriumOAuth.yaml:1608-1633`):

```ts
export interface RascunhoListado {
  readonly numeroNota: number;
  readonly cliente: string;
  readonly vendedor: string;
  readonly operador: string;
  readonly emissao: string;   // ISO 8601, vindo de "Emissao" (date-time) — exibido formatado, nunca reinterpretado
  readonly total: Centavos;   // "Total" (double) convertido na fronteira Zod, mesma regra de Centavos de 003 §1
}
```

## 2. Estado do modal de listagem (efêmero, local ao componente — não é slice do `vendaStore`)

```ts
interface EstadoListaRascunhos {
  termoBusca: string;
  pagina: number;
  rascunhos: RascunhoListado[];
  paginaAtual: number;
  totalPaginas: number;
  totalRegistros: number;
}
```

`Tamanhopagina` enviado ao servidor é sempre `min(tamanhoSolicitado, RASCUNHOS_TAMANHO_PAGINA)`, `RASCUNHOS_TAMANHO_PAGINA = 50` (`research.md` D2) — nunca lido de configuração remota.

---

## 3. `RascunhoCarregado`

Resultado da validação Zod de `CarregarNFCeOutput.OutCheckoutFaturarNFCe` (mesmo schema `CheckoutFaturarNFCe` de `FaturarNFCe`/`GetDAV`, `research.md` D3):

```ts
export interface RascunhoCarregado {
  readonly numeroNota: number;
  readonly clienteCodigo: number;
  readonly vendedorCodigo: number;
  readonly condicaoPagamentoCodigo: number;
  readonly produtos: readonly ItemRascunho[];
  readonly formasDePagamento: readonly FormaPagamentoRascunho[];
}

interface ItemRascunho {
  readonly codigoProduto: string;
  readonly quantidade: Milesimos;      // "quantidade" convertido na fronteira (mesma regra de 003 §1)
  readonly precoUnitario: Centavos;    // "precoUnitario" — valor a preservar tal como veio, sem recálculo
  readonly descontoValor: Centavos;    // "DescontoValor" — absoluto, mesma semântica de descontoLinha (003 §1)
  readonly udm: string;                // "UDM"
}

interface FormaPagamentoRascunho {
  readonly formaCodigo: number;
  readonly meioPagtoNFe: string;       // "FormaMeioPagtoNFe" — validado contra o union de 008 §2 na fronteira
  readonly valor: Centavos;            // "FormaValor"
  readonly integracaoCartao: '1' | '2' | '';
  readonly ticketDevolucao: string | null;
  readonly pixGuid: string | null;     // "FormaPixGUID"
  readonly dadosTEF: RawDadosTEF | null; // campos TEF* ecoados, opacos a esta feature (mesmo tratamento de 008 §2)
}
```

`DescontoPercentual`, `ValorBruto` e `ValorTotal` do contrato **não** entram em `ItemRascunho` — são redundantes com `precoUnitario`/`quantidade`/`descontoValor`, e `LinhaCarrinho` (003) já deriva `totalLinha` a partir desses três (003 §1, invariante I9: total nunca é campo armazenado).

---

## 4. Efeito 1 — Popular o carrinho: `ItemRascunho[]` → `LinhaCarrinho[]` (congeladas)

Cada `ItemRascunho` vira uma `LinhaCarrinho` nova (`specs/003-carrinho-produto-precificacao/data-model.md` §3):

| Campo de `LinhaCarrinho` | Valor |
|---|---|
| `idLinha` | `crypto.randomUUID()` — nova identidade local, não reaproveita `sequencial` do ERP |
| `snapshot` | degenerado — só `codigoProduto`/`unidadeMedida`(`udm`)/`precoBase`(`precoUnitario`); `precosFaixa`/`limiaresFaixa`/`pesavelEditavel` ausentes (`research.md` D5) |
| `quantidade` | `quantidade` |
| `precoUnitario` | `precoUnitario` — **nunca** passa por `resolvePrecoUnitario` (003 §5) |
| `descontoLinha` | `descontoValor` |
| `cancelada` | `false` |
| `precoCongelado` | `true` |
| `origem` | `'RASCUNHO'` |

Nenhuma chamada a `repricarSku`/`resolvePrecoUnitario` (003) é feita neste efeito — `NFCE-03` proíbe recálculo automático. A transição futura `CONGELADA → ATIVA` (reinserção) é responsabilidade de 003 (`research.md` D13).

## 5. Efeito 2 — Popular pagamentos: `FormaPagamentoRascunho[]` → `PagamentoAplicado[]`

Cada `FormaPagamentoRascunho` vira um `PagamentoAplicado` (`specs/008-pagamento-geral/data-model.md` §2), regra completa em `research.md` D8:

| Campo de `PagamentoAplicado` | Valor |
|---|---|
| `idPagamento` | `crypto.randomUUID()` |
| `formaCodigo` | `formaCodigo` |
| `meioPagtoNFe` | `meioPagtoNFe` (validado contra o union fechado de 008) |
| `integracaoCartao` | `integracaoCartao` |
| `valorAplicado` | `valor` |
| `valorRecebido` | `valor` se `meioPagtoNFe === 'Dinheiro'`, senão `null` |
| `integracao` | inferida por `meioPagtoNFe`/`integracaoCartao`, mesma regra de 008 |
| `status` | `'APROVADO'` (sempre) |
| `dadosTEF` | `dadosTEF` (opaco, ecoado) |
| `pixGuid` | `pixGuid` |
| `ticketDevolucao` | `ticketDevolucao` |

Além disso, `condicaoPagamentoCodigo` do rascunho seta `condicaoSelecionada` (008 §3) diretamente — sem passar pela UI de seleção de condição.

## 6. Efeito 3 — Cliente, vendedor, identidade da venda, auditoria

| Efeito | Mecanismo |
|---|---|
| Cliente | `GET /ApiCentriumOAuth/GetCliente(clienteCodigo)` (feature 005) monta `ClienteVenda` completo; `origem: 'RASCUNHO'` — extensão declarada em `research.md` D6, não aplicada por este plano ao artefato de 005 |
| Vendedor | `trocarVendedor({ codigo: vendedorCodigo, nome: null }, 'RASCUNHO')` (`specs/012-selecao-vendedor/data-model.md` §3) — pré-seleção efetiva, `research.md` D7 |
| Identidade da venda | `identidadeVenda = { origem: 'RASCUNHO', numeroNota }` (004 §1) — implementado por esta feature (`research.md` D9) |
| Auditoria | `resetarAuditoria()` + `VENDA_INICIADA({ origem: 'RASCUNHO' })` (001) — implementado por esta feature (`research.md` D10) |

**Ordem de aplicação** (mesmo call site, atômico do ponto de vista do operador — nenhuma tela intermediária): `resetarAuditoria` → `identidadeVenda` → carrinho (§4) → pagamentos + condição (§5) → cliente → vendedor. `VENDA_INICIADA` é o primeiro evento emitido, antes de qualquer evento de cliente/produto/pagamento gerado pela hidratação (que **não** dispara `PRODUTO_INSERIDO`/`FORMA_PAGAMENTO_APLICADA` — hidratação de retomada não é uma sequência de ações do operador, é um snapshot único; só o evento `VENDA_INICIADA` é emitido pela retomada em si).

---

## 7. Invariantes

| # | Invariante | Requisito |
|---|---|---|
| J1 | Toda `LinhaCarrinho` criada pela retomada tem `origem = 'RASCUNHO'` e `precoCongelado = true` | `FR-005`/`FR-007`/`NFCE-03` |
| J2 | Nenhuma chamada a `resolvePrecoUnitario`/`repricarSku` ocorre durante a hidratação | `FR-007`/`NFCE-03` |
| J3 | `identidadeVenda.numeroNota` é sempre o `NumeroNota` do rascunho, nunca `0`, após retomada | `FR-006`/`NFCE-02` |
| J4 | Todo `PagamentoAplicado` criado pela retomada tem `status = 'APROVADO'` | `research.md` D8 |
| J5 | O slice `auditoria` é zerado antes de `VENDA_INICIADA` ser emitido | `AUDIT-01`/`AUDIT-10` |
| J6 | Nenhum evento de auditoria além de `VENDA_INICIADA` é emitido pela hidratação em si | `research.md` D10 |
| J7 | Nenhuma chamada de lock/bloqueio é feita ao retomar, mesmo se outro operador acessar o mesmo rascunho concorrentemente | `NFCE-05`/AD-052 |

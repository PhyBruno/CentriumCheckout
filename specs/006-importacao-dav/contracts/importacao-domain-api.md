# Contract: Domínio de Importação de Venda Existente

Superfície pública dos módulos `src/client/domain/importacaoVenda/` e da extensão introduzida no `CarrinhoSlice` já existente (`specs/003-carrinho-produto-precificacao/contracts/precificacao-domain-api.md`). Não é uma API HTTP.

Este contrato foi desenhado para ser **reaproveitado sem alteração** pela feature 011 (recuperação de rascunho de NFCe) — a única diferença entre as duas features é qual endpoint alimenta `CheckoutFaturarNFCe` (`GetDav` aqui, `CarregarNFCe` lá).

---

## 1. Domínio puro — `src/client/domain/importacaoVenda/`

### `mapearVendaExistente.ts`

```ts
export function mapearVendaExistente(
  resposta: CheckoutFaturarNFCe,
  origemLista: { clienteNome: string } | null,  // DavListado selecionado — null quando a origem não veio de uma listagem (ex.: futura feature 011, que pode ter outro ponto de entrada)
): VendaImportada;
```

Função **pura**: sem rede, sem Zustand, sem React. Contrato de comportamento:

1. Copia `NumeroNota` sem transformação — preservado para reenvio **intacto** em `FaturarNFCe`. O DAV de origem **não** é modelado nem reenviado: o ERP identifica sozinho que a NFCe veio de um DAV (AD-107). Com `DavNum` fora do contrato, `NumeroNota` passou a ser o **único** elo com o DAV, por isso o item 5 abaixo trata sua ausência como erro de contrato, não como dado opcional.
2. Mapeia cada item de `produtos[]` para `LinhaImportada` com `descricao: null` (resolução best-effort acontece fora desta função, na orquestração — ver §2).
3. Mapeia `clienteCodigo`/`vendedorCodigo` diretamente; `clienteNome` vem de `origemLista?.clienteNome` (fallback: string vazia se ausente); `vendedorNome` é sempre `null` (AD-095 — nenhuma fonte disponível).
4. Mapeia `FormasDePagamento[]` 1:1, sem reclassificação (D6, `research.md`).
5. Nunca lança para dado ausente/opcional (ex.: documento sem forma de pagamento) — devolve arrays vazios; lança **só** se `clienteCodigo`/`vendedorCodigo`/`NumeroNota` vierem ausentes do schema Zod já validado (erro de contrato, não de dado de negócio).

---

## 2. Extensão do `CarrinhoSlice` — `src/client/stores/slices/carrinhoSlice.ts`

Adiciona **uma** action nova à interface já definida por `specs/003-carrinho-produto-precificacao/contracts/precificacao-domain-api.md` — as actions existentes (`inserirItem`, `editarItem`, `cancelarItem`, `reprecificarPorTrocaDeCliente`, `limparCarrinho`) **não são alteradas**:

```ts
export interface CarrinhoSlice {
  // ... actions já existentes (003), inalteradas
  importarLinhasCongeladas(linhas: readonly LinhaImportada[]): void;
}
```

| Action | Pré-condição | Efeito | Auditoria |
|---|---|---|---|
| `importarLinhasCongeladas` | `podeMutarCarrinho()` — mesma dependência injetada já usada pelas demais actions | Converte cada `LinhaImportada` em `LinhaCarrinho` (`paraLinhaCarrinho`, `data-model.md` §3) e adiciona ao array `linhas`. **Nunca** chama `repricarSku` — linhas entram já com `precoCongelado: true`, fora do agregado por SKU desde o primeiro momento (I3 de `specs/003-.../data-model.md`) | nenhum evento próprio — `DAV_IMPORTADO` é emitido pela orquestração (§3), não pelo slice de carrinho isoladamente |

Reaproveitável tal e qual pela feature 011: `importarLinhasCongeladas` não sabe se a origem é DAV ou rascunho de NFCe — só recebe `LinhaImportada[]` já mapeadas.

---

## 3. Orquestração — `src/client/services/dav/davQueries.ts`

```ts
export function useListaDavs(filtros: { txtBusca?: string; dataInicial?: string; dataFinal?: string; pagina: number }): UseQueryResult<CheckoutListaDAVsResponse>;

export async function importarVendaExistente(numeroDav: string): Promise<void>;
```

`importarVendaExistente` é a função de orquestração (não pura — chama rede e muta slices):

1. `GET /api/erp/GetDav` (via `fetchDav`).
2. `mapearVendaExistente(resposta, davListadoSelecionado)`.
3. `carrinhoSlice.importarLinhasCongeladas(vendaImportada.linhas)`.
4. `clienteSlice.trocarCliente({ codigo: vendaImportada.clienteCodigo, nome: vendaImportada.clienteNome })` — reaproveita a action pública já exposta pela feature 005; sobrescreve incondicionalmente (FR-007), mesmo com cliente já selecionado.
5. `vendedorSlice.trocarVendedor({ codigo: vendaImportada.vendedorCodigo, nome: null })` — reaproveita a action pública da feature 012, mesmo padrão de sobrescrita incondicional.
6. `pagamentoSlice.importarFormasDePagamento(vendaImportada.formasDePagamento)` — feature 008.
7. `auditoriaSlice.registrar('DAV_IMPORTADO', { numeroDav, numeroNota: vendaImportada.numeroNota, quantidadeLinhas, quantidadeFormasDePagamento })`.
8. Dispara, sem aguardar (`Promise.allSettled`), um `GetProduto` por `codigoProduto` distinto de `vendaImportada.linhas` — cada sucesso atualiza `snapshot.descricao` da(s) linha(s) daquele SKU no `carrinhoSlice` (ação `editarSnapshotDescricao`, mutação direta de metadado, **não** passa por `editarItem`/`repricarSku` porque não altera preço/quantidade); falha é silenciosa (mantém fallback de `codigoProduto`).

O carrinho **não importa** os slices de cliente/vendedor/pagamento diretamente — é esta camada de orquestração (serviço, não slice) que os conecta, preservando a mesma regra de Dependency Inversion já estabelecida pela feature 005 (`carrinhoSlice` nunca conhece `clienteSlice`).

---

## 4. O que este contrato garante às outras features

| Feature | Consome |
|---|---|
| 001 — auditoria | recebe o evento `DAV_IMPORTADO` pelo dispatcher tipado |
| 003 — carrinho | `CarrinhoSlice` ganha `importarLinhasCongeladas`, sem alteração das actions existentes |
| 005 — cliente | `importarVendaExistente` chama `trocarCliente`, já pública |
| 008 — pagamento | recebe `importarFormasDePagamento` com os dados já confirmados do DAV |
| 011 — recuperação de rascunho de NFCe | reaproveita `mapearVendaExistente` e `importarLinhasCongeladas` sem alteração — só troca `fetchDav` por `fetchCarregarNFCe` |
| 012 — seleção de vendedor | `importarVendaExistente` chama `trocarVendedor`, já pública |

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

export async function importarVendaExistente(numeroDav: string, origemLista: { clienteNome: string }): Promise<void>;
```

`origemLista` é capturado pela UI (`ModalImportacaoDav.tsx`) a partir da linha do `DavListado` selecionado, **antes** de `GetDav` responder (D4, `research.md`) — só carrega `clienteNome`, o único campo que `mapearVendaExistente` (§1) lê de `origemLista`. `clienteCodigo` **não** precisa ser capturado da lista: `VendaImportada.clienteCodigo` vem sempre de `resposta.clienteCodigo` (a própria resposta de `GetDav`), nunca de `origemLista`.

`importarVendaExistente` é a função de orquestração (não pura — chama rede e muta slices):

1. `GET /api/erp/GetDav` (via `fetchDav`).
2. `mapearVendaExistente(resposta, origemLista)`.
3. `carrinhoSlice.importarLinhasCongeladas(vendaImportada.linhas)`.
4. `fetchClientePorCodigo(vendaImportada.clienteCodigo)` (feature 005, novo parâmetro `CodCliente` de `GetCliente`, AD-115) seguido de `clienteSlice.selecionarCliente(clienteCompleto, 'DAV')` — **não** existe uma action `trocarCliente` separada; `selecionarCliente` é a única action pública de troca da feature 005 e exige o `ClienteCheckout` completo (`data-model.md` da 005), não só `{codigo, nome}`. Sobrescreve incondicionalmente (FR-007), mesmo com cliente já selecionado — mesma regra `houveEscolhaExplicita` de `CLIENTE_SELECIONADO`/`CLIENTE_TROCADO` (D9 de `specs/005-.../research.md`) se aplica normalmente à origem `'DAV'`.
5. `vendedorSlice.trocarVendedor({ codigo: vendaImportada.vendedorCodigo, nome: null })` — assinatura já desenhada pela feature 012 (`data-model.md` daquela feature), consumida aqui por injeção de dependência com stub (012 ainda não tem `tasks.md`) — não é `import` direto.
6. `pagamentoSlice.importarFormasDePagamento(vendaImportada.formasDePagamento)` — contrato definido em `specs/008-pagamento-geral/contracts/pagamento-domain-api.md` §2: cria `PagamentoAplicado` com `status: 'APROVADO'`/`integracao: 'NENHUMA'` sempre, sem passar por `validarInsercao` (gate da feature 014) nem pela checagem de forma única em dinheiro — consumida aqui por injeção de dependência com stub até a feature 008 tasquear a implementação, mesmo padrão do item 5.
7. `registrarEventoAuditoria(criarEventoDavImportado({ numeroDav, numeroNota: vendaImportada.numeroNota, quantidadeLinhas, quantidadeFormasDePagamento }))` — **não** existe um método `auditoriaSlice.registrar(tipo, detalhes)`; o dispatcher real (`specs/001-.../contracts/auditoria-events.md`) é `registrarEventoAuditoria(evento)`, e o evento é montado por uma factory function tipada (`criarEventoDavImportado`, `src/client/domain/auditoria/eventos.ts`, tipo #20 do catálogo, AD-114) — mesmo padrão usado por toda outra feature consumidora.
8. Dispara, sem aguardar (`Promise.allSettled`), um `GetProduto` por `codigoProduto` distinto de `vendaImportada.linhas` — cada sucesso atualiza `snapshot.descricao` da(s) linha(s) daquele SKU no `carrinhoSlice` (ação `editarSnapshotDescricao`, mutação direta de metadado, **não** passa por `editarItem`/`repricarSku` porque não altera preço/quantidade); falha é silenciosa (mantém fallback de `codigoProduto`).

O carrinho **não importa** os slices de cliente/vendedor/pagamento diretamente — é esta camada de orquestração (serviço, não slice) que os conecta, preservando a mesma regra de Dependency Inversion já estabelecida pela feature 005 (`carrinhoSlice` nunca conhece `clienteSlice`).

---

## 4. O que este contrato garante às outras features

| Feature | Consome |
|---|---|
| 001 — auditoria | recebe o evento `DAV_IMPORTADO` pelo dispatcher tipado |
| 003 — carrinho | `CarrinhoSlice` ganha `importarLinhasCongeladas`, sem alteração das actions existentes |
| 005 — cliente | `importarVendaExistente` chama `fetchClientePorCodigo` + `selecionarCliente(cliente, 'DAV')`, já públicas (AD-115) |
| 008 — pagamento | recebe `importarFormasDePagamento` com os dados já confirmados do DAV |
| 011 — recuperação de rascunho de NFCe | reaproveita `mapearVendaExistente` e `importarLinhasCongeladas` sem alteração — só troca `fetchDav` por `fetchCarregarNFCe` |
| 012 — seleção de vendedor | `importarVendaExistente` chama `trocarVendedor`, assinatura já desenhada mas consumida por stub até a 012 ser tasqueada |

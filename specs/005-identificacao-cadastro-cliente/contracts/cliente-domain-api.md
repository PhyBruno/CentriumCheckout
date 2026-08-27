# Contract: Superfície pública do slice de Cliente

Não é uma API HTTP — é a superfície pública de `src/client/stores/slices/clienteSlice.ts` + `src/client/domain/cliente/documento.ts`, consumida por outras features (principalmente 003 e, no futuro, 004/008/012). Ver `plan.md`, "Project Structure".

## Estado exposto

```ts
// via useVendaStore(state => state.cliente)
interface ClienteState {
  clienteAtual: ClienteVenda | null; // ver data-model.md §1
}
```

`carrinhoSlice` (feature 003) lê `clienteAtual.listaPreco`/`clienteAtual.descontoConvenio`/`clienteAtual.codigoCliente` diretamente do estado combinado do `vendaStore` ao montar os parâmetros de `GetProduto` — **não** importa `clienteSlice` como módulo, só lê o slice já combinado no mesmo store (padrão já estabelecido pela feature 003 para ler `carrinho.linhas` a partir de `clienteSlice`, ver D7 de `research.md`).

## Ações

```ts
function inicializarClientePadrao(sessaoUsuario: SessaoUsuario): void;
function selecionarCliente(cliente: ClienteCheckout, origem: 'BUSCA_DOCUMENTO' | 'BUSCA_LIVRE'): void;
function cadastrarESelecionarCliente(dados: CadastroSimplificadoInput): Promise<void>;
```

Ver `data-model.md`, §3, para o comportamento completo de cada uma (predicado de bloqueio, disparo de auditoria, disparo de re-fetch de preço).

## Integração com o carrinho (feature 003) — disparo de re-fetch, não import direto

`selecionarCliente`/`cadastrarESelecionarCliente`, quando há linhas ativas não-congeladas no carrinho, chamam:

```ts
// de src/client/services/produto/produtoQueries.ts (já público, definido pela feature 003)
function fetchProduto(codigoProduto: string, params: {
  tipoPreco: number;
  codCliente: number;
  listaPreco: number | null;
}): Promise<SDTCheckout_GetProduto>;
```

— uma chamada por SKU distinto ativo não-congelado — e, com o resultado, atualizam `snapshot`/`precoUnitario` das linhas correspondentes via `set` do próprio `vendaStore` combinado (Immer draft cobrindo `state.carrinho.linhas`), reaproveitando as fórmulas puras de `src/client/domain/precificacao/dinheiro.ts` (já públicas). `clienteSlice.ts` **não** importa `carrinhoSlice.ts` como módulo — só o serviço de produto (camada de rede) e o domínio de precificação (camada pura), preservando a separação que a Constitution II exige. Ver `research.md`, D7.

## Predicado de bloqueio reaproveitado (feature 003)

```ts
// injetado na composição do vendaStore, definido pela feature 003 (research.md D8)
function podeMutarCarrinho(): boolean;
```

`clienteSlice` consulta o mesmo predicado antes de `selecionarCliente`/`cadastrarESelecionarCliente` mutarem `clienteAtual`, quando há pagamento aprovado (`FR-008`/`CLI-07`, AD-043). Não define um segundo predicado.

## Integração com auditoria (feature 001)

```ts
// de src/client/stores/slices/auditoriaSlice.ts (já público, feature 001)
function registrarEventoAuditoria(evento: EventoAuditoriaSemTimestamp): void;
```

Chamado nos três pontos descritos em `data-model.md`, §6 — nunca na pré-seleção automática do default (`inicializarClientePadrao`).

## Ciclo de vida

`inicializarClientePadrao` é chamado uma única vez, no mesmo call site que `resetarAuditoria` (feature 001) e a inicialização do carrinho (feature 003) — início ou retomada de uma sessão de venda. Não há uma função de "descarte" própria deste slice: `clienteAtual` simplesmente é sobrescrito na próxima `inicializarClientePadrao`, já que o slice nunca persiste (Constitution VI).

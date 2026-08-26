# Contract: API interna do domínio de Precificação e do slice de Carrinho

Superfície pública que as demais features consomem. Não é uma API HTTP — é o contrato dos módulos `src/client/domain/precificacao/` e `src/client/stores/slices/carrinhoSlice.ts` (ver `plan.md`, "Project Structure").

A divisão obedece à Constitution II: o **domínio é puro** (funções sem estado, sem React, sem Zustand, sem rede — testáveis isoladamente) e o **slice orquestra** (aplica mutação, chama o domínio, emite auditoria).

---

## 1. Domínio puro — `src/client/domain/precificacao/`

### `dinheiro.ts`

```ts
export type Centavos = number & { readonly __brand: 'Centavos' };

export function centavos(valorInteiro: number): Centavos;
export function somar(a: Centavos, b: Centavos): Centavos;
export function multiplicarPorQuantidade(preco: Centavos, qtd: Milesimos): Centavos;
export function aplicarPercentual(valor: Centavos, percentual: number): Centavos;
export function distribuirPorMaiorResto(total: Centavos, pesos: readonly Centavos[]): readonly Centavos[];

export function calcularTotalLinha(
  precoUnitario: Centavos,
  descontoUnitario: Centavos,
  quantidade: Milesimos,
): Centavos;
```

- `multiplicarPorQuantidade` implementa `arredondar(preco × qtd ÷ 1000)`.
- `calcularTotalLinha` é a **única** forma de obter o valor de uma linha: `arredondar((precoUnitario − descontoUnitario) × quantidade ÷ 1000)`, com o preço líquido unitário limitado a um piso de `0`. `precoUnitario` é sempre o preço de **uma** unidade — `PrecoVenda` (ou o `PrecoVenda{n}` da faixa) é base unitária, nunca valor de linha. `totalLinha` nunca é armazenado no estado (invariante I9 de `data-model.md`).
- `aplicarPercentual` cobre o desconto de convênio: fator `(1 - DescontoConvenio / 100)` (AD-023). O `descontoUnitario` resultante é recalculado sempre que `precoUnitario` muda.
- `distribuirPorMaiorResto` implementa AD-072: arredonda cada parcela para baixo e distribui a diferença 1 centavo por vez, das maiores partes fracionárias descartadas para as menores, até zerar. A soma das parcelas devolvidas é **sempre exatamente** `total` — esta é a invariante que o teste unitário afirma.

### `quantidade.ts`

```ts
export type Milesimos = number & { readonly __brand: 'Milesimos' };

export function milesimosDeUnidades(unidades: number): Milesimos;
export function formatarQuantidade(q: Milesimos, casas: 0 | 3): string;
```

### `tabelaPreco.ts`

```ts
export function resolvePrecoUnitario(
  tipoPreco: number,
  snapshot: SnapshotPrecoProduto,
  quantidadeAgregada: Milesimos,
): Centavos;
```

Devolve o preço de **uma unidade**. Quantidade e desconto não entram nesta função — são aplicados por `calcularTotalLinha`.

- `tipoPreco ∈ {1..7, 9, 10, 11}` → `snapshot.precoBase` (AD-059/AD-060).
- `tipoPreco = 8` → faixa flat resolvida pela quantidade agregada (algoritmo em `data-model.md`, §5). Limiar `0` = faixa não configurada, ignorado.
- Função **total**: para qualquer `tipoPreco` fora de `1..11`, lança erro de domínio explícito em vez de devolver um preço silenciosamente errado.

### `reprecificacao.ts`

```ts
export function repricarSku(
  linhas: readonly LinhaCarrinho[],
  codigoProduto: string,
  tipoPreco: number,
): readonly LinhaCarrinho[];
```

Função **pura**: recebe as linhas, devolve linhas novas. Não conhece Zustand, rede, pagamento ou cliente.

Contrato de comportamento:

1. Calcula `quantidadeAgregada` somando `quantidade` das linhas do SKU que são **ativas e não-congeladas** (`data-model.md`, I2/I3).
2. Chama `resolvePrecoUnitario` uma única vez com esse agregado.
3. Aplica o preço resultante a **todas** as linhas ativas não-congeladas daquele SKU — não só à linha alterada (`CART-06`).
4. Linhas canceladas, linhas congeladas e linhas de outros SKUs voltam **inalteradas por identidade** (mesma referência), o que mantém o custo de re-render baixo com Immer.

Chamada obrigatoriamente após: inserção de linha, edição de quantidade, cancelamento de linha (`FR-007`), e ao trocar o cliente da venda quando `TipoPreco = 9` (`FR-018`).

### `codigoProduto.ts`

```ts
export type EntradaCodigo =
  | { readonly tipo: 'SIMPLES'; readonly codigo: string }
  | { readonly tipo: 'COM_QTD'; readonly codigo: string; readonly quantidade: Milesimos }
  | { readonly tipo: 'BALANCA'; readonly codigoReduzido: string; readonly valorEtiqueta: Centavos };

export function interpretarEntradaCodigo(texto: string): EntradaCodigo;

export function quantidadePesavel(
  valorEtiqueta: Centavos,
  precoVenda: Centavos,
): Milesimos;   // lança erro de domínio quando precoVenda <= 0
```

- Ordem de classificação: `*` → balança (13 dígitos, prefixo `2`, DV EAN-13 válido) → simples (`research.md`, D6).
- `quantidadePesavel` implementa `round(trunc(valorEtiqueta / precoVenda, 5), 3)` (AD-076). Quando `precoVenda <= 0`, lança — o call site converte em bloqueio de inserção com aviso ao operador (`FR-013`).

---

## 2. Slice — `src/client/stores/slices/carrinhoSlice.ts`

```ts
export interface CarrinhoSlice {
  linhas: LinhaCarrinho[];

  inserirItem(input: InserirItemInput): void;
  editarItem(idLinha: string, campo: CampoEditavel, valor: Centavos | Milesimos): void;
  cancelarItem(idLinha: string): void;
  reprecificarPorTrocaDeCliente(): void;
  limparCarrinho(): void;
}

export type CampoEditavel = 'quantidade' | 'precoUnitario' | 'descontoUnitario';
```

### Dependências injetadas (Dependency Inversion)

O slice recebe, na composição do `vendaStore`:

```ts
interface CarrinhoDeps {
  podeMutarCarrinho(): boolean;   // implementado pela feature 008 (pagamento)
  tipoPrecoAtual(): number;       // SessaoUsuario.TipoPreco, do bootstrap (feature 002)
  clienteAtual(): { codigo: number; listaPreco: number | null; descontoConvenio: number } | null;
                                  // feature 005
}
```

O carrinho **não importa** o slice de pagamento nem o de cliente. Isso é o que permite testar o bloqueio pós-pagamento injetando `() => false`, sem montar estado de pagamento.

### Contrato de comportamento das actions

| Action | Pré-condição | Efeito | Auditoria |
|---|---|---|---|
| `inserirItem` | `podeMutarCarrinho()` — em `false`, é no-op com toast | Cria `LinhaCarrinho` com `idLinha` novo, copia o `SnapshotPrecoProduto`, então chama `repricarSku` para o SKU | `PRODUTO_INSERIDO` |
| `editarItem` | `podeMutarCarrinho()`; linha não cancelada | Aplica o valor; se `campo = 'quantidade'`, chama `repricarSku`. Se a linha estava congelada, **descongela** (`FR-017`, I6) e passa a participar do agregado | `PRODUTO_ALTERADO` |
| `cancelarItem` | `podeMutarCarrinho()`; linha não cancelada | Seta `cancelada = true` (nunca remove do array) e chama `repricarSku`, o que pode derrubar as linhas remanescentes para a faixa inferior (`FR-008`) | `PRODUTO_CANCELADO` |
| `reprecificarPorTrocaDeCliente` | `TipoPreco = 9` ou cliente com `DescontoConvenio` diferente | Chama `repricarSku` para cada SKU distinto com linha ativa não-congelada | nenhum evento próprio — a troca de cliente é auditada pela feature 005 (`CLIENTE_TROCADO`) |
| `limparCarrinho` | — | Esvazia `linhas`. Chamado pela feature 004 após entrega bem-sucedida ao ERP, junto com `descartarAuditoria` e a invalidação do cache de produto | nenhum |

**Reprecificação automática não emite evento de auditoria** — só a ação do operador emite (`research.md`, D11).

`cancelarItem` **não** exige aprovação de supervisor nem reautenticação (`FR-012`, AD-065). O único bloqueio é `podeMutarCarrinho()`.

---

## 3. O que este contrato garante às outras features

| Feature | Consome |
|---|---|
| 001 — auditoria | recebe os 3 eventos de produto pelo dispatcher tipado |
| 004 — finalização/suspensão | lê `linhas` para montar o payload de `FaturarNFCe`; chama `limparCarrinho` após sucesso |
| 005 — cliente | fornece `clienteAtual()`; dispara `reprecificarPorTrocaDeCliente` |
| 006 — DAV / 011 — rascunho NFCe | inserem linhas com `precoCongelado: true` e `origem ∈ {'DAV','RASCUNHO'}` |
| 008 — pagamento | fornece `podeMutarCarrinho()` |

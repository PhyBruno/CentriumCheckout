# Contrato: módulos do motor de desconto

**Feature**: [spec.md](../spec.md) | **Modelo**: [data-model.md](../data-model.md)

Três fronteiras mudam: os módulos de domínio puro, as ações de store, e o contrato com o ERP/BFF. Assinaturas abaixo são as definitivas; o corpo é de `/speckit-implement`.

## 1. Domínio puro (sem React, Zustand, Query ou rede)

### 1.1 `domain/precificacao/dinheiro.ts` — acréscimo

```ts
/** valor ÷ quantidade, em centavos inteiros, meio-para-longe-de-zero. Lança em quantidade ≤ 0. */
export function dividirPorQuantidade(valor: Centavos, quantidade: Milesimos): Centavos;
```

Reusa o `dividirArredondando` privado já existente. Nenhum ponto flutuante.

### 1.2 `domain/precificacao/descontoItem.ts` — NOVO

```ts
/** Produto `'E'` com preço de tabela > 0: o único em que preço e desconto se vinculam (D2). */
export function ehVinculavel(snapshot: SnapshotPrecoProduto): boolean;

/** (precoBase − preço) × quantidade; 0 quando preço ≥ precoBase. */
export function descontoDoPreco(precoBase: Centavos, preco: Centavos, quantidade: Milesimos): Centavos;

/** precoBase − desconto ÷ quantidade, piso em zero. Valor de EXIBIÇÃO (D3/D4). */
export function precoDoDesconto(precoBase: Centavos, desconto: Centavos, quantidade: Milesimos): Centavos;

/** (precoBase − precoMinimo) × quantidade com piso 0; `null` quando precoMinimo = 0 (sem limite). */
export function limiteDeDesconto(
  precoBase: Centavos, precoMinimo: Centavos, quantidade: Milesimos,
): Centavos | null;

export interface AjusteDeMinimo { readonly desconto: Centavos; readonly ajustado: boolean }
export function ajustarAoPrecoMinimo(desconto: Centavos, limite: Centavos | null): AjusteDeMinimo;

export interface ItemConsolidado { readonly precoUnitario: Centavos; readonly descontoManual: Centavos }
/** Preço praticado → o par (precoUnitario, descontoManual) que a linha guarda. */
export function consolidarPorPreco(
  snapshot: SnapshotPrecoProduto, preco: Centavos, quantidade: Milesimos,
): ItemConsolidado;
/** Desconto digitado → o par que a linha guarda (precoUnitario = precoBase). */
export function consolidarPorDesconto(
  snapshot: SnapshotPrecoProduto, desconto: Centavos,
): ItemConsolidado;
```

Pré-condição de todas: `ehVinculavel(snapshot)`. Fora dele a barra não chama o módulo e a linha segue o modelo antigo.

### 1.3 `domain/pagamento/descontoCapa.ts` — acréscimos

```ts
export type OrigemDescontoCapa = 'CONDICAO' | 'MANUAL';
export interface DescontoCapa { modo; entrada; valorResolvido; readonly origem: OrigemDescontoCapa }

/** Teto da condição em centavos. `null` = sem condição (sem teto); 0 = condição sem desconto. */
export function tetoDaCapa(
  condicao: Pick<CondicaoPagamento, 'descontoMaximo'> | null,
  subtotal: Centavos,
): Centavos | null;

export type RecusaDescontoCapa = 'ZERA_A_VENDA' | 'ZERA_UM_ITEM' | 'CONDICAO_SEM_DESCONTO';

export interface ResolucaoDaCapa {
  readonly modo: 'PERCENTUAL' | 'VALOR';
  readonly entrada: number;          // já ajustada ao teto, quando for o caso
  readonly valorResolvido: Centavos;
  readonly ajustadaAoTeto: boolean;
}
/** Resolve a entrada, aplicando o teto como AJUSTE. `null` + recusa quando o teto é 0. */
export function resolverCapaComTeto(
  modo: 'PERCENTUAL' | 'VALOR',
  entrada: number,
  subtotal: Centavos,
  teto: Centavos | null,
  descontoMaximo: number | null,
): ResolucaoDaCapa | { readonly recusa: 'CONDICAO_SEM_DESCONTO' };
```

`recusaDoDescontoCapa(valor, subtotal, linhas)` **não muda de assinatura**; com a chave ligada o slice passa `linhas = []` (D13).

### 1.4 `domain/venda/montarRetratoVenda.ts`

```ts
export type DescontoCapaNoRetrato =
  | { readonly tipo: 'RATEADA'; readonly rateio: ReadonlyMap<string, Centavos> }
  | { readonly tipo: 'NO_CABECALHO'; readonly valor: Centavos };

export function montarRetratoVenda(
  snapshot: SnapshotVenda,
  operacao: OperacaoVenda,
  pagamentos: readonly FormaDePagamentoRetrato[],
  descontoCapa: DescontoCapaNoRetrato = { tipo: 'RATEADA', rateio: new Map() },
): CheckoutFaturarNFCe;
```

Compatível com chamadas antigas que omitiam o 4º argumento. `reaisDeCentavos` passa a ser importada de `dinheiro.ts` (remove a cópia local, linha 166).

### 1.5 `domain/auditoria/eventos.ts`

```ts
export function eventoDescontoCapaAplicado(detalhes: {
  origem: OrigemDescontoCapa; modo: 'PERCENTUAL' | 'VALOR'; entrada: number; valor: number;
}): EventoDescontoCapaAplicado;

/** Último `DESCONTO_CAPA_APLICADO` do histórico da venda, ou `null`. Base da deduplicação (research D10). */
export function ultimoDescontoCapaAuditado(
  eventos: readonly EventoAuditoria[],
): EventoDescontoCapaAplicado | null;
```

## 2. Stores

### 2.1 `CarrinhoSlice`

```ts
/** Aplica quantidade, preço e desconto como uma operação só. `true` = gravou. Nunca grava parcial. */
atualizarItem(
  idLinha: string,
  ajustes: { quantidade: Milesimos; precoUnitario: Centavos; descontoManual: Centavos },
): boolean;
```

Sequência interna: bloqueio do carrinho → monta a linha resultante → reprecifica se a quantidade mudou → **ajusta ao preço mínimo** (avisa se ajustou) → `descontoZeraALinha` (recusa e avisa) → `aplicarLinhas` → audita por campo alterado. `editarItem` e `inserirItem` **ganham a mesma guarda de preço mínimo**, no mesmo ponto em que hoje checam `descontoZeraALinha`.

Aviso novo (constante junto de `AVISO_DESCONTO_ZERA_A_LINHA`): `Preço mínimo deste item: ${formatarCentavos(min)}. O desconto foi ajustado automaticamente.`

### 2.2 `PagamentoSlice` / `PagamentoDeps`

```ts
// PagamentoDeps — nova porta
descontoCapaNoErp(): boolean;           // lê recursos.descontoCapaNoErp do bootstrap; false sem registro

// PagamentoSlice
aplicarDescontoCapa(modo, entrada, opcoes?): boolean;   // assinatura inalterada
// retorno: true = gravou (inclusive ajustada ao teto); false = recusou
montarPagamentosParaPayload(): {
  CondicaoPagamentoCodigo: number;
  FormasDePagamento: FormaDePagamentoRetrato[];
  descontoCapa: DescontoCapaNoRetrato;   // substitui `rateioDescontoCapa`
};
```

Comportamentos novos de `aplicarDescontoCapa`: (a) consulta o teto da `condicaoSelecionada`; (b) acima do teto grava `valorResolvido = teto` e avisa (exceto `silencioso`); (c) teto 0 recusa com `AVISO_CONDICAO_SEM_DESCONTO`; (d) grava `origem: 'MANUAL'`; (e) emite `DESCONTO_CAPA_APLICADO` quando **não** silenciosa e a capa difere do **último `DESCONTO_CAPA_APLICADO` em `eventos`** (seletor puro `ultimoDescontoCapaAuditado(eventos)`, em `eventos.ts`) — sem estado guardado no slice, para a dedup não atravessar vendas.

`selecionarCondicao(condicao)`: grava `condicaoSelecionada` **e** `descontoCapa` no mesmo `set` (I-D4); capa nova com `origem: 'CONDICAO'`, ou `null`. Quando aplica uma capa, emite `DESCONTO_CAPA_APLICADO` com `origem: 'CONDICAO'` (mesma dedup de `aplicarDescontoCapa`); quando o desconto é limitado ao teto (FR-020) ou zeraria a venda (FR-021), avisa.

### 2.3 `ValidacaoDeps`

`rateioDescontoCapa(): ReadonlyMap` → `descontoCapa(): DescontoCapaNoRetrato`. Corpo em `vendaStore.ts` continua um repasse de `montarPagamentosParaPayload()`.

## 3. Hooks de UI

```ts
// features/carrinho/useVinculoPrecoDesconto.ts — NOVO
useVinculoPrecoDesconto(args: { snapshot, quantidade, vinculavel, aoAjustar }): {
  precoTexto: string; descontoTexto: string;
  mudarPreco(texto: string): void;
  mudarDesconto(texto: string): void;
  mudarQuantidade(q: Milesimos): void;
  ajustarAoMinimo(): { precoTexto: string; descontoTexto: string } | null; // null = nada a ajustar
  carregar(linha: LinhaCarrinho): void;     // lápis
  zerar(): void;
};

// features/carrinho/useCarrinho.ts — ALTERADO
confirmarEdicaoDeLinha(...): Promise<ResultadoConfirmacao>
// agora chama atualizarItem; devolve { situacao: 'recusado' } quando atualizarItem devolve false.
```

`ResultadoConfirmacao` ganha `'recusado'` (hoje só `'confirmado' | 'bloqueado'`), para a barra **não** se limpar quando a edição foi recusada.

## 4. Contrato BFF → cliente

`GET /api/bootstrap` — corpo, na raiz, ao lado de `tenant` e `codigoEmpresa`:

```json
{ "recursos": { "descontoCapaNoErp": false } }
```

Entra no hash do ETag: ligar ou desligar a chave muda o hash, o servidor responde 200 e o registro novo substitui o do Dexie. O `default` do schema cobre só payload **recém-buscado** sem o campo; o registro já guardado não é reparseado ao ler, então a leitura no cliente (`pagamentoDepsPadrao.descontoCapaNoErp`) tolera a ausência em runtime e vale `false`.

Variável de ambiente: `DESCONTO_CAPA_NO_ERP` ∈ {`true`, `false`}, padrão `false`. Declarada em `.env.example`, `docker-compose.yml` e `deploy/beta/docker-stack.yml`.

## 5. Contrato Checkout → ERP (`FaturarNFCe` e `ValidarNFCe`, mesmo corpo)

| Chave | `CheckoutFaturarNFCe.DescontoCapaValor` | `produtos[].DescontoValor` | `produtos[].ValorTotal` |
|---|---|---|---|
| desligada | **ausente** | convênio + manual + parcela rateada | `totalLinha − parcela` |
| ligada | `number` em reais, `0` sem capa | convênio + manual | `totalLinha` |

O BFF (`erp-proxy.ts`) só reescreve `Empresa` e `UsuarioCodigo` e repassa o resto: **nenhuma mudança no proxy**.

**Confirmado em 2026-10-13:** o nome é `DescontoCapaValor`; é valor monetário em reais com até 2 casas decimais (como `DescontoValor`); e a porcentagem, quando a capa é dada em %, é calculada pelo Checkout (`resolverDescontoCapa`/`aplicarPercentual`), de modo que só o valor resolvido viaja. Serializado por `reaisDeCentavos` (inteiro de centavos ÷ 100), sem ponto flutuante intermediário.

**Pendente com o ERP (bloqueia ligar a chave, não o desenvolvimento):** a regra de rateio dele; se o campo ausente equivale a zero (o Checkout sempre o envia quando a chave está ligada); e a reconferência de preço mínimo e teto no `ValidarNFCe`. Registrar em `PENDENCIES.md`.

/**
 * Resolução do **preço unitário base** por `SessaoUsuario.TipoPreco` (T007).
 *
 * Devolve o preço de **uma** unidade. Quantidade e desconto não entram aqui —
 * são aplicados por `calcularTotalLinha`, que multiplica e só então subtrai
 * (`data-model.md` §5).
 *
 * Constitution III: o Checkout não reimplementa a seleção de regra de preço.
 * Para todo `TipoPreco ≠ 8`, o ERP já resolveu e entregou o resultado em
 * `PrecoVenda` (AD-059/AD-060). `8` é a única exceção, e não por escolha do
 * Checkout: a faixa depende da quantidade agregada do SKU no carrinho, estado
 * que só existe aqui — é delegação, não duplicação de fonte de verdade
 * (`research.md`, D2).
 */

import type { Centavos } from './dinheiro';
import type { SnapshotPrecoProduto } from './linha';
import type { Milesimos } from './quantidade';

const TIPO_PRECO_MIN = 1;
const TIPO_PRECO_MAX = 11;
/** O único `TipoPreco` cujo preço é resolvido localmente, por faixa de quantidade. */
const TIPO_PRECO_POR_FAIXA = 8;

/** `TipoPreco` fora de `1..11` — configuração de sessão que o domínio não conhece. */
export class ErroTipoPrecoDesconhecido extends Error {
  constructor(tipoPreco: number) {
    super(
      `TipoPreco ${String(tipoPreco)} está fora do contrato do ERP (${String(TIPO_PRECO_MIN)}..${String(TIPO_PRECO_MAX)}).`,
    );
    this.name = 'ErroTipoPrecoDesconhecido';
  }
}

/** Snapshot sem o preço da faixa que a quantidade agregada atingiu. */
export class ErroFaixaSemPreco extends Error {
  constructor(codigoProduto: string, faixa: number) {
    super(
      `Produto ${codigoProduto} não tem PrecoVenda${String(faixa)} para a faixa atingida em TipoPreco 8.`,
    );
    this.name = 'ErroFaixaSemPreco';
  }
}

/**
 * Faixa (1 a 5) atingida pela quantidade agregada, em modelo de **limiar único
 * (flat)**, não progressivo: atingida a faixa, **todas** as unidades do SKU na
 * venda valem o preço dela (`FR-006`).
 *
 * Limiar `0` é faixa **não configurada** e é ignorado — o ERP devolve `0` nos
 * `QtdMinimaPreco` que o produto não usa.
 */
export function resolverFaixa(
  limiares: SnapshotPrecoProduto['limiaresFaixa'],
  quantidadeAgregada: Milesimos,
): number {
  let faixa = 1;
  // Percorre em ordem crescente e fica com a última que satisfaz, ou seja, a
  // maior faixa cujo limiar foi atingido.
  for (let indice = 0; indice < limiares.length; indice += 1) {
    const limiar = limiares[indice];
    if (limiar !== undefined && limiar > 0 && quantidadeAgregada >= limiar) {
      faixa = indice + 2;
    }
  }
  return faixa;
}

/**
 * Função **total**: `tipoPreco` fora de `1..11` lança erro de domínio explícito
 * em vez de devolver um preço silenciosamente errado.
 */
export function resolvePrecoUnitario(
  tipoPreco: number,
  snapshot: SnapshotPrecoProduto,
  quantidadeAgregada: Milesimos,
): Centavos {
  if (!Number.isInteger(tipoPreco) || tipoPreco < TIPO_PRECO_MIN || tipoPreco > TIPO_PRECO_MAX) {
    throw new ErroTipoPrecoDesconhecido(tipoPreco);
  }

  if (tipoPreco !== TIPO_PRECO_POR_FAIXA) {
    return snapshot.precoBase;
  }

  const faixa = resolverFaixa(snapshot.limiaresFaixa, quantidadeAgregada);
  const preco = snapshot.precosFaixa[faixa - 1];
  if (preco === undefined) {
    throw new ErroFaixaSemPreco(snapshot.codigoProduto, faixa);
  }
  return preco;
}

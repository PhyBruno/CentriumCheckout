/**
 * Filtro **local** por saldo de estoque no modal de busca de produto (AD-258,
 * pedido do usuário em 2026-10-01; frame "PDV Online Web - Modal produto", nó
 * `pTSJu` do Pencil: operadores `>=`, `<=`, `=` e uma quantidade).
 *
 * Local porque `GetListaProdutos` não tem parâmetro de estoque: o filtro age
 * sobre a página que o ERP devolveu. Comparação entre inteiros (milésimos), sem
 * ponto flutuante — o mesmo critério de `avaliarSaldo`.
 */
import type { SaldoMilesimos } from './saldoProduto';

export type OperadorSaldo = '>=' | '<=' | '=';

export const OPERADORES_SALDO: readonly OperadorSaldo[] = ['>=', '<=', '='];

export interface FiltroSaldo {
  readonly operador: OperadorSaldo;
  /** `null` = sem quantidade digitada, isto é, filtro desligado. */
  readonly quantidade: SaldoMilesimos | null;
}

export const FILTRO_SALDO_DESLIGADO: FiltroSaldo = { operador: '>=', quantidade: null };

export function filtroSaldoAtivo(filtro: FiltroSaldo): boolean {
  return filtro.quantidade !== null;
}

/**
 * O saldo passa no filtro? Produto **sem saldo informado** (`null`) nunca passa
 * num filtro ativo: não dá para afirmar que ele tem pelo menos, no máximo ou
 * exatamente a quantidade pedida — e mostrá-lo seria responder "sim" sem dado.
 */
export function saldoAtendeFiltro(saldo: SaldoMilesimos | null, filtro: FiltroSaldo): boolean {
  if (filtro.quantidade === null) {
    return true;
  }
  if (saldo === null) {
    return false;
  }
  switch (filtro.operador) {
    case '>=':
      return saldo >= filtro.quantidade;
    case '<=':
      return saldo <= filtro.quantidade;
    case '=':
      return saldo === filtro.quantidade;
  }
}

export function filtrarPorSaldo<T>(
  itens: readonly T[],
  saldoDe: (item: T) => SaldoMilesimos | null,
  filtro: FiltroSaldo,
): readonly T[] {
  if (!filtroSaldoAtivo(filtro)) {
    return itens;
  }
  return itens.filter((item) => saldoAtendeFiltro(saldoDe(item), filtro));
}

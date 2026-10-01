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
 * O saldo passa no filtro? Produto **sem saldo informado** (`null`) **sempre
 * passa**: o filtro só julga o saldo que conhece, e a célula mostra "—".
 *
 * Esconder o desconhecido parecia o mais rigoroso, mas o modal abre com o
 * filtro já ligado (`>= 0`, pedido do usuário em 2026-10-01): contra um ERP
 * que não publique `Estoque`, a busca abriria vazia e o operador não acharia
 * produto nenhum sem saber por quê. Quem decide inserção é o saldo fresco do
 * `GetProduto` (AD-236), não este filtro de exibição.
 */
export function saldoAtendeFiltro(saldo: SaldoMilesimos | null, filtro: FiltroSaldo): boolean {
  if (filtro.quantidade === null || saldo === null) {
    return true;
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

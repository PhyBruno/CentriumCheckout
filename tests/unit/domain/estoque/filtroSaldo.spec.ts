import { describe, expect, it } from 'vitest';
import {
  FILTRO_SALDO_DESLIGADO,
  filtrarPorSaldo,
  saldoAtendeFiltro,
  type FiltroSaldo,
} from '../../../../src/client/domain/estoque/filtroSaldo';
import {
  saldoEmMilesimos,
  type SaldoMilesimos,
} from '../../../../src/client/domain/estoque/saldoProduto';

/** Filtro local de saldo do modal de busca de produto (AD-258). */
function filtro(operador: FiltroSaldo['operador'], unidades: number): FiltroSaldo {
  return { operador, quantidade: saldoEmMilesimos(unidades) };
}

const saldo = (unidades: number): SaldoMilesimos => saldoEmMilesimos(unidades);

describe('saldoAtendeFiltro', () => {
  it('compara pelos três operadores, com o limite incluído em >= e <=', () => {
    expect(saldoAtendeFiltro(saldo(10), filtro('>=', 10))).toBe(true);
    expect(saldoAtendeFiltro(saldo(9.999), filtro('>=', 10))).toBe(false);
    expect(saldoAtendeFiltro(saldo(10), filtro('<=', 10))).toBe(true);
    expect(saldoAtendeFiltro(saldo(10.001), filtro('<=', 10))).toBe(false);
    expect(saldoAtendeFiltro(saldo(10), filtro('=', 10))).toBe(true);
    expect(saldoAtendeFiltro(saldo(10.5), filtro('=', 10))).toBe(false);
  });

  it('saldo negativo passa em <=, como qualquer número', () => {
    expect(saldoAtendeFiltro(saldo(-1), filtro('<=', 0))).toBe(true);
    expect(saldoAtendeFiltro(saldo(-1), filtro('>=', 0))).toBe(false);
  });

  it('produto sem saldo informado não é escondido — o filtro só julga o que conhece', () => {
    // O modal abre com `>= 0` ligado: esconder o desconhecido deixaria a busca
    // vazia contra um ERP que não publique `Estoque`.
    expect(saldoAtendeFiltro(null, filtro('>=', 0))).toBe(true);
    expect(saldoAtendeFiltro(null, filtro('=', 5))).toBe(true);
  });

  it('filtro desligado deixa passar tudo, inclusive sem saldo', () => {
    expect(saldoAtendeFiltro(null, FILTRO_SALDO_DESLIGADO)).toBe(true);
    expect(saldoAtendeFiltro(saldo(-5), FILTRO_SALDO_DESLIGADO)).toBe(true);
  });
});

describe('filtrarPorSaldo', () => {
  const itens = [
    { codigo: 'A', saldo: saldo(0) },
    { codigo: 'B', saldo: saldo(18) },
    { codigo: 'C', saldo: null },
  ];

  it('mantém a ordem da página e só os que passam (sem saldo fica)', () => {
    expect(
      filtrarPorSaldo(itens, (item) => item.saldo, filtro('>=', 1)).map((i) => i.codigo),
    ).toEqual(['B', 'C']);
  });

  it('desligado devolve a mesma lista', () => {
    expect(filtrarPorSaldo(itens, (item) => item.saldo, FILTRO_SALDO_DESLIGADO)).toBe(itens);
  });
});

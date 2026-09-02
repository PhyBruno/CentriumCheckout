import { describe, expect, it } from 'vitest';
import {
  ErroFaixaSemPreco,
  ErroTipoPrecoDesconhecido,
  resolvePrecoUnitario,
} from '../../../../src/client/domain/precificacao/tabelaPreco';
import { snapshotDe, unidades } from '../../../support/precificacao';

/** T026 — um caso por `TipoPreco` de 1 a 11, e as bordas das faixas de 8. */
describe('resolvePrecoUnitario', () => {
  const snapshot = snapshotDe({ precoBase: 1000, precosFaixa: [1000, 900, 800, 700, 600] });

  it.each([1, 2, 3, 4, 5, 6, 7, 9, 10, 11])(
    'TipoPreco %i usa o PrecoVenda já resolvido pelo ERP (AD-059/AD-060)',
    (tipoPreco) => {
      // Mesmo com quantidade que cruzaria todas as faixas, o preço é o base:
      // fora de 8 o Checkout não decide regra de preço (Constitution III).
      expect(resolvePrecoUnitario(tipoPreco, snapshot, unidades(999))).toBe(1000);
    },
  );

  it.each([0, 12, -1, 1.5])('recusa TipoPreco %s, fora do contrato do ERP', (tipoPreco) => {
    expect(() => resolvePrecoUnitario(tipoPreco, snapshot, unidades(1))).toThrow(
      ErroTipoPrecoDesconhecido,
    );
  });
});

describe('resolvePrecoUnitario — TipoPreco 8 (faixa flat)', () => {
  const comQuatroFaixas = snapshotDe({
    precosFaixa: [1000, 900, 800, 700, 600],
    limiaresFaixaEmUnidades: [5, 10, 20, 50],
  });

  it.each([
    [4, 1000],
    [5, 900],
    [6, 900],
    [9, 900],
    [10, 800],
    [19, 800],
    [20, 700],
    [49, 700],
    [50, 600],
    [999, 600],
  ])('quantidade agregada de %i unidades resolve para %i centavos', (quantidade, esperado) => {
    expect(resolvePrecoUnitario(8, comQuatroFaixas, unidades(quantidade))).toBe(esperado);
  });

  it('trata limiar 0 como faixa não configurada e o ignora', () => {
    // Só a faixa 2 está configurada; 3, 4 e 5 vêm com limiar 0 do ERP.
    const soUmaFaixa = snapshotDe({
      precosFaixa: [1000, 900, 800, 700, 600],
      limiaresFaixaEmUnidades: [5, 0, 0, 0],
    });

    expect(resolvePrecoUnitario(8, soUmaFaixa, unidades(4))).toBe(1000);
    expect(resolvePrecoUnitario(8, soUmaFaixa, unidades(5))).toBe(900);
    // Quantidade altíssima não escorrega para PrecoVenda3..5, que não valem.
    expect(resolvePrecoUnitario(8, soUmaFaixa, unidades(9999))).toBe(900);
  });

  it('aplica a faixa sobre quantidade agregada fracionária', () => {
    expect(resolvePrecoUnitario(8, comQuatroFaixas, unidades(4.999))).toBe(1000);
    expect(resolvePrecoUnitario(8, comQuatroFaixas, unidades(5.001))).toBe(900);
  });

  it('sem nenhum limiar configurado, fica na faixa 1', () => {
    const semFaixas = snapshotDe({
      precosFaixa: [1000, 900, 800, 700, 600],
      limiaresFaixaEmUnidades: [0, 0, 0, 0],
    });

    expect(resolvePrecoUnitario(8, semFaixas, unidades(1000))).toBe(1000);
  });

  it('lança ErroFaixaSemPreco quando a faixa atingida tem QtdMinimaPreco configurado mas PrecoVenda em 0 (bug confirmado na revisão)', () => {
    // QtdMinimaPreco2 = 5 está configurado no ERP, mas PrecoVenda2 nunca foi
    // cadastrado (ficou em 0): resolver em silêncio para R$0,00 esconderia o
    // erro de configuração em vez de sinalizá-lo.
    const faixaSemPreco = snapshotDe({
      precosFaixa: [1000, 0, 0, 0, 0],
      limiaresFaixaEmUnidades: [5, 0, 0, 0],
    });

    expect(() => resolvePrecoUnitario(8, faixaSemPreco, unidades(5))).toThrow(ErroFaixaSemPreco);
  });

  it('preço R$0,00 na faixa 1 (preço-base) não lança erro — faixa 1 não depende de limiar', () => {
    const precoBaseZero = snapshotDe({
      precosFaixa: [0, 900, 0, 0, 0],
      limiaresFaixaEmUnidades: [5, 0, 0, 0],
    });

    expect(resolvePrecoUnitario(8, precoBaseZero, unidades(1))).toBe(0);
  });
});

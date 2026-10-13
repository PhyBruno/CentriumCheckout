import { describe, expect, it } from 'vitest';
import { centavos } from '../../../../src/client/domain/precificacao/dinheiro';
import {
  ajustarAoPrecoMinimo,
  consolidarPorDesconto,
  consolidarPorPreco,
  descontoDoPreco,
  ehVinculavel,
  limiteDeDesconto,
  precoDoDesconto,
} from '../../../../src/client/domain/precificacao/descontoItem';
import { milesimosDeUnidades } from '../../../../src/client/domain/precificacao/quantidade';
import { snapshotDe } from '../../../support/precificacao';

/**
 * Vínculo preço ↔ desconto do item (017, US1, `contracts/motor-desconto-api.md`
 * §1.2). Todos os valores em centavos; a referência é sempre `precoBase`.
 */

const VINTE = centavos(2000);
const um = milesimosDeUnidades(1);
const tres = milesimosDeUnidades(3);

describe('ehVinculavel', () => {
  it('só produto E com preço de tabela positivo', () => {
    expect(ehVinculavel(snapshotDe({ pesavelEditavel: 'E', precoBase: 2000 }))).toBe(true);
  });

  it.each(['S', 'B', ''] as const)('produto %s não vincula', (pesavelEditavel) => {
    expect(ehVinculavel(snapshotDe({ pesavelEditavel, precoBase: 2000 }))).toBe(false);
  });

  it('preço de tabela zero não vincula (FR-005)', () => {
    expect(ehVinculavel(snapshotDe({ pesavelEditavel: 'E', precoBase: 0 }))).toBe(false);
  });
});

describe('descontoDoPreco', () => {
  it('é a diferença sobre o total da linha', () => {
    expect(descontoDoPreco(VINTE, centavos(1800), um)).toBe(200);
    expect(descontoDoPreco(VINTE, centavos(1800), tres)).toBe(600);
  });

  it('preço igual ou acima da tabela não gera desconto (sem acréscimo)', () => {
    expect(descontoDoPreco(VINTE, VINTE, tres)).toBe(0);
    expect(descontoDoPreco(VINTE, centavos(2500), tres)).toBe(0);
  });
});

describe('precoDoDesconto', () => {
  it('desce o preço pelo desconto unitário', () => {
    expect(precoDoDesconto(VINTE, centavos(500), um)).toBe(1500);
  });

  it('desconto zero devolve o preço de tabela', () => {
    expect(precoDoDesconto(VINTE, centavos(0), um)).toBe(2000);
  });

  it('divisão não exata arredonda o preço exibido ao centavo', () => {
    // R$ 1,00 ÷ 3 = 0,333… → 0,33; 20,00 − 0,33 = 19,67
    expect(precoDoDesconto(VINTE, centavos(100), tres)).toBe(1967);
  });

  it('tem piso em zero', () => {
    expect(precoDoDesconto(VINTE, centavos(9_000), um)).toBe(0);
  });
});

describe('consolidarPorPreco', () => {
  const snapshot = snapshotDe({ pesavelEditavel: 'E', precoBase: 2000 });

  it('preço abaixo da tabela vira referência + desconto', () => {
    expect(consolidarPorPreco(snapshot, centavos(1800), tres)).toEqual({
      precoUnitario: 2000,
      descontoManual: 600,
    });
  });

  it('preço acima da tabela vira o próprio precoUnitario, sem desconto', () => {
    expect(consolidarPorPreco(snapshot, centavos(2500), tres)).toEqual({
      precoUnitario: 2500,
      descontoManual: 0,
    });
  });
});

describe('consolidarPorDesconto', () => {
  it('a referência é sempre o preço de tabela', () => {
    const snapshot = snapshotDe({ pesavelEditavel: 'E', precoBase: 2000 });

    expect(consolidarPorDesconto(snapshot, centavos(100))).toEqual({
      precoUnitario: 2000,
      descontoManual: 100,
    });
  });
});

/** 017, US2 (T027) — o preço mínimo limita o desconto, em totais (research D7). */
describe('limiteDeDesconto', () => {
  const oito = centavos(800);

  it('é (tabela − mínimo) × quantidade', () => {
    expect(limiteDeDesconto(VINTE, oito, um)).toBe(1200);
    expect(limiteDeDesconto(VINTE, oito, tres)).toBe(3600);
  });

  it('mínimo zero significa sem limite', () => {
    expect(limiteDeDesconto(VINTE, centavos(0), tres)).toBeNull();
  });

  it('mínimo igual ou acima da tabela não deixa desconto nenhum', () => {
    expect(limiteDeDesconto(VINTE, VINTE, tres)).toBe(0);
    expect(limiteDeDesconto(VINTE, centavos(2500), tres)).toBe(0);
  });
});

describe('ajustarAoPrecoMinimo', () => {
  it('dentro do limite não ajusta', () => {
    expect(ajustarAoPrecoMinimo(centavos(1200), centavos(1200))).toEqual({
      desconto: 1200,
      ajustado: false,
    });
  });

  it('acima do limite devolve o limite', () => {
    expect(ajustarAoPrecoMinimo(centavos(1500), centavos(1200))).toEqual({
      desconto: 1200,
      ajustado: true,
    });
  });

  it('sem limite nunca ajusta', () => {
    expect(ajustarAoPrecoMinimo(centavos(99_999), null)).toEqual({
      desconto: 99_999,
      ajustado: false,
    });
  });
});

/**
 * I-D2: preço exibido e desconto armazenado só divergem pelo arredondamento —
 * no máximo 1 centavo no preço unitário, para quantidade a partir de 1.
 */
describe('propriedade de ida e volta (I-D2)', () => {
  it('preço → desconto → preço volta dentro de 1 centavo', () => {
    for (const base of [1, 99, 2000, 12_345]) {
      for (let preco = 0; preco <= base; preco += Math.max(1, Math.floor(base / 37))) {
        for (const qtd of [1, 2, 3, 7, 1.5, 2.25]) {
          const quantidade = milesimosDeUnidades(qtd);
          const desconto = descontoDoPreco(centavos(base), centavos(preco), quantidade);
          const volta = precoDoDesconto(centavos(base), desconto, quantidade);
          expect(Math.abs(volta - preco)).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

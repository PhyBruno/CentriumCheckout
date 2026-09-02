import { describe, expect, it } from 'vitest';
import {
  aplicarPercentual,
  calcularTotalLinha,
  centavos,
  distribuirPorMaiorResto,
  ErroPrecisaoMonetaria,
  multiplicarPorQuantidade,
  somar,
  subtrair,
} from '../../../../src/client/domain/precificacao/dinheiro';
import { milesimosDeUnidades } from '../../../../src/client/domain/precificacao/quantidade';

/** Cobertura prioritária declarada em `.specs/codebase/STACK.md` (T010). */
describe('dinheiro — centavos inteiros', () => {
  it('recusa valor fracionário, em vez de arredondar em silêncio', () => {
    expect(() => centavos(10.5)).toThrow(ErroPrecisaoMonetaria);
  });

  it('soma e subtrai sem drift de ponto flutuante', () => {
    // 0.1 + 0.2 em reais daria 0.30000000000000004; em centavos é exato.
    expect(somar(centavos(10), centavos(20))).toBe(30);
    expect(subtrair(centavos(30), centavos(20))).toBe(10);
  });
});

describe('multiplicarPorQuantidade — total bruto da linha', () => {
  it('multiplica por quantidade inteira', () => {
    expect(multiplicarPorQuantidade(centavos(1000), milesimosDeUnidades(3))).toBe(3000);
  });

  it('multiplica por quantidade fracionária (produto pesável)', () => {
    expect(multiplicarPorQuantidade(centavos(1000), milesimosDeUnidades(1.5))).toBe(1500);
  });

  it('não acumula erro de ponto flutuante em preço quebrado', () => {
    // R$ 19,99 × 3 = R$ 59,97 exatos.
    expect(multiplicarPorQuantidade(centavos(1999), milesimosDeUnidades(3))).toBe(5997);
    // R$ 0,10 × 0,3 = R$ 0,03 exatos.
    expect(multiplicarPorQuantidade(centavos(10), milesimosDeUnidades(0.3))).toBe(3);
  });

  it('arredonda a meio centavo para cima', () => {
    // 1001 × 1,5 = 1501,5 centavos → 1502.
    expect(multiplicarPorQuantidade(centavos(1001), milesimosDeUnidades(1.5))).toBe(1502);
  });
});

describe('aplicarPercentual — fator de convênio (AD-023)', () => {
  it('aplica o fator e arredonda a centavo inteiro', () => {
    // 10% de desconto sobre R$ 10,00 → fator 90% → R$ 9,00.
    expect(aplicarPercentual(centavos(1000), 90)).toBe(900);
  });

  it('aceita percentual fracionário do cadastro do cliente', () => {
    // Fator 92,5% sobre 1333 centavos = 1232,525 → 1233.
    expect(aplicarPercentual(centavos(1333), 92.5)).toBe(1233);
  });
});

describe('distribuirPorMaiorResto (AD-072, FR-016)', () => {
  it('devolve parcelas cuja soma é exatamente o total, mesmo sem fechar em centavos', () => {
    const parcelas = distribuirPorMaiorResto(centavos(100), [
      centavos(1),
      centavos(1),
      centavos(1),
    ]);

    expect(parcelas.reduce<number>((total, parcela) => total + parcela, 0)).toBe(100);
    // A sobra vai um centavo por vez, do maior resto para o menor; empate
    // resolve pelo menor índice, para o resultado ser determinístico.
    expect(parcelas).toEqual([34, 33, 33]);
  });

  it('distribui a sobra pelos maiores restos, não pelos maiores pesos', () => {
    const parcelas = distribuirPorMaiorResto(centavos(10), [
      centavos(3),
      centavos(3),
      centavos(4),
    ]);

    expect(parcelas.reduce<number>((total, parcela) => total + parcela, 0)).toBe(10);
  });

  it('não gera sobra quando o rateio já fecha exato', () => {
    expect(
      distribuirPorMaiorResto(centavos(1000), [centavos(333), centavos(333), centavos(334)]),
    ).toEqual([333, 333, 334]);
  });

  it('recusa ratear um total diferente de zero sem pesos', () => {
    expect(() => distribuirPorMaiorResto(centavos(100), [])).toThrow(ErroPrecisaoMonetaria);
  });
});

describe('calcularTotalLinha — única fonte do valor da linha (I9)', () => {
  it('desconto zero devolve preço × quantidade', () => {
    expect(calcularTotalLinha(centavos(1000), milesimosDeUnidades(3), centavos(0))).toBe(3000);
  });

  it('subtrai o desconto do total, depois da multiplicação — não do preço unitário', () => {
    // Se o desconto incidisse sobre o unitário, o total seria (1000-100)×3 = 2700.
    expect(calcularTotalLinha(centavos(1000), milesimosDeUnidades(3), centavos(100))).toBe(2900);
  });

  it('funciona com quantidade fracionária (produto pesável)', () => {
    expect(calcularTotalLinha(centavos(1000), milesimosDeUnidades(1.234), centavos(0))).toBe(1234);
  });

  it('aplica piso zero quando o desconto supera o total bruto (I8)', () => {
    expect(calcularTotalLinha(centavos(1000), milesimosDeUnidades(1), centavos(5000))).toBe(0);
  });
});

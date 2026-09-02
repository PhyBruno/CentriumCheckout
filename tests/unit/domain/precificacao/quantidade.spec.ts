import { describe, expect, it } from 'vitest';
import {
  ErroQuantidadeInvalida,
  formatarQuantidade,
  milesimos,
  milesimosDeUnidades,
  somarQuantidades,
} from '../../../../src/client/domain/precificacao/quantidade';

/** T011 — conversão e formatação de `Milesimos`. */
describe('milesimosDeUnidades', () => {
  it('converte unidades inteiras', () => {
    expect(milesimosDeUnidades(3)).toBe(3000);
  });

  it('converte unidades fracionárias em 3 casas (AD-076)', () => {
    expect(milesimosDeUnidades(1.234)).toBe(1234);
    expect(milesimosDeUnidades(0.5)).toBe(500);
  });

  it('arredonda além da terceira casa', () => {
    expect(milesimosDeUnidades(1.2345)).toBe(1235);
  });

  it('recusa quantidade negativa', () => {
    expect(() => milesimosDeUnidades(-1)).toThrow(ErroQuantidadeInvalida);
  });

  it('recusa quantidade não finita', () => {
    expect(() => milesimosDeUnidades(Number.NaN)).toThrow(ErroQuantidadeInvalida);
  });
});

describe('milesimos', () => {
  it('recusa valor fracionário — sinal de divisão feita fora do domínio', () => {
    expect(() => milesimos(1500.5)).toThrow(ErroQuantidadeInvalida);
  });
});

describe('somarQuantidades — base do agregado por SKU', () => {
  it('soma sem drift de ponto flutuante', () => {
    const total = somarQuantidades(milesimosDeUnidades(0.1), milesimosDeUnidades(0.2));

    // 0.1 + 0.2 em unidades daria 0.30000000000000004 e quebraria a comparação
    // com o limiar de faixa — em milésimos é exato.
    expect(total).toBe(300);
  });
});

describe('formatarQuantidade', () => {
  it('formata sem casas decimais', () => {
    expect(formatarQuantidade(milesimosDeUnidades(3), 0)).toBe('3');
  });

  it('formata com 3 casas, vírgula decimal e zeros à esquerda', () => {
    expect(formatarQuantidade(milesimosDeUnidades(1.5), 3)).toBe('1,500');
    expect(formatarQuantidade(milesimosDeUnidades(0.07), 3)).toBe('0,070');
    expect(formatarQuantidade(milesimosDeUnidades(12.345), 3)).toBe('12,345');
  });
});

import { describe, expect, it } from 'vitest';
import {
  avaliarSaldo,
  formatarSaldo,
  normalizarPoliticaSaldo,
  quantidadeDoProdutoNoCarrinho,
  saldoEmMilesimos,
  type PoliticaSaldo,
} from '../../../../src/client/domain/estoque/saldoProduto';
import { linhaDe, snapshotDe, unidades } from '../../../support/precificacao';

/**
 * Regra de saldo de estoque do Checkout (AD-236) — réplica de
 * `PNFCe_ValidaSaldoProdutos` do ERP: soma das linhas do produto contra o
 * saldo, acusando só quando a soma é **maior** que o saldo.
 *
 * Valores sintéticos.
 */

const DESCRICAO = 'PRODUTO EXEMPLO 500G';

function avaliar(
  politica: PoliticaSaldo,
  saldoEmUnidades: number | null,
  noCarrinho: number,
  proposta: number,
  anterior?: number,
) {
  return avaliarSaldo({
    politica,
    saldo: saldoEmUnidades === null ? null : saldoEmMilesimos(saldoEmUnidades),
    quantidadeNoCarrinho: unidades(noCarrinho),
    quantidadeProposta: unidades(proposta),
    ...(anterior === undefined ? {} : { quantidadeAnterior: unidades(anterior) }),
    descricao: DESCRICAO,
  });
}

describe('avaliarSaldo — política × posição em relação ao saldo', () => {
  it.each<[PoliticaSaldo, number, number, number, string]>([
    // politica, saldo, no carrinho, proposta, veredito
    ['A', 10, 0, 5, 'livre'],
    ['A', 10, 5, 5, 'livre'],
    ['A', 10, 5, 6, 'aviso'],
    ['B', 10, 0, 5, 'livre'],
    ['B', 10, 5, 5, 'livre'],
    ['B', 10, 5, 6, 'bloqueio'],
    ['', 10, 0, 5, 'livre'],
    ['', 10, 5, 5, 'livre'],
    ['', 10, 5, 600, 'livre'],
  ])('política "%s", saldo %d, carrinho %d + proposta %d → %s', (politica, saldo, carrinho, proposta, veredito) => {
    expect(avaliar(politica, saldo, carrinho, proposta).veredito).toBe(veredito);
  });

  it('saldo negativo é válido e já barra a primeira unidade em "B"', () => {
    expect(avaliar('B', -205, 0, 1).veredito).toBe('bloqueio');
    expect(avaliar('A', -205, 0, 1).veredito).toBe('aviso');
  });

  it('saldo zero barra qualquer quantidade positiva em "B"', () => {
    expect(avaliar('B', 0, 0, 1).veredito).toBe('bloqueio');
  });

  it('sem Saldo na resposta do ERP (null) nada é acusado', () => {
    expect(avaliar('B', null, 100, 100).veredito).toBe('livre');
  });

  it('compara em milésimos, sem ponto flutuante: 0,1 + 0,2 contra saldo 0,3 passa', () => {
    const resultado = avaliarSaldo({
      politica: 'B',
      saldo: saldoEmMilesimos(0.3),
      quantidadeNoCarrinho: unidades(0.1),
      quantidadeProposta: unidades(0.2),
      descricao: DESCRICAO,
    });
    expect(resultado.veredito).toBe('livre');
  });

  it('a frase nomeia o produto, o disponível e o total na venda', () => {
    const resultado = avaliar('B', 78, 0, 79);
    expect(resultado).toEqual({
      veredito: 'bloqueio',
      frase: 'Estoque insuficiente para PRODUTO EXEMPLO 500G: disponível 78,000, na venda 79,000.',
    });
  });

  it('frase com saldo negativo leva o sinal', () => {
    const resultado = avaliar('A', -205, 0, 1);
    expect(resultado.veredito === 'livre' ? '' : resultado.frase).toContain('disponível -205,000');
  });
});

describe('avaliarSaldo — diminuir quantidade nunca bloqueia', () => {
  it('em "B", reduzir uma linha que ainda excede vira aviso, não bloqueio', () => {
    // A linha tinha 12, o saldo é 10: reduzir para 11 ainda excede, mas melhora.
    expect(avaliar('B', 10, 0, 11, 12).veredito).toBe('aviso');
  });

  it('em "B", manter a mesma quantidade também não bloqueia', () => {
    expect(avaliar('B', 10, 0, 12, 12).veredito).toBe('aviso');
  });

  it('em "B", aumentar além do saldo continua bloqueando', () => {
    expect(avaliar('B', 10, 0, 13, 12).veredito).toBe('bloqueio');
  });

  it('reduzir para dentro do saldo é livre', () => {
    expect(avaliar('B', 10, 0, 9, 12).veredito).toBe('livre');
  });
});

describe('quantidadeDoProdutoNoCarrinho', () => {
  const produto = snapshotDe({ codigoProduto: '001234' });
  const outro = snapshotDe({ codigoProduto: '009999' });

  it('soma as linhas ativas do mesmo produto', () => {
    const linhas = [
      linhaDe({ idLinha: 'a', snapshot: produto, quantidadeEmUnidades: 2 }),
      linhaDe({ idLinha: 'b', snapshot: produto, quantidadeEmUnidades: 3 }),
      linhaDe({ idLinha: 'c', snapshot: outro, quantidadeEmUnidades: 50 }),
    ];
    expect(quantidadeDoProdutoNoCarrinho(linhas, '001234')).toBe(unidades(5));
  });

  it('inclui as linhas congeladas de DAV/NFCe (ao contrário do agregado de preço)', () => {
    const linhas = [
      linhaDe({ snapshot: produto, quantidadeEmUnidades: 4, precoCongelado: true, origem: 'DAV' }),
      linhaDe({ snapshot: produto, quantidadeEmUnidades: 1 }),
    ];
    expect(quantidadeDoProdutoNoCarrinho(linhas, '001234')).toBe(unidades(5));
  });

  it('ignora as linhas canceladas', () => {
    const linhas = [
      linhaDe({ snapshot: produto, quantidadeEmUnidades: 4, cancelada: true }),
      linhaDe({ snapshot: produto, quantidadeEmUnidades: 1 }),
    ];
    expect(quantidadeDoProdutoNoCarrinho(linhas, '001234')).toBe(unidades(1));
  });

  it('na edição, exclui a própria linha da soma', () => {
    const linhas = [
      linhaDe({ idLinha: 'editada', snapshot: produto, quantidadeEmUnidades: 4 }),
      linhaDe({ idLinha: 'outra', snapshot: produto, quantidadeEmUnidades: 1 }),
    ];
    expect(quantidadeDoProdutoNoCarrinho(linhas, '001234', 'editada')).toBe(unidades(1));
  });

  it('carrinho sem o produto soma zero', () => {
    expect(quantidadeDoProdutoNoCarrinho([], '001234')).toBe(0);
  });
});

describe('normalizarPoliticaSaldo', () => {
  it.each([
    ['A', 'A'],
    ['B', 'B'],
    ['', ''],
    [' b ', 'B'],
    ['a', 'A'],
    ['X', ''],
    ['S', ''],
    [undefined, ''],
  ])('"%s" → "%s"', (entrada, esperado) => {
    expect(normalizarPoliticaSaldo(entrada)).toBe(esperado);
  });
});

describe('saldoEmMilesimos / formatarSaldo', () => {
  it('converte unidades decimais em milésimos inteiros, aceitando negativo', () => {
    expect(saldoEmMilesimos(78)).toBe(78000);
    expect(saldoEmMilesimos(-205)).toBe(-205000);
    expect(saldoEmMilesimos(78.5)).toBe(78500);
    expect(saldoEmMilesimos(0.1 + 0.2)).toBe(300);
  });

  it('recusa valor não finito', () => {
    expect(() => saldoEmMilesimos(Number.NaN)).toThrow();
  });

  it('formata em pt-BR com três casas e sinal', () => {
    expect(formatarSaldo(saldoEmMilesimos(78))).toBe('78,000');
    expect(formatarSaldo(saldoEmMilesimos(-205))).toBe('-205,000');
    expect(formatarSaldo(saldoEmMilesimos(-0.5))).toBe('-0,500');
    expect(formatarSaldo(saldoEmMilesimos(0))).toBe('0,000');
  });
});

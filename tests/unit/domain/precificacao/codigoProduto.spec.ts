import { describe, expect, it } from 'vitest';
import {
  ErroPrecoIndisponivelParaPesagem,
  interpretarEntradaCodigo,
  quantidadePesavel,
  rotuloTipoCodigoProduto,
} from '../../../../src/client/domain/precificacao/codigoProduto';
import { emCentavos } from '../../../support/precificacao';

/**
 * EAN-13 sintético de balança: prefixo `2`, código reduzido `001234`, valor de
 * etiqueta `01500` (R$ 15,00) e DV `4`, calculado pelos pesos 1/3 do EAN-13.
 */
const EAN_BALANCA = '2001234015004';

/** T019 — classificação da entrada do operador (FR-004, FR-013, AD-028/029/076). */
describe('interpretarEntradaCodigo', () => {
  it('classifica "codigo*quantidade" como COM_QTD (AD-029)', () => {
    expect(interpretarEntradaCodigo('001234*3')).toEqual({
      tipo: 'COM_QTD',
      codigo: '001234',
      quantidade: 3000,
    });
  });

  it('aceita quantidade fracionária com vírgula ou ponto', () => {
    expect(interpretarEntradaCodigo('001234*1,5')).toEqual({
      tipo: 'COM_QTD',
      codigo: '001234',
      quantidade: 1500,
    });
    expect(interpretarEntradaCodigo('001234*1.5')).toEqual({
      tipo: 'COM_QTD',
      codigo: '001234',
      quantidade: 1500,
    });
  });

  it('classifica código simples, com quantidade padrão 1 no call site', () => {
    expect(interpretarEntradaCodigo('001234')).toEqual({ tipo: 'SIMPLES', codigo: '001234' });
  });

  it('classifica EAN-13 de balança válido (AD-076)', () => {
    expect(interpretarEntradaCodigo(EAN_BALANCA)).toEqual({
      tipo: 'BALANCA',
      codigoReduzido: '001234',
      valorEtiqueta: 1500,
    });
  });

  it('DV inválido cai em SIMPLES — pode ser código interno legítimo do tenant (D6)', () => {
    expect(interpretarEntradaCodigo('2001234015007')).toEqual({
      tipo: 'SIMPLES',
      codigo: '2001234015007',
    });
  });

  it('13 dígitos sem prefixo 2 não é código de balança', () => {
    expect(interpretarEntradaCodigo('7890000000001').tipo).toBe('SIMPLES');
  });

  it('o separador "*" tem precedência sobre o formato de balança', () => {
    expect(interpretarEntradaCodigo(`${EAN_BALANCA}*2`)).toEqual({
      tipo: 'COM_QTD',
      codigo: EAN_BALANCA,
      quantidade: 2000,
    });
  });

  it('quantidade malformada depois do "*" não vira erro de operação', () => {
    expect(interpretarEntradaCodigo('001234*abc').tipo).toBe('SIMPLES');
    expect(interpretarEntradaCodigo('001234*0').tipo).toBe('SIMPLES');
  });

  it('ignora espaços em volta da entrada bipada', () => {
    expect(interpretarEntradaCodigo('  001234  ')).toEqual({ tipo: 'SIMPLES', codigo: '001234' });
  });
});

describe('quantidadePesavel (AD-076)', () => {
  it('deriva a quantidade dividindo o valor da etiqueta pelo preço unitário', () => {
    // R$ 15,00 de etiqueta ÷ R$ 10,00/un = 1,5 un.
    expect(quantidadePesavel(emCentavos(1500), emCentavos(1000))).toBe(1500);
  });

  it('trunca em 5 casas antes de arredondar em 3', () => {
    // 1000 / 300 = 3,333... → trunc 3,33333 → round 3,333.
    expect(quantidadePesavel(emCentavos(1000), emCentavos(300))).toBe(3333);
  });

  it('lança quando o produto não tem PrecoVenda informado (FR-013)', () => {
    expect(() => quantidadePesavel(emCentavos(1500), emCentavos(0))).toThrow(
      ErroPrecoIndisponivelParaPesagem,
    );
  });
});

/** Domain `EnumTipoCodigoProduto` da KB GeneXus — `ControlValues` real. */
describe('rotuloTipoCodigoProduto', () => {
  it.each([
    ['', 'Código reduzido'],
    ['D', 'Código de barras'],
    ['C', 'Referência'],
    ['P', 'Código de barras pesável'],
  ])('mapeia UsuarioTipoCodigoProduto=%j para %j', (valor, esperado) => {
    expect(rotuloTipoCodigoProduto(valor)).toBe(esperado);
  });

  it('valor fora do domínio conhecido cai num rótulo genérico, sem lançar', () => {
    expect(rotuloTipoCodigoProduto('X')).toBe('Código do produto');
  });
});

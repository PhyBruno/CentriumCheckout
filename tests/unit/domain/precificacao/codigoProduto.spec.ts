import { describe, expect, it } from 'vitest';
import {
  ErroPrecoIndisponivelParaPesagem,
  interpretarEntradaCodigo,
  quantidadePesavel,
  codigoParaConsulta,
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

/**
 * Os valores que `PCheckout_GetProduto` sabe filtrar (AD-204) — **não** os do
 * domínio `EnumTipoCodigoProduto` (`''`/`'D'`/`'C'`/`'P'`), que esta tabela
 * afirmava antes e que o campo não usa: `UsuarioTipoCodigoProduto` vem do
 * parâmetro `PRM0656`, e o tenant real devolve `'B'`.
 */
describe('rotuloTipoCodigoProduto', () => {
  it.each([
    ['', 'Código reduzido'],
    ['R', 'Código reduzido'],
    ['B', 'Código de barras'],
    ['M', 'Referência'],
  ])('mapeia UsuarioTipoCodigoProduto=%j para %j', (valor, esperado) => {
    expect(rotuloTipoCodigoProduto(valor)).toBe(esperado);
  });

  it('valor fora do domínio conhecido cai num rótulo genérico, sem lançar', () => {
    expect(rotuloTipoCodigoProduto('X')).toBe('Código do produto');
  });
});

/**
 * `codigoParaConsulta` — qual código do candidato pode ser reenviado ao
 * `GetProduto` (AD-204). É a correção do defeito em que o modal devolvia sempre
 * o código reduzido e o ERP, configurado em `'B'`, respondia SDT vazio.
 */
describe('codigoParaConsulta', () => {
  const CANDIDATO = {
    CodigoProduto: '0001284000101',
    CodigoBarras: '0012840001017',
    Referencia: '0001284',
  };

  it.each([
    ['', CANDIDATO.CodigoProduto],
    ['R', CANDIDATO.CodigoProduto],
    ['B', CANDIDATO.CodigoBarras],
    ['M', CANDIDATO.Referencia],
  ])('com Tipocodproduto=%j devolve %j', (tipo, esperado) => {
    expect(codigoParaConsulta(CANDIDATO, tipo)).toBe(esperado);
  });

  it('tipo desconhecido cai no código reduzido, o filtro default do ERP', () => {
    expect(codigoParaConsulta(CANDIDATO, 'X')).toBe(CANDIDATO.CodigoProduto);
  });

  it('devolve null quando o campo exigido está vazio — não há código que funcione', () => {
    expect(codigoParaConsulta({ ...CANDIDATO, CodigoBarras: '' }, 'B')).toBeNull();
  });
});

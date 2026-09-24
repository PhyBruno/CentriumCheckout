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
  /**
   * **A quantidade é sempre o lado esquerdo do `*`** (decisão do usuário,
   * 2026-09-16 — AD-240), como no PDV antigo. Até então a ordem era a inversa
   * (`codigo*quantidade`, AD-029).
   */
  it('classifica "quantidade*codigo" como COM_QTD', () => {
    expect(interpretarEntradaCodigo('3*001234')).toEqual({
      tipo: 'COM_QTD',
      codigo: '001234',
      quantidade: 3000,
    });
  });

  it('o código pode ser alfanumérico', () => {
    expect(interpretarEntradaCodigo('4*teste789')).toEqual({
      tipo: 'COM_QTD',
      codigo: 'teste789',
      quantidade: 4000,
    });
  });

  it('não olha o formato do código: com os dois lados numéricos, a esquerda é a quantidade', () => {
    // `12*34` são 12 unidades do produto `34`. Decidir pelo formato faria a
    // mesma digitação significar coisas diferentes conforme o cadastro — um
    // código de tenant pode ser numérico.
    expect(interpretarEntradaCodigo('12*34')).toEqual({
      tipo: 'COM_QTD',
      codigo: '34',
      quantidade: 12000,
    });
  });

  it('aceita quantidade fracionária com vírgula ou ponto', () => {
    expect(interpretarEntradaCodigo('1,5*001234')).toEqual({
      tipo: 'COM_QTD',
      codigo: '001234',
      quantidade: 1500,
    });
    expect(interpretarEntradaCodigo('1.5*001234')).toEqual({
      tipo: 'COM_QTD',
      codigo: '001234',
      quantidade: 1500,
    });
  });

  it('quantidade fracionária também vale com código alfanumérico', () => {
    expect(interpretarEntradaCodigo('2,5*ABC')).toEqual({
      tipo: 'COM_QTD',
      codigo: 'ABC',
      quantidade: 2500,
    });
    expect(interpretarEntradaCodigo('0.75*ABC')).toEqual({
      tipo: 'COM_QTD',
      codigo: 'ABC',
      quantidade: 750,
    });
  });

  it('classifica código simples, com quantidade padrão 1 no call site', () => {
    expect(interpretarEntradaCodigo('001234')).toEqual({ tipo: 'SIMPLES', codigo: '001234' });
  });

  it('classifica EAN-13 de balança válido (AD-076)', () => {
    expect(interpretarEntradaCodigo(EAN_BALANCA)).toEqual({
      tipo: 'BALANCA',
      codigoReduzido: '1234',
      valorEtiqueta: 1500,
    });
  });

  /**
   * As posições 2–7 são o `MatCodRed` **como número** (AD-252): o ERP faz
   * `val(Substring(2,6)).ToString()` (`WWPNFCe`, linha 1578), então os zeros à
   * esquerda são preenchimento da etiqueta, não parte do código.
   */
  it.each([
    ['2001234015004', '1234'],
    ['2101234015001', '101234'],
  ])('o código reduzido de %s é o MatCodRed %s, sem zeros à esquerda (AD-252)', (ean, reduzido) => {
    const entrada = interpretarEntradaCodigo(ean);
    expect(entrada.tipo === 'BALANCA' && entrada.codigoReduzido).toBe(reduzido);
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
    expect(interpretarEntradaCodigo(`2*${EAN_BALANCA}`)).toEqual({
      tipo: 'COM_QTD',
      codigo: EAN_BALANCA,
      quantidade: 2000,
    });
  });

  it('quantidade malformada antes do "*" não vira erro de operação', () => {
    // Sem quantidade legível à esquerda o texto inteiro vira código e o ERP
    // responde 404, que a UI já trata (`research.md`, D6).
    expect(interpretarEntradaCodigo('0*001234').tipo).toBe('SIMPLES');
    expect(interpretarEntradaCodigo('abc*001234').tipo).toBe('SIMPLES');
    expect(interpretarEntradaCodigo('*001234').tipo).toBe('SIMPLES');
    expect(interpretarEntradaCodigo('3*').tipo).toBe('SIMPLES');
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
 * `codigoParaConsulta` — com qual código **e qual `Tipocodproduto`** o
 * candidato do modal é reenviado ao `GetProduto` (AD-204, revisto por AD-205).
 *
 * Nasceu da correção do defeito em que o modal devolvia sempre o código
 * reduzido e o ERP, configurado em `'B'`, respondia SDT vazio. AD-205 tirou a
 * trava: o tipo da sessão é a **preferência**, e o campo vazio cai para o
 * próximo preenchido levando junto o tipo que o casa — porque `GetProduto`
 * recebe `Tipocodproduto` por chamada, não por configuração da empresa.
 */
describe('codigoParaConsulta', () => {
  const CANDIDATO = {
    CodigoProduto: '0001284000101',
    CodigoBarras: '0012840001017',
    Referencia: '0001284',
  };

  it.each([
    ['', CANDIDATO.CodigoProduto, 'R'],
    ['R', CANDIDATO.CodigoProduto, 'R'],
    ['B', CANDIDATO.CodigoBarras, 'B'],
    ['M', CANDIDATO.Referencia, 'M'],
  ])('com Tipocodproduto=%j devolve %j consultado como %j', (tipo, codigo, tipoCodigo) => {
    expect(codigoParaConsulta(CANDIDATO, tipo)).toEqual({ codigo, tipoCodigo });
  });

  it('tipo desconhecido cai no código reduzido, o filtro default do ERP', () => {
    expect(codigoParaConsulta(CANDIDATO, 'X')).toEqual({
      codigo: CANDIDATO.CodigoProduto,
      tipoCodigo: 'R',
    });
  });

  /**
   * O caso que o usuário reportou em 2026-09-10: produto listado na busca, sem
   * código de barras, empresa configurada em `'B'`. Antes era recusado; agora
   * entra pelo reduzido, e é o tipo `'R'` que vai na chamada.
   */
  it('campo preferido vazio cai no próximo preenchido, com o tipo correspondente', () => {
    expect(codigoParaConsulta({ ...CANDIDATO, CodigoBarras: '' }, 'B')).toEqual({
      codigo: CANDIDATO.CodigoProduto,
      tipoCodigo: 'R',
    });
  });

  it('sem reduzido nem barras, uma empresa em "B" ainda alcança o produto pela referência', () => {
    expect(codigoParaConsulta({ ...CANDIDATO, CodigoProduto: '', CodigoBarras: '' }, 'B')).toEqual({
      codigo: CANDIDATO.Referencia,
      tipoCodigo: 'M',
    });
  });

  it('devolve null só quando o candidato não tem nenhum dos três campos', () => {
    expect(
      codigoParaConsulta({ CodigoProduto: '', CodigoBarras: '', Referencia: '' }, 'B'),
    ).toBeNull();
  });
});

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

  /**
   * AD-240 — o operador também digita a quantidade **antes** do código
   * (`4*teste789`), que é a ordem do PDV antigo. A regra, decidida pelo usuário
   * em 2026-09-16: a **direita** continua sendo a quantidade sempre que for
   * número; a esquerda só é lida como quantidade quando a direita não for.
   * Assim `001234*3` não muda de significado.
   */
  describe('quantidade antes do código (AD-240)', () => {
    it('lê "quantidade*codigo" quando a direita não é número', () => {
      expect(interpretarEntradaCodigo('4*teste789')).toEqual({
        tipo: 'COM_QTD',
        codigo: 'teste789',
        quantidade: 4000,
      });
    });

    it('aceita fracionária à esquerda, com vírgula ou ponto', () => {
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

    it('com os dois lados numéricos, a direita continua sendo a quantidade', () => {
      expect(interpretarEntradaCodigo('12*34')).toEqual({
        tipo: 'COM_QTD',
        codigo: '12',
        quantidade: 34000,
      });
    });

    it('esquerda inválida como quantidade cai em SIMPLES, sem lançar', () => {
      // Nenhum dos lados é quantidade: o texto inteiro vira código e o ERP
      // responde 404, que a UI já trata (`research.md`, D6).
      expect(interpretarEntradaCodigo('abc*def')).toEqual({ tipo: 'SIMPLES', codigo: 'abc*def' });
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
    // `0` **parece número**: é o operador digitando quantidade zero, entrada
    // malformada — não o código `0` com 1234 unidades (AD-240).
    expect(interpretarEntradaCodigo('001234*0').tipo).toBe('SIMPLES');
    expect(interpretarEntradaCodigo('001234*').tipo).toBe('SIMPLES');
  });

  /**
   * **Mudou com AD-240:** `001234*abc` tem a mesma forma de `4*teste789` — a
   * direita não é número, então a esquerda é a quantidade. Antes o par inteiro
   * virava código e o ERP respondia 404.
   */
  it('com a direita não numérica, a esquerda vira quantidade mesmo parecendo código', () => {
    expect(interpretarEntradaCodigo('001234*abc')).toEqual({
      tipo: 'COM_QTD',
      codigo: 'abc',
      quantidade: 1234000,
    });
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

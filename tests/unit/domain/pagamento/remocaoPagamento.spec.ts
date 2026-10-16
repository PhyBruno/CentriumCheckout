import { describe, expect, it } from 'vitest';
import { MEIO_PAGTO } from '../../../../src/client/domain/pagamento/formaPagamento';
import { detalhesDaRemocao } from '../../../../src/client/domain/pagamento/remocaoPagamento';
import { pagamentoDe } from '../../../support/pagamento';

/**
 * Feature 018, FR-010 a FR-014 — o que o evento `FORMA_PAGAMENTO_REMOVIDA` leva
 * para o ERP. Valores sintéticos.
 */

const DADOS_TEF = {
  pagId: 'pay_exemplo_0001',
  bandeira: 'VISA',
  nsu: '048291',
  autorizacao: '192837',
  tipoIntegracao: '1',
} as const;

describe('detalhesDaRemocao', () => {
  it('dinheiro: valor é o recebido, não o que quitou a venda', () => {
    const detalhes = detalhesDaRemocao(
      pagamentoDe({
        meioPagtoNFe: MEIO_PAGTO.Dinheiro,
        valorAplicado: 8700,
        valorRecebido: 10000,
      }),
      'DINHEIRO',
      'OPERADOR',
    );

    expect(detalhes).toEqual({ formaPagamento: 'DINHEIRO', valor: 10000, motivo: 'OPERADOR' });
  });

  it('cartão sem TEF: valor é o aplicado e não leva identificador', () => {
    const detalhes = detalhesDaRemocao(
      pagamentoDe({
        meioPagtoNFe: MEIO_PAGTO.CartaoCredito,
        valorAplicado: 5000,
        valorRecebido: null,
      }),
      'CARTAO CREDITO',
      'LIMPAR',
    );

    expect(detalhes).toEqual({ formaPagamento: 'CARTAO CREDITO', valor: 5000, motivo: 'LIMPAR' });
    expect(detalhes).not.toHaveProperty('tefPagId');
    expect(detalhes).not.toHaveProperty('pixGuid');
  });

  it('TEF com dadosTEF: leva o pagId como tefPagId', () => {
    const detalhes = detalhesDaRemocao(
      pagamentoDe({
        meioPagtoNFe: MEIO_PAGTO.CartaoDebito,
        integracao: 'TEF',
        valorAplicado: 5000,
        dadosTEF: DADOS_TEF,
      }),
      'CARTAO DEBITO',
      'ESTORNO_TEF',
    );

    expect(detalhes).toEqual({
      formaPagamento: 'CARTAO DEBITO',
      valor: 5000,
      motivo: 'ESTORNO_TEF',
      tefPagId: 'pay_exemplo_0001',
    });
  });

  it('PIX aprovado com pixGuid: leva o identificador da cobrança', () => {
    const detalhes = detalhesDaRemocao(
      pagamentoDe({
        integracao: 'PIX_DINAMICO',
        valorAplicado: 2500,
        pixGuid: 'guid-exemplo-0001',
      }),
      'PIX',
      'OPERADOR',
    );

    expect(detalhes).toEqual({
      formaPagamento: 'PIX',
      valor: 2500,
      motivo: 'OPERADOR',
      pixGuid: 'guid-exemplo-0001',
    });
  });

  it('PIX pendente (sem pixGuid): o campo some, não vai vazio', () => {
    const detalhes = detalhesDaRemocao(
      pagamentoDe({
        integracao: 'PIX_DINAMICO',
        status: 'PENDENTE_INTEGRACAO',
        valorAplicado: 2500,
        pixGuid: null,
      }),
      'PIX',
      'LIMPAR',
    );

    expect(detalhes).not.toHaveProperty('pixGuid');
    expect(detalhes).not.toHaveProperty('tefPagId');
  });

  it('nenhum campo de identificador sai vazio ou undefined', () => {
    const detalhes = detalhesDaRemocao(pagamentoDe({}), 'DINHEIRO', 'OPERADOR');

    expect(Object.values(detalhes).every((valor) => valor !== undefined && valor !== '')).toBe(
      true,
    );
  });
});

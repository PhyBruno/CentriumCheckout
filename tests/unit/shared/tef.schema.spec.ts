import { describe, expect, it } from 'vitest';
import {
  consultaCardRespSchema,
  criarCardRespSchema,
  estornoRespSchema,
  respostaSmartTefSchema,
} from '../../../src/shared/schemas/tef.schema';

/**
 * T010 — fronteira em dois estágios dos três endpoints SmartTEF
 * (`data-model.md` §3, `contracts/erp-tef-api.md` §4).
 *
 * Formas tiradas da KB `CentriumDEVU6` (AD-259). **Não medidas ao vivo**: o
 * usuário ainda não tem o terminal de homologação (T001, AD-260). Por isso o
 * envelope é aceito nas duas formas e os schemas internos são `looseObject`.
 * Valores sintéticos.
 */

const ENVELOPE_PLANO = {
  Sucesso: true,
  CodigoStatusHttp: 200,
  MensagemErro: '',
  RespostaJson: '{"payment_identifier":"pay_exemplo_0001","payment_status":"PDT"}',
};

describe('respostaSmartTefSchema', () => {
  it('aceita o envelope de transporte plano', () => {
    expect(respostaSmartTefSchema.parse(ENVELOPE_PLANO)).toMatchObject({
      Sucesso: true,
      CodigoStatusHttp: 200,
    });
  });

  it('aceita o envelope dentro de RespostaSmartTEF (semEnvelope, AD-218)', () => {
    expect(
      respostaSmartTefSchema.parse({ RespostaSmartTEF: ENVELOPE_PLANO }).RespostaJson,
    ).toContain('pay_exemplo_0001');
  });

  it('aceita CodigoStatusHttp como texto, como o GeneXus serializa número', () => {
    expect(
      respostaSmartTefSchema.parse({ ...ENVELOPE_PLANO, CodigoStatusHttp: '0' }).CodigoStatusHttp,
    ).toBe(0);
  });

  it('reprova envelope sem RespostaJson', () => {
    const { RespostaJson: _ignorado, ...semResposta } = ENVELOPE_PLANO;
    expect(respostaSmartTefSchema.safeParse(semResposta).success).toBe(false);
  });
});

describe('criarCardRespSchema', () => {
  it('aceita a resposta com campos a mais da SmartTEF', () => {
    const lido = criarCardRespSchema.parse({
      payment_identifier: 'pay_exemplo_0001',
      payment_status: 'PDT',
      order_type: 'CRD_UNICO',
      form: { qualquer: 'coisa' },
    });
    expect(lido.payment_identifier).toBe('pay_exemplo_0001');
    expect(lido).toHaveProperty('order_type', 'CRD_UNICO');
  });

  // Sem identificador não há cobrança que consultar nem estornar: aceitar
  // abriria uma janela esperando por uma transação que ninguém consegue achar.
  it('reprova payment_identifier vazio', () => {
    expect(
      criarCardRespSchema.safeParse({ payment_identifier: '', payment_status: 'PDT' }).success,
    ).toBe(false);
  });
});

describe('consultaCardRespSchema', () => {
  const item = {
    payment_identifier: 'pay_exemplo_0001',
    payment_status: 'CNC',
    card_brand: 'MASTERCARD',
    nsu_host: '048291',
    autorization_code: '192837',
    installments: 1,
  };

  it('aceita a lista documentada', () => {
    const lido = consultaCardRespSchema.parse([item]);
    expect(lido).toHaveLength(1);
    expect(lido[0]?.card_brand).toBe('MASTERCARD');
  });

  it('aceita objeto único e normaliza para lista [medir]', () => {
    expect(consultaCardRespSchema.parse(item)).toEqual([
      expect.objectContaining({ payment_identifier: 'pay_exemplo_0001' }),
    ]);
  });

  it('campos de detalhe ausentes, nulos ou numéricos viram texto', () => {
    const lido = consultaCardRespSchema.parse([
      { payment_identifier: 'pay_exemplo_0001', payment_status: 'PDT', nsu_host: 48291, card_brand: null },
    ]);
    expect(lido[0]).toMatchObject({
      nsu_host: '48291',
      card_brand: '',
      autorization_code: '',
      reason: '',
    });
  });
});

describe('estornoRespSchema', () => {
  it('aceita a forma documentada de SDTSmartTefCancelamentoResp', () => {
    expect(
      estornoRespSchema.parse({
        payment_identifier: 'pay_exemplo_0001',
        payment_status: 'SOL_EST',
        order_type: 'CRD_UNICO',
      }).payment_status,
    ).toBe('SOL_EST');
  });
});

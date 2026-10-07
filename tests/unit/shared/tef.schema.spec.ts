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
    const semResposta: Record<string, unknown> = { ...ENVELOPE_PLANO };
    delete semResposta['RespostaJson'];
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
      {
        payment_identifier: 'pay_exemplo_0001',
        payment_status: 'PDT',
        nsu_host: 48291,
        card_brand: null,
      },
    ]);
    expect(lido[0]).toMatchObject({
      nsu_host: '48291',
      card_brand: '',
      autorization_code: '',
      reason: '',
    });
  });

  // REJ_EST/REJ_PAG reais mandam `reason` como objeto (2026-10-07): reprovava a
  // resposta inteira e escondia o status.
  describe('reason em forma de objeto nunca reprova a resposta', () => {
    const comReason = (reason: unknown) =>
      consultaCardRespSchema.parse([
        { payment_identifier: 'pay_exemplo_0001', payment_status: 'REJ_EST', reason },
      ])[0];

    it('objeto com `message` vira a frase', () => {
      expect(comReason({ code: 51, message: 'Estorno não autorizado (sintético)' })).toMatchObject({
        payment_status: 'REJ_EST',
        reason: 'Estorno não autorizado (sintético)',
      });
    });

    it('usa a primeira chave de frase não vazia', () => {
      expect(
        comReason({ message: '  ', description: 'Negado pelo operador (sintético)' }),
      ).toMatchObject({
        reason: 'Negado pelo operador (sintético)',
      });
    });

    // Forma REAL do REJ_PAG medida no C0 em 2026-10-07: `reason: {"msg": ""}`.
    it('{"msg":""} — a rejeição real, com a frase vazia — vira vazio, não JSON', () => {
      expect(comReason({ msg: '' })).toMatchObject({ payment_status: 'REJ_EST', reason: '' });
    });

    it('objeto sem chave de frase vai como JSON, para a forma real aparecer', () => {
      expect(comReason({ codigo: 51, origem: 'POS' })).toMatchObject({
        reason: '{"codigo":51,"origem":"POS"}',
      });
    });

    it('lista vai como JSON, e objeto vazio também', () => {
      expect(comReason(['a', 'b'])).toMatchObject({ reason: '["a","b"]' });
      expect(comReason({})).toMatchObject({ reason: '{}' });
    });

    it('o mesmo vale para os outros campos de detalhe', () => {
      const lido = consultaCardRespSchema.parse([
        {
          payment_identifier: 'pay_exemplo_0001',
          payment_status: 'CNC',
          card_brand: { nome: 'MASTERCARD' },
          nsu_host: true,
        },
      ]);
      expect(lido[0]).toMatchObject({ card_brand: '{"nome":"MASTERCARD"}', nsu_host: 'true' });
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

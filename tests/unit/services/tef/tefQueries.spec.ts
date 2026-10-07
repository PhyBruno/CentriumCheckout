import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  consultarStatusTef,
  criarCardTef,
  ErroCobrancaTefIlegivel,
  estornarTef,
  mensagemDeErroTef,
  useCriarCardTef,
  useStatusTef,
} from '../../../../src/client/services/tef/tefQueries';
import {
  interpretarStatusCobrancaTef,
  interpretarStatusEstornoTef,
} from '../../../../src/client/domain/tef/interpretarStatusTef';
import {
  ErroNegocioErp,
  ErroRedeErp,
  ErroRespostaInvalida,
} from '../../../../src/client/services/errosErp';
import type { ErpClient, ResultadoChamadaErp } from '../../../../src/client/services/erpClient';
import type { DadosCriarCardTef } from '../../../../src/client/domain/tef/cobrancaTef';
import { centavos } from '../../../../src/client/domain/precificacao/dinheiro';

/**
 * T012 — camada de rede do TEF (`contracts/tef-domain-api.md` §2,
 * `contracts/erp-tef-api.md`).
 *
 * Os cenários do topo usam as formas da KB. As formas **medidas** no C0 em
 * 2026-10-07 (AD-267) estão no último `describe`, com os corpos reais. Valores
 * sintéticos.
 */

interface Chamada {
  readonly caminho: string;
  readonly init: RequestInit;
  readonly corpo: Record<string, unknown> | null;
}

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status });
}

/** `SDTSmartTefResposta` com o JSON interno serializado, como o ERP manda. */
function envelopeOk(interno: unknown): Record<string, unknown> {
  return {
    Sucesso: true,
    CodigoStatusHttp: 200,
    MensagemErro: '',
    RespostaJson: JSON.stringify(interno),
  };
}

function envelopeRecusa(mensagem: string): Record<string, unknown> {
  return { Sucesso: false, CodigoStatusHttp: 0, MensagemErro: mensagem, RespostaJson: '' };
}

function erpDe(respostas: Array<Response | 'rede'>): { erpClient: ErpClient; chamadas: Chamada[] } {
  const chamadas: Chamada[] = [];
  const fila = [...respostas];
  return {
    chamadas,
    erpClient: {
      chamar: (caminho, init = {}) => {
        chamadas.push({
          caminho,
          init,
          corpo:
            typeof init.body === 'string'
              ? (JSON.parse(init.body) as Record<string, unknown>)
              : null,
        });
        const proxima = fila.shift();
        if (proxima === undefined) {
          throw new Error(`Chamada inesperada a ${caminho}`);
        }
        const resultado: ResultadoChamadaErp =
          proxima === 'rede' ? { estado: 'erro-de-rede' } : { estado: 'ok', resposta: proxima };
        return Promise.resolve(resultado);
      },
    },
  };
}

const ENTRADA: DadosCriarCardTef = {
  formaCodigo: 40,
  valor: centavos(8329),
  parcelas: 2,
  pagador: { cpf: '12345678909', nome: 'MARIA EXEMPLO' },
};

const CRIADO = {
  payment_identifier: 'pay_exemplo_0001',
  payment_status: 'PDT',
  order_type: 'CRD_UNICO',
};

describe('criarCardTef', () => {
  // (a) T8 + T10.
  it('envia o corpo plano em reais com 2 casas, sem EmpCod nem UsuarioGAM', async () => {
    const { erpClient, chamadas } = erpDe([respostaJson(envelopeOk(CRIADO))]);

    const cobranca = await criarCardTef(ENTRADA, { erpClient });

    expect(chamadas[0]?.caminho).toBe('/ApiCentriumOAuth/CriarCardPagamento');
    expect(chamadas[0]?.init.method).toBe('POST');
    expect(chamadas[0]?.corpo).toEqual({
      PagamentoValor: 83.29,
      PagamentoParcelas: 2,
      PagamentoCpfCliente: '12345678909',
      PagamentoNomeCliente: 'MARIA EXEMPLO',
      FPgCod: 40,
    });
    expect(chamadas[0]?.corpo).not.toHaveProperty('EmpCod');
    expect(chamadas[0]?.corpo).not.toHaveProperty('UsuarioGAM');
    expect(cobranca).toEqual({
      paymentIdentifier: 'pay_exemplo_0001',
      valor: 8329,
      statusInicial: 'PDT',
    });
  });

  it('aceita a resposta dentro de RespostaSmartTEF', async () => {
    const { erpClient } = erpDe([respostaJson({ RespostaSmartTEF: envelopeOk(CRIADO) })]);

    await expect(criarCardTef(ENTRADA, { erpClient })).resolves.toMatchObject({
      paymentIdentifier: 'pay_exemplo_0001',
    });
  });

  // (b) A frase do ERP chega íntegra — é ela que diz ao operador o que fazer.
  it('Sucesso:false vira ErroNegocioErp com a MensagemErro íntegra', async () => {
    const mensagem = 'Serial do POS (serial_pos) nao localizado para o usuario informado';
    const { erpClient } = erpDe([respostaJson(envelopeRecusa(mensagem))]);

    const erro: unknown = await criarCardTef(ENTRADA, { erpClient }).catch(
      (causa: unknown) => causa,
    );

    expect(erro).toBeInstanceOf(ErroNegocioErp);
    expect((erro as ErroNegocioErp).motivo).toBe(mensagem);
  });

  it('Sucesso:false com MensagemErro vazia usa a frase padrão', async () => {
    const { erpClient } = erpDe([respostaJson(envelopeRecusa(''))]);

    const erro: unknown = await criarCardTef(ENTRADA, { erpClient }).catch(
      (causa: unknown) => causa,
    );

    expect((erro as ErroNegocioErp).motivo).toBe('A SmartTEF recusou a operação.');
  });

  // (c) `research.md` D10: sem identificador legível pode haver cobrança criada.
  it.each([
    [
      'RespostaJson não-JSON',
      { Sucesso: true, CodigoStatusHttp: 200, MensagemErro: '', RespostaJson: 'oops' },
    ],
    ['sem payment_identifier', envelopeOk({ payment_status: 'PDT' })],
    ['payment_identifier vazio', envelopeOk({ payment_identifier: '', payment_status: 'PDT' })],
  ])('%s → ErroCobrancaTefIlegivel, que é ErroRespostaInvalida', async (_caso, corpo) => {
    const { erpClient } = erpDe([respostaJson(corpo)]);

    const erro: unknown = await criarCardTef(ENTRADA, { erpClient }).catch(
      (causa: unknown) => causa,
    );

    expect(erro).toBeInstanceOf(ErroCobrancaTefIlegivel);
    expect(erro).toBeInstanceOf(ErroRespostaInvalida);
    expect((erro as Error).message).toContain('Confira no terminal');
  });

  it('envelope fora do contrato → ErroRespostaInvalida', async () => {
    const { erpClient } = erpDe([respostaJson({ qualquer: 'coisa' })]);

    await expect(criarCardTef(ENTRADA, { erpClient })).rejects.toBeInstanceOf(ErroRespostaInvalida);
  });

  // (f)
  it('falha de rede → ErroRedeErp', async () => {
    const { erpClient } = erpDe(['rede']);

    await expect(criarCardTef(ENTRADA, { erpClient })).rejects.toBeInstanceOf(ErroRedeErp);
  });

  it('HTTP não-2xx → ErroRedeErp', async () => {
    const { erpClient } = erpDe([respostaJson({}, 500)]);

    await expect(criarCardTef(ENTRADA, { erpClient })).rejects.toBeInstanceOf(ErroRedeErp);
  });
});

describe('consultarStatusTef', () => {
  const ITEM_CNC = {
    payment_identifier: 'pay_exemplo_0001',
    payment_status: 'CNC',
    card_brand: 'MASTERCARD',
    nsu_host: '048291',
    autorization_code: '192837',
  };

  // (g)
  it('vai por GET com SmartTefPaymentIdentifier na query', async () => {
    const { erpClient, chamadas } = erpDe([respostaJson(envelopeOk([ITEM_CNC]))]);

    await consultarStatusTef('pay_exemplo_0001', { erpClient });

    expect(chamadas[0]?.caminho).toBe(
      '/ApiCentriumOAuth/ConsultarStatusCard?SmartTefPaymentIdentifier=pay_exemplo_0001',
    );
    expect(chamadas[0]?.init.method).toBe('GET');
  });

  // (d)
  it('escolhe o item do payment_identifier consultado', async () => {
    const outro = { ...ITEM_CNC, payment_identifier: 'pay_outro', payment_status: 'REJ_PAG' };
    const { erpClient } = erpDe([respostaJson(envelopeOk([outro, ITEM_CNC]))]);

    await expect(consultarStatusTef('pay_exemplo_0001', { erpClient })).resolves.toEqual({
      status: 'CNC',
      bandeira: 'MASTERCARD',
      nsu: '048291',
      autorizacao: '192837',
      motivo: '',
    });
  });

  it('lista vazia → status vazio (pendente nas duas fases)', async () => {
    const { erpClient } = erpDe([respostaJson(envelopeOk([]))]);

    await expect(consultarStatusTef('pay_exemplo_0001', { erpClient })).resolves.toMatchObject({
      status: '',
    });
  });

  it('Sucesso:false vira ErroNegocioErp', async () => {
    const { erpClient } = erpDe([respostaJson(envelopeRecusa('Pagamento não localizado'))]);

    await expect(consultarStatusTef('pay_exemplo_0001', { erpClient })).rejects.toBeInstanceOf(
      ErroNegocioErp,
    );
  });
});

describe('estornarTef', () => {
  // (g) + (e)
  it('vai por POST com { SmartTefPaymentIdentifier } e devolve o payment_status', async () => {
    const { erpClient, chamadas } = erpDe([
      respostaJson(
        envelopeOk({ payment_identifier: 'pay_exemplo_0001', payment_status: 'SOL_EST' }),
      ),
    ]);

    await expect(estornarTef('pay_exemplo_0001', { erpClient })).resolves.toBe('SOL_EST');

    expect(chamadas[0]?.caminho).toBe('/ApiCentriumOAuth/EstornarPagamento');
    expect(chamadas[0]?.init.method).toBe('POST');
    expect(chamadas[0]?.corpo).toEqual({ SmartTefPaymentIdentifier: 'pay_exemplo_0001' });
  });

  it('Sucesso:false vira ErroNegocioErp com a frase do ERP', async () => {
    const { erpClient } = erpDe([respostaJson(envelopeRecusa('Estorno fora do prazo'))]);

    const erro: unknown = await estornarTef('pay_exemplo_0001', { erpClient }).catch(
      (causa: unknown) => causa,
    );
    expect((erro as ErroNegocioErp).motivo).toBe('Estorno fora do prazo');
  });
});

function wrapper(): (props: { children: ReactNode }) => ReactElement {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }) => createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useCriarCardTef', () => {
  // (h) T2: duas chamadas de `CriarCardPagamento` são duas cobranças reais.
  it('duas chamadas simultâneas fazem uma requisição só', async () => {
    const { erpClient, chamadas } = erpDe([respostaJson(envelopeOk(CRIADO))]);
    const { result } = renderHook(() => useCriarCardTef({ erpClient }), { wrapper: wrapper() });

    const [primeira, segunda] = await Promise.all([
      result.current.criar(ENTRADA),
      result.current.criar(ENTRADA),
    ]);

    expect(chamadas).toHaveLength(1);
    expect(primeira).toBe(segunda);
  });

  it('expõe o motivo do ERP em erro, íntegro', async () => {
    const { erpClient } = erpDe([respostaJson(envelopeRecusa('Serial do POS nao localizado'))]);
    const { result } = renderHook(() => useCriarCardTef({ erpClient }), { wrapper: wrapper() });

    await result.current.criar(ENTRADA).catch(() => undefined);

    await waitFor(() => {
      expect(result.current.status).toBe('erro');
    });
    expect(result.current.erro).toBe('Serial do POS nao localizado');
  });
});

describe('useStatusTef', () => {
  // (i) AD-134: query desligada nunca sai de `isPending` no TanStack v5.
  it('desligado não consulta e não fica em isLoading', async () => {
    const { erpClient, chamadas } = erpDe([]);
    const { result } = renderHook(() => useStatusTef('pay_exemplo_0001', false, { erpClient }), {
      wrapper: wrapper(),
    });

    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(chamadas).toHaveLength(0);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.consulta).toBeNull();
  });

  it('ligado consulta e devolve o item', async () => {
    const { erpClient } = erpDe([
      respostaJson(
        envelopeOk([{ payment_identifier: 'pay_exemplo_0001', payment_status: 'PROC_PAG' }]),
      ),
    ]);
    const { result } = renderHook(
      () => useStatusTef('pay_exemplo_0001', true, { erpClient, intervaloMs: 60_000 }),
      { wrapper: wrapper() },
    );

    await waitFor(() => {
      expect(result.current.consulta?.status).toBe('PROC_PAG');
    });
  });
});

/**
 * Corpos **medidos** no C0 (`c0lj6mvzeh.prototype`, POS simulado, 2026-10-07) —
 * o ciclo inteiro de uma cobrança de R$ 1,00: criar → `PDT`, consultar → `CNC`,
 * estornar → `SOL_EST`, consultar → `EST`. Só o identificador, o serial do POS e
 * o usuário foram trocados por valores sintéticos; a forma e o tipo de cada
 * campo são os do ERP (`contracts/erp-tef-api.md`).
 */
describe('corpos reais do ERP (C0, 2026-10-07)', () => {
  const ID = '01a1168b-0000-7000-8000-000000000001';

  /** `SDTSmartTefResposta` real: plano, `CodigoStatusHttp` numérico `201`. */
  function envelopeReal(interno: unknown): Record<string, unknown> {
    return {
      Sucesso: true,
      CodigoStatusHttp: 201,
      MensagemErro: '',
      RespostaJson: JSON.stringify(interno),
    };
  }

  /** Item de `ConsultarStatusCard` do POS simulado: `card_brand`/`nsu_host` vazios, `reason: null`. */
  function itemReal(sobrescritas: Record<string, unknown>): Record<string, unknown> {
    return {
      payment_identifier: ID,
      cnpj: '00000000000000',
      create_at: '2026-10-07T10:26:16.596Z',
      update_at: '2026-10-07T10:29:15.756Z',
      value: '1',
      payment_value: '1',
      payment_date: '2026-10-07T10:29:15.000Z',
      autorization_code: 'authorizationCode',
      order_type: 'CRD_UNICO',
      payment_type: 'CREDIT',
      payment_status: 'CNC',
      card_brand: '',
      installments: 1,
      min_installments: 1,
      nsu_host: '',
      nsu_sitef: '',
      acquirer: 'SIMULADO',
      serial_pos: 'serial-sintetico',
      user_id: 1,
      payment_extras: { CPF: '12345678909', Nome: 'CLIENTE TESTE TEF' },
      has_details: true,
      type: 'PAYMENT',
      charge_id: '',
      conn_type: 1,
      batt_level: 96,
      charging: false,
      location: { lat: '', long: '' },
      reason: null,
      refund_autorization_code: null,
      refund_serial_pos: null,
      refund_user_id: null,
      refund_date: null,
      refound_coupon: null,
      grouped_payments: [],
      form_order: null,
      ...sobrescritas,
    };
  }

  it('CriarCardPagamento: o corpo plano com FPgCod volta com PDT e o identificador', async () => {
    const { erpClient, chamadas } = erpDe([
      respostaJson(
        envelopeReal({
          payment_identifier: ID,
          payment_status: 'PDT',
          order_type: 'CRD_UNICO',
          charge_id: '',
          allow_multi_payments: false,
          allow_cash_payment: false,
          has_details: true,
          form: null,
        }),
      ),
    ]);

    const cobranca = await criarCardTef(
      {
        formaCodigo: 3,
        valor: centavos(100),
        parcelas: 1,
        pagador: { cpf: '12345678909', nome: 'CLIENTE TESTE TEF' },
      },
      { erpClient },
    );

    expect(chamadas[0]?.corpo).toEqual({
      PagamentoValor: 1,
      PagamentoParcelas: 1,
      PagamentoCpfCliente: '12345678909',
      PagamentoNomeCliente: 'CLIENTE TESTE TEF',
      FPgCod: 3,
    });
    expect(cobranca).toEqual({ paymentIdentifier: ID, valor: 100, statusInicial: 'PDT' });
    expect(interpretarStatusCobrancaTef(cobranca.statusInicial)).toEqual({
      situacao: 'PENDENTE',
    });
  });

  it('ConsultarStatusCard: CNC aprova mesmo com bandeira e NSU vazios e reason null', async () => {
    const { erpClient } = erpDe([respostaJson(envelopeReal([itemReal({})]))]);

    const consulta = await consultarStatusTef(ID, { erpClient });

    expect(consulta).toEqual({
      status: 'CNC',
      bandeira: '',
      nsu: '',
      autorizacao: 'authorizationCode',
      motivo: '',
    });
    expect(interpretarStatusCobrancaTef(consulta.status)).toEqual({ situacao: 'APROVADO' });
  });

  // REJ_PAG REAL (C0, 2026-10-07): o operador do POS recusou a cobrança. Os campos de
  // aprovação vêm `null` e o `reason` vem como OBJETO `{"msg": ""}` — o que reprovava a
  // resposta inteira e escondia o status.
  it('ConsultarStatusCard: REJ_PAG real, com reason {"msg":""} e campos null, é interpretado', async () => {
    const { erpClient } = erpDe([
      respostaJson(
        envelopeReal([
          itemReal({
            payment_status: 'REJ_PAG',
            payment_value: null,
            payment_date: null,
            autorization_code: null,
            card_brand: null,
            nsu_host: null,
            nsu_sitef: null,
            acquirer: null,
            payment_extras: null,
            reason: { msg: '' },
          }),
        ]),
      ),
    ]);

    const consulta = await consultarStatusTef(ID, { erpClient });

    expect(consulta).toEqual({
      status: 'REJ_PAG',
      bandeira: '',
      nsu: '',
      autorizacao: '',
      motivo: '',
    });
    expect(interpretarStatusCobrancaTef(consulta.status)).toEqual({
      situacao: 'FALHA',
      motivo: 'PAGAMENTO_REJEITADO',
    });
    expect(interpretarStatusEstornoTef(consulta.status)).toEqual({
      situacao: 'ESTORNO_REJEITADO',
    });
  });

  it('EstornarPagamento: o pedido volta SOL_EST, que ainda não é estorno concluído', async () => {
    const { erpClient, chamadas } = erpDe([
      respostaJson(
        envelopeReal({
          payment_identifier: ID,
          payment_status: 'SOL_EST',
          order_type: 'CRD_UNICO',
        }),
      ),
    ]);

    const status = await estornarTef(ID, { erpClient });

    expect(chamadas[0]?.corpo).toEqual({ SmartTefPaymentIdentifier: ID });
    expect(status).toBe('SOL_EST');
    expect(interpretarStatusEstornoTef(status)).toEqual({ situacao: 'ESTORNO_PENDENTE' });
  });

  it('ConsultarStatusCard depois do estorno: EST conclui, com os campos refund_* preenchidos', async () => {
    const { erpClient } = erpDe([
      respostaJson(
        envelopeReal([
          itemReal({
            payment_status: 'EST',
            refund_autorization_code: 'authorizationCode',
            refund_user_id: '1',
            refund_date: '2026-10-07T10:29:15.000Z',
            refound_coupon: { client: '', store: '' },
          }),
        ]),
      ),
    ]);

    const consulta = await consultarStatusTef(ID, { erpClient });

    expect(consulta.status).toBe('EST');
    expect(interpretarStatusEstornoTef(consulta.status)).toEqual({ situacao: 'ESTORNADO' });
  });

  it('a recusa real sem maquininha vinculada chega íntegra ao operador', async () => {
    const { erpClient } = erpDe([
      respostaJson({
        Sucesso: false,
        CodigoStatusHttp: 0,
        MensagemErro: 'Serial do POS (serial_pos) nao localizado para o usuario informado',
        RespostaJson: '',
      }),
    ]);

    const erro = await criarCardTef(
      { formaCodigo: 3, valor: centavos(100), parcelas: 1, pagador: { cpf: '', nome: 'CLIENTE' } },
      { erpClient },
    ).catch((causa: unknown) => causa);

    expect(erro).toBeInstanceOf(ErroNegocioErp);
    expect(mensagemDeErroTef(erro, '(padrão)')).toBe(
      'Serial do POS (serial_pos) nao localizado para o usuario informado',
    );
  });
});

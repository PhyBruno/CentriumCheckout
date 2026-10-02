import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  consultarStatusTef,
  criarCardTef,
  ErroCobrancaTefIlegivel,
  estornarTef,
  useCriarCardTef,
  useStatusTef,
} from '../../../../src/client/services/tef/tefQueries';
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
 * As formas de resposta são as da KB, **não medidas** (T001 adiado, AD-260): se
 * a medição contradisser, mudam os helpers `envelope*` daqui e o schema, não os
 * cenários. Valores sintéticos.
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

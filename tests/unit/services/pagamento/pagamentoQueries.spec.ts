import { describe, expect, it } from 'vitest';
import {
  fetchCondicoesPagamento,
  validarTicket,
} from '../../../../src/client/services/pagamento/pagamentoQueries';
import {
  ErroRedeErp,
  ErroRespostaInvalida,
  ErroSessaoEncerrada,
} from '../../../../src/client/services/errosErp';
import type { ErpClient, ResultadoChamadaErp } from '../../../../src/client/services/erpClient';

/**
 * Camada de rede do catálogo de pagamento e da validação de vale devolução
 * (T009) — o que o Checkout envia ao ERP/BFF e como trata cada forma de
 * resposta (Constitution III e IV). Payloads sintéticos.
 */

interface ChamadaRegistrada {
  readonly caminho: string;
  readonly init: RequestInit;
}

function erpClienteDe(respostas: Response[]): {
  erpClient: ErpClient;
  chamadas: ChamadaRegistrada[];
} {
  const chamadas: ChamadaRegistrada[] = [];
  const fila = [...respostas];

  return {
    chamadas,
    erpClient: {
      chamar: (caminho, init = {}) => {
        chamadas.push({ caminho, init });
        const resposta = fila.shift();
        if (resposta === undefined) {
          throw new Error(`Chamada inesperada a ${caminho}`);
        }
        return Promise.resolve({ estado: 'ok', resposta });
      },
    },
  };
}

function erpClienteQueFalha(estado: 'erro-de-rede' | 'sessao-encerrada'): ErpClient {
  return {
    chamar: () =>
      Promise.resolve(
        (estado === 'erro-de-rede'
          ? { estado }
          : { estado, itensNaVenda: 0 }) as ResultadoChamadaErp,
      ),
  };
}

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status });
}

function condicaoValida(): Record<string, unknown> {
  return {
    CondicaoCodigo: 1,
    CondicaoDescricao: 'A VISTA',
    CondicaoPrazo: 0,
    CondicaoMinimoEntrada: 0,
    CondicaoDesconto: 0,
    CondicaoDescontoMaximo: 0,
    CondicaoFormasDePagamento: [
      {
        FormaCodigo: 1,
        FormaDescricao: 'DINHEIRO',
        FormaEntrada: 'S',
        FormaMeioPagtoNFe: 'Dinheiro',
        FormaIntegracaoCartao: '',
        FormaTipoTransacaoTEF: '',
        FormaFpgUtiCar: '',
      },
    ],
  };
}

describe('validarTicket', () => {
  it('monta o corpo sem Empresa — o BFF injeta a partir do codigoEmpresa persistido (AD-019)', async () => {
    const { erpClient, chamadas } = erpClienteDe([
      respostaJson({ ValorTicket: 25.5, Valido: true, Mensagem: 'Ticket Válido' }),
    ]);

    await validarTicket('TCK-000000-EXEMPLO', { erpClient });

    expect(chamadas[0]?.caminho).toBe('/ApiCentriumOAuth/ValidaTicketDevolucao');
    const corpo = JSON.parse(String(chamadas[0]?.init.body)) as Record<string, unknown>;
    expect(corpo).toEqual({ ticketDevolucao: 'TCK-000000-EXEMPLO' });
    expect(corpo).not.toHaveProperty('Empresa');
  });

  it('{Valido:true, ValorTicket:25.5} → { valido:true, valor:2550 }', async () => {
    const { erpClient } = erpClienteDe([
      respostaJson({ ValorTicket: 25.5, Valido: true, Mensagem: 'Ticket Válido' }),
    ]);

    const resultado = await validarTicket('TCK-000000-EXEMPLO', { erpClient });

    expect(resultado).toEqual({ valido: true, valor: 2550 });
  });

  it("{Valido:false, Mensagem:'Ticket já utilizado'} → { valido:false, mensagem:'Ticket já utilizado' }", async () => {
    const { erpClient } = erpClienteDe([
      respostaJson({ ValorTicket: 0, Valido: false, Mensagem: 'Ticket já utilizado' }),
    ]);

    const resultado = await validarTicket('TCK-000000-EXEMPLO', { erpClient });

    expect(resultado).toEqual({ valido: false, mensagem: 'Ticket já utilizado' });
  });

  it('não reintroduz o fallback Mensagem === "Ticket Válido" (AD-101 revoga AD-099)', async () => {
    // Valido explicitamente false, mas a mensagem "parece" positiva — a
    // decisão precisa seguir só Valido.
    const { erpClient } = erpClienteDe([
      respostaJson({ ValorTicket: 25.5, Valido: false, Mensagem: 'Ticket Válido' }),
    ]);

    const resultado = await validarTicket('TCK-000000-EXEMPLO', { erpClient });

    expect(resultado).toEqual({ valido: false, mensagem: 'Ticket Válido' });
  });

  it('resposta fora do contrato lança ErroRespostaInvalida', async () => {
    const { erpClient } = erpClienteDe([respostaJson({ Mensagem: 'sem os demais campos' })]);

    await expect(validarTicket('TCK-000000-EXEMPLO', { erpClient })).rejects.toBeInstanceOf(
      ErroRespostaInvalida,
    );
  });

  it('propaga falha de rede e sessão encerrada como erros próprios', async () => {
    await expect(
      validarTicket('TCK-1', { erpClient: erpClienteQueFalha('erro-de-rede') }),
    ).rejects.toBeInstanceOf(ErroRedeErp);

    await expect(
      validarTicket('TCK-1', { erpClient: erpClienteQueFalha('sessao-encerrada') }),
    ).rejects.toBeInstanceOf(ErroSessaoEncerrada);
  });

  it('propaga HTTP não-ok como ErroRedeErp', async () => {
    const { erpClient } = erpClienteDe([respostaJson({}, 500)]);

    await expect(validarTicket('TCK-1', { erpClient })).rejects.toBeInstanceOf(ErroRedeErp);
  });
});

describe('fetchCondicoesPagamento — busca GET /api/bootstrap (PAY-01, D1/AD-097)', () => {
  function fetchImplDe(resposta: Response): typeof fetch {
    return ((url: string, init?: RequestInit) => {
      expect(url).toBe('/api/bootstrap');
      expect(init?.credentials).toBe('same-origin');
      return Promise.resolve(resposta);
    }) as typeof fetch;
  }

  it('busca /api/bootstrap e devolve condições + capacidades já traduzidas para o domínio', async () => {
    const fetchImpl = fetchImplDe(
      respostaJson({
        tenant: 'acme',
        codigoEmpresa: '1',
        SessaoUsuario: {
          CondicoesDePagamento: [condicaoValida()],
          ConfiguracoesTEF: { TEFAtivo: true },
          ConfiguracoesPIX: { UtilizaCentriumPAG: false },
        },
      }),
    );

    const resultado = await fetchCondicoesPagamento({ fetchImpl });

    expect(resultado.condicoes).toHaveLength(1);
    expect(resultado.condicoes[0]?.codigo).toBe(1);
    expect(resultado.capacidades).toEqual({ tefAtivo: true, pixAtivo: false });
  });

  it('resposta fora do contrato lança ErroRespostaInvalida', async () => {
    const fetchImpl = fetchImplDe(respostaJson({ tenant: 'acme', codigoEmpresa: '1' }));

    await expect(fetchCondicoesPagamento({ fetchImpl })).rejects.toBeInstanceOf(
      ErroRespostaInvalida,
    );
  });

  it('401 na rota de bootstrap vira ErroSessaoEncerrada', async () => {
    const fetchImpl = fetchImplDe(new Response('', { status: 401 }));

    await expect(fetchCondicoesPagamento({ fetchImpl })).rejects.toBeInstanceOf(
      ErroSessaoEncerrada,
    );
  });

  it('HTTP não-ok (que não seja 401) vira ErroRedeErp', async () => {
    const fetchImpl = fetchImplDe(new Response('', { status: 500 }));

    await expect(fetchCondicoesPagamento({ fetchImpl })).rejects.toBeInstanceOf(ErroRedeErp);
  });
});

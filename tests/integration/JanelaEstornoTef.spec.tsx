import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, StrictMode, type ReactElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  JanelaEstornoTef,
  type JanelaEstornoTefProps,
} from '../../src/client/features/pagamento/tef/JanelaEstornoTef';
import { AVISO_ESTORNO_SOLICITADO } from '../../src/client/features/pagamento/tef/avisosTef';
import { centavos } from '../../src/client/domain/precificacao/dinheiro';
import type { ErpClient, ResultadoChamadaErp } from '../../src/client/services/erpClient';

/**
 * Máquina de estados da janela de estorno (T031, `data-model.md` §4.2,
 * invariantes T5/T6, `research.md` D14).
 *
 * Contrato da KB, sem medição ao vivo (T001 adiado, AD-260). Valores
 * sintéticos.
 */

const { avisos } = vi.hoisted(() => ({ avisos: [] as string[] }));

vi.mock('goey-toast', () => {
  const capturar = (titulo: string, opcoes?: { readonly description?: unknown }): number =>
    avisos.push(typeof opcoes?.description === 'string' ? opcoes.description : titulo);
  return { gooeyToast: { warning: capturar, error: capturar, success: capturar } };
});

const CAMINHO_CONSULTAR = '/ApiCentriumOAuth/ConsultarStatusCard';
const CAMINHO_ESTORNAR = '/ApiCentriumOAuth/EstornarPagamento';
const INTERVALO_TESTE_MS = 20;
const PAG_ID = 'pay_exemplo_0001';

function respostaJson(corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), { status: 200 });
}

function envelopeOk(interno: unknown): Record<string, unknown> {
  return {
    Sucesso: true,
    CodigoStatusHttp: 200,
    MensagemErro: '',
    RespostaJson: JSON.stringify(interno),
  };
}

interface OpcoesErpFake {
  /** `payment_status` de cada consulta, na ordem; o último se repete. */
  readonly consultas: readonly string[];
  /** Resposta de `EstornarPagamento`: o status, ou a recusa. */
  readonly estorno?: { readonly status: string } | { readonly recusa: string };
}

function erpFake(opcoes: OpcoesErpFake): { cliente: ErpClient; caminhos: string[] } {
  const caminhos: string[] = [];
  let indice = 0;

  const cliente: ErpClient = {
    chamar(caminho: string): Promise<ResultadoChamadaErp> {
      caminhos.push(caminho);

      if (caminho.startsWith(CAMINHO_ESTORNAR)) {
        const estorno = opcoes.estorno ?? { status: 'SOL_EST' };
        return Promise.resolve({
          estado: 'ok',
          resposta: respostaJson(
            'recusa' in estorno
              ? {
                  Sucesso: false,
                  CodigoStatusHttp: 0,
                  MensagemErro: estorno.recusa,
                  RespostaJson: '',
                }
              : envelopeOk({ payment_identifier: PAG_ID, payment_status: estorno.status }),
          ),
        });
      }

      const literal = opcoes.consultas[Math.min(indice, opcoes.consultas.length - 1)] ?? 'CNC';
      indice += 1;
      return Promise.resolve({
        estado: 'ok',
        resposta: respostaJson(
          envelopeOk([{ payment_identifier: PAG_ID, payment_status: literal }]),
        ),
      });
    },
  };

  return { cliente, caminhos };
}

function pedidosDeEstorno(caminhos: readonly string[]): number {
  return caminhos.filter((caminho) => caminho.startsWith(CAMINHO_ESTORNAR)).length;
}

interface Desfechos {
  readonly estornados: { quantidade: number };
  readonly fechamentos: { quantidade: number };
}

function renderizar(
  cliente: ErpClient,
  { strict = false }: { strict?: boolean } = {},
  sobrescritas: Partial<JanelaEstornoTefProps> = {},
): Desfechos {
  const estornados = { quantidade: 0 };
  const fechamentos = { quantidade: 0 };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  const props: JanelaEstornoTefProps = {
    paymentIdentifier: PAG_ID,
    valor: centavos(5_000),
    onEstornado: () => {
      estornados.quantidade += 1;
    },
    onFechar: () => {
      fechamentos.quantidade += 1;
    },
    deps: { erpClient: cliente, intervaloMs: INTERVALO_TESTE_MS },
    ...sobrescritas,
  };

  const elemento = createElement(JanelaEstornoTef, props);
  render(strict ? createElement(StrictMode, null, elemento) : elemento, {
    wrapper: ({ children }: { children: ReactNode }): ReactElement =>
      createElement(QueryClientProvider, { client: queryClient }, children),
  });

  return { estornados, fechamentos };
}

async function esperar(ms: number): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

beforeEach(() => {
  avisos.length = 0;
});

describe('JanelaEstornoTef', () => {
  // (a) D14 2a: idempotente — não pede de novo o que já está estornado.
  it('consulta inicial EST → estornado, sem chamar EstornarPagamento', async () => {
    const { cliente, caminhos } = erpFake({ consultas: ['EST'] });
    const desfechos = renderizar(cliente);

    await waitFor(() => {
      expect(desfechos.estornados.quantidade).toBe(1);
    });
    expect(pedidosDeEstorno(caminhos)).toBe(0);
  });

  // (b)
  it('consulta inicial SOL_EST → só sonda, sem segundo pedido', async () => {
    const { cliente, caminhos } = erpFake({ consultas: ['SOL_EST', 'PROC_EST', 'EST'] });
    const desfechos = renderizar(cliente);

    await waitFor(() => {
      expect(desfechos.estornados.quantidade).toBe(1);
    });
    expect(pedidosDeEstorno(caminhos)).toBe(0);
  });

  // (c)
  it('CNC → pede o estorno → SOL_EST → sonda → EST → estornado', async () => {
    const { cliente, caminhos } = erpFake({ consultas: ['CNC', 'PROC_EST', 'EST'] });
    const desfechos = renderizar(cliente);

    await waitFor(() => {
      expect(desfechos.estornados.quantidade).toBe(1);
    });
    expect(pedidosDeEstorno(caminhos)).toBe(1);
    expect(desfechos.fechamentos.quantidade).toBe(1);
  });

  // (d)
  it('EstornarPagamento devolve EST direto → estornado sem sondar', async () => {
    const { cliente, caminhos } = erpFake({ consultas: ['CNC'], estorno: { status: 'EST' } });
    const desfechos = renderizar(cliente);

    await waitFor(() => {
      expect(desfechos.estornados.quantidade).toBe(1);
    });
    await esperar(INTERVALO_TESTE_MS * 3);
    expect(caminhos.filter((caminho) => caminho.startsWith(CAMINHO_CONSULTAR))).toHaveLength(1);
  });

  // (e) T6.
  it('Sucesso:false → painel com a frase do ERP, e o TEF não é estornado', async () => {
    const { cliente } = erpFake({
      consultas: ['CNC'],
      estorno: { recusa: 'Estorno fora do prazo' },
    });
    const desfechos = renderizar(cliente);

    expect(await screen.findByTestId('erro-estorno-tef')).toHaveTextContent(
      'Estorno fora do prazo',
    );
    expect(desfechos.estornados.quantidade).toBe(0);
  });

  // (f) T6.
  it('REJ_EST → aviso de estorno rejeitado, sem estornar', async () => {
    const { cliente } = erpFake({ consultas: ['CNC', 'REJ_EST'] });
    const desfechos = renderizar(cliente);

    expect(await screen.findByTestId('estorno-rejeitado-tef')).toBeInTheDocument();
    await esperar(INTERVALO_TESTE_MS * 3);
    expect(desfechos.estornados.quantidade).toBe(0);
  });

  // (g)
  it('desistir de esperar pede confirmação e fecha sem estornar', async () => {
    const usuario = userEvent.setup();
    const { cliente } = erpFake({ consultas: ['CNC', 'SOL_EST'] });
    const desfechos = renderizar(cliente);

    await screen.findByText('Aguardando a confirmação do estorno');
    await usuario.click(screen.getByTestId('desistir-estorno-tef'));

    expect(await screen.findByTestId('confirmar-desistencia-estorno-tef')).toHaveTextContent(
      AVISO_ESTORNO_SOLICITADO,
    );
    await usuario.click(screen.getByTestId('confirmar-desistencia-estorno-tef-confirmar'));

    expect(desfechos.fechamentos.quantidade).toBe(1);
    expect(desfechos.estornados.quantidade).toBe(0);
  });

  // (h)
  it('ESC e X ficam inertes enquanto aguarda', async () => {
    const usuario = userEvent.setup();
    const { cliente } = erpFake({ consultas: ['CNC', 'SOL_EST'] });
    const desfechos = renderizar(cliente);

    await screen.findByText('Aguardando a confirmação do estorno');
    await usuario.keyboard('{Escape}');
    const x = screen.getByTestId('fechar-janela-estorno-tef');
    expect(x).toHaveAttribute('aria-disabled', 'true');
    await usuario.click(x);

    expect(desfechos.fechamentos.quantidade).toBe(0);
  });

  // (i)
  it('em StrictMode pede o estorno uma vez só', async () => {
    const { cliente, caminhos } = erpFake({ consultas: ['CNC', 'SOL_EST'] });
    renderizar(cliente, { strict: true });

    await screen.findByText('Aguardando a confirmação do estorno');
    await esperar(INTERVALO_TESTE_MS * 3);

    expect(pedidosDeEstorno(caminhos)).toBe(1);
  });
});

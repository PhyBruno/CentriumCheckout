import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, StrictMode, type ReactElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ModalTef,
  MOTIVO_TEF_DESISTENCIA,
  MOTIVO_TEF_SEM_CLIENTE,
  MOTIVO_TEF_SEM_USUARIO_GAM,
  type ModalTefProps,
} from '../../src/client/features/pagamento/tef/ModalTef';
import { AVISO_TRANSACAO_EM_VOO } from '../../src/client/features/pagamento/tef/avisosTef';
import type { ClienteVenda } from '../../src/client/domain/cliente/clienteVenda';
import type { DadosTEF } from '../../src/client/domain/pagamento/saldoPagamento';
import { MEIO_PAGTO } from '../../src/client/domain/pagamento/formaPagamento';
import { centavos } from '../../src/client/domain/precificacao/dinheiro';
import type { ErpClient, ResultadoChamadaErp } from '../../src/client/services/erpClient';

/**
 * Máquina de estados da janela de cobrança TEF (T021, `data-model.md` §4.1,
 * invariantes T2–T4 e T9).
 *
 * Mesmo arranjo de `ModalPix.spec.tsx`: um `ErpClient` de teste — a fronteira
 * que a feature injeta em produção — e o intervalo do polling em 20ms. As
 * respostas seguem o contrato lido na KB; **não houve medição ao vivo** (T001
 * adiado, AD-260). Valores sintéticos.
 */

const { avisos } = vi.hoisted(() => ({ avisos: [] as string[] }));

vi.mock('goey-toast', () => {
  const capturar = (titulo: string, opcoes?: { readonly description?: unknown }): number =>
    avisos.push(typeof opcoes?.description === 'string' ? opcoes.description : titulo);
  return { gooeyToast: { warning: capturar, error: capturar, success: capturar } };
});

const CAMINHO_CRIAR = '/ApiCentriumOAuth/CriarCardPagamento';
const CAMINHO_CONSULTAR = '/ApiCentriumOAuth/ConsultarStatusCard';
const INTERVALO_TESTE_MS = 20;
const PAG_ID = 'pay_exemplo_0001';
const RECUSA_SERIAL = 'Serial do POS (serial_pos) nao localizado para o usuario informado';

interface Chamada {
  readonly caminho: string;
  readonly corpo: Record<string, unknown> | null;
}

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
  /** `payment_status` por consulta; o último se repete. */
  readonly statusSequencia?: readonly string[];
  /** Quantas primeiras criações respondem `Sucesso: false`. */
  readonly recusasDeCriacao?: number;
  /** Detalhes que o item da consulta traz junto do `CNC`. */
  readonly detalhes?: Record<string, unknown>;
  /** Detalhes que o item traz junto do `REJ` — o `reason` da tentativa recusada. */
  readonly detalhesDaRecusa?: Record<string, unknown>;
}

function erpFake(opcoes: OpcoesErpFake = {}): { cliente: ErpClient; chamadas: Chamada[] } {
  const chamadas: Chamada[] = [];
  const sequencia = opcoes.statusSequencia ?? ['PDT'];
  let recusas = opcoes.recusasDeCriacao ?? 0;
  let consultas = 0;

  const cliente: ErpClient = {
    chamar(caminho: string, init: RequestInit = {}): Promise<ResultadoChamadaErp> {
      chamadas.push({
        caminho,
        corpo:
          typeof init.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null,
      });

      if (caminho.startsWith(CAMINHO_CRIAR)) {
        if (recusas > 0) {
          recusas -= 1;
          return Promise.resolve({
            estado: 'ok',
            resposta: respostaJson({
              Sucesso: false,
              CodigoStatusHttp: 0,
              MensagemErro: RECUSA_SERIAL,
              RespostaJson: '',
            }),
          });
        }
        return Promise.resolve({
          estado: 'ok',
          resposta: respostaJson(envelopeOk({ payment_identifier: PAG_ID, payment_status: 'PDT' })),
        });
      }

      const literal = sequencia[Math.min(consultas, sequencia.length - 1)] ?? 'PDT';
      consultas += 1;
      return Promise.resolve({
        estado: 'ok',
        resposta: respostaJson(
          envelopeOk([
            {
              payment_identifier: PAG_ID,
              payment_status: literal,
              ...(literal === 'CNC' ? (opcoes.detalhes ?? {}) : {}),
              ...(literal === 'REJ' ? (opcoes.detalhesDaRecusa ?? {}) : {}),
            },
          ]),
        ),
      });
    },
  };

  return { cliente, chamadas };
}

function criacoes(chamadas: readonly Chamada[]): readonly Chamada[] {
  return chamadas.filter((chamada) => chamada.caminho.startsWith(CAMINHO_CRIAR));
}

function consultas(chamadas: readonly Chamada[]): number {
  return chamadas.filter((chamada) => chamada.caminho.startsWith(CAMINHO_CONSULTAR)).length;
}

const CLIENTE: ClienteVenda = {
  codigoCliente: 2538,
  nome: 'MARIA EXEMPLO',
  documento: '123.456.789-09',
  celular: null,
  listaPreco: 5,
  descontoConvenio: 0,
  codigoConvenio: null,
  origem: 'BUSCA_DOCUMENTO',
};

interface Desfechos {
  readonly aprovados: DadosTEF[];
  readonly abandonados: string[];
  readonly fechamentos: { quantidade: number };
  readonly desmontar: () => void;
}

function renderizar(
  cliente: ErpClient,
  sobrescritas: Partial<ModalTefProps> = {},
  { strict = false }: { strict?: boolean } = {},
): Desfechos {
  const aprovados: DadosTEF[] = [];
  const abandonados: string[] = [];
  const fechamentos = { quantidade: 0 };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  const props: ModalTefProps = {
    formaCodigo: 40,
    meioPagtoNFe: MEIO_PAGTO.CartaoDebito,
    valor: centavos(8329),
    prazoDaCondicao: 2,
    clienteAtual: CLIENTE,
    usuarioGamPresente: true,
    onAprovado: (dados) => aprovados.push(dados),
    onAbandonado: (motivo) => abandonados.push(motivo),
    onFechar: () => {
      fechamentos.quantidade += 1;
    },
    deps: { erpClient: cliente, intervaloMs: INTERVALO_TESTE_MS },
    atrasoFechamentoMs: 60_000,
    ...sobrescritas,
  };

  const elemento = createElement(ModalTef, props);
  const { unmount } = render(strict ? createElement(StrictMode, null, elemento) : elemento, {
    wrapper: ({ children }: { children: ReactNode }): ReactElement =>
      createElement(QueryClientProvider, { client: queryClient }, children),
  });

  return { aprovados, abandonados, fechamentos, desmontar: unmount };
}

async function esperar(ms: number): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

beforeEach(() => {
  avisos.length = 0;
});

describe('ModalTef — cobrança', () => {
  // (a) T2: duas criações são duas cobranças reais na maquininha.
  it('cria a cobrança uma vez só, mesmo em StrictMode', async () => {
    const { cliente, chamadas } = erpFake();
    renderizar(cliente, {}, { strict: true });

    await screen.findByText('Aguardando retorno do TEF');
    await esperar(INTERVALO_TESTE_MS * 3);

    expect(criacoes(chamadas)).toHaveLength(1);
  });

  // (b) T3 + FR-015.
  it('PDT → PROC_PAG → CNC: aprova no tick do CNC, com NSU, autorização e bandeira', async () => {
    const { cliente } = erpFake({
      statusSequencia: ['PDT', 'PROC_PAG', 'CNC'],
      detalhes: { card_brand: 'MASTERCARD', nsu_host: '048291', autorization_code: '192837' },
    });
    const desfechos = renderizar(cliente);

    await waitFor(() => {
      expect(desfechos.aprovados).toHaveLength(1);
    });

    expect(desfechos.aprovados[0]).toEqual({
      pagId: PAG_ID,
      bandeira: 'MASTERCARD',
      nsu: '048291',
      autorizacao: '192837',
      tipoIntegracao: '1',
    });
    // Aprovado antes do fechamento automático (60s neste teste).
    expect(desfechos.fechamentos.quantidade).toBe(0);
    expect(await screen.findByTestId('tef-nsu')).toHaveTextContent('048291');
    expect(screen.getByTestId('tef-autorizacao')).toHaveTextContent('192837');
    expect(screen.getByTestId('tef-bandeira')).toHaveTextContent('MASTERCARD');
    expect(screen.getByTestId('tef-subtitulo')).toHaveTextContent(
      'Transação concluída com sucesso',
    );
  });

  it('campo ausente na aprovação aparece como "—", nunca inventado', async () => {
    const { cliente } = erpFake({ statusSequencia: ['CNC'] });
    renderizar(cliente);

    expect(await screen.findByTestId('tef-nsu')).toHaveTextContent('—');
    expect(screen.getByTestId('tef-bandeira')).toHaveTextContent('—');
  });

  it('o polling para depois da aprovação', async () => {
    const { cliente, chamadas } = erpFake({ statusSequencia: ['CNC'] });
    const desfechos = renderizar(cliente);

    await waitFor(() => {
      expect(desfechos.aprovados).toHaveLength(1);
    });
    await esperar(INTERVALO_TESTE_MS * 2);
    const depois = consultas(chamadas);
    await esperar(INTERVALO_TESTE_MS * 5);

    expect(consultas(chamadas)).toBe(depois);
  });

  // (c)
  it('fecha sozinho depois do atraso, e Fechar/X/ESC funcionam depois de aprovado', async () => {
    const usuario = userEvent.setup();
    const { cliente } = erpFake({ statusSequencia: ['CNC'] });
    const desfechos = renderizar(cliente, { atrasoFechamentoMs: 0 });

    await waitFor(() => {
      expect(desfechos.fechamentos.quantidade).toBeGreaterThan(0);
    });

    const outro = renderizar(erpFake({ statusSequencia: ['CNC'] }).cliente);
    await waitFor(() => {
      expect(outro.aprovados).toHaveLength(1);
    });
    const fechar = screen.getAllByTestId('concluir-tef').at(-1);
    expect(fechar).toBeDefined();
    if (fechar === undefined) return;
    await usuario.click(fechar);
    expect(outro.fechamentos.quantidade).toBe(1);

    await usuario.keyboard('{Escape}');
    expect(outro.fechamentos.quantidade).toBeGreaterThanOrEqual(2);
  });

  /**
   * Pedido do usuário (2026-10-02): aprovado, a janela fecha em 10s. O pai
   * (`useTefPendente`) recria `onFechar` a cada render, e o temporizador não
   * pode recomeçar por isso — senão uma lista que re-renderiza com frequência
   * deixaria a janela aberta indefinidamente.
   */
  it('re-renders do pai não adiam o fechamento automático depois de aprovado', async () => {
    const { cliente } = erpFake({ statusSequencia: ['CNC'] });
    const fechamentos = { quantidade: 0 };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const elemento = (): ReactElement =>
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(ModalTef, {
          formaCodigo: 40,
          meioPagtoNFe: MEIO_PAGTO.CartaoDebito,
          valor: centavos(8329),
          prazoDaCondicao: 1,
          clienteAtual: CLIENTE,
          usuarioGamPresente: true,
          onAprovado: () => undefined,
          onAbandonado: () => undefined,
          onFechar: () => {
            fechamentos.quantidade += 1;
          },
          deps: { erpClient: cliente, intervaloMs: INTERVALO_TESTE_MS },
          atrasoFechamentoMs: 150,
        }),
      );
    const { rerender } = render(elemento());
    await screen.findByTestId('concluir-tef');

    for (let i = 0; i < 8; i += 1) {
      await esperar(40);
      rerender(elemento());
    }

    expect(fechamentos.quantidade).toBeGreaterThanOrEqual(1);
  });

  // (d)
  it('aguardando: ESC não fecha e o X explica por que está travado', async () => {
    const usuario = userEvent.setup();
    const { cliente } = erpFake();
    const desfechos = renderizar(cliente);

    await screen.findByText('Aguardando retorno do TEF');
    await usuario.keyboard('{Escape}');
    expect(desfechos.fechamentos.quantidade).toBe(0);

    const x = screen.getByTestId('fechar-modal-tef');
    expect(x).toHaveAttribute('aria-disabled', 'true');
    await usuario.click(x);
    expect(desfechos.fechamentos.quantidade).toBe(0);
    expect(avisos.some((aviso) => aviso.includes('Desistir da operação'))).toBe(true);
  });

  // (e) FR-010 + T4.
  it('desistir pede confirmação com o aviso da transação em voo, e não chama cancelamento', async () => {
    const usuario = userEvent.setup();
    const { cliente, chamadas } = erpFake();
    const desfechos = renderizar(cliente);

    await screen.findByText('Aguardando retorno do TEF');
    await usuario.click(screen.getByTestId('desistir-operacao-tef'));

    const dialogo = await screen.findByTestId('confirmar-desistencia-tef');
    expect(dialogo).toHaveTextContent(AVISO_TRANSACAO_EM_VOO);
    expect(desfechos.abandonados).toHaveLength(0);

    await usuario.click(screen.getByRole('button', { name: 'Desistir mesmo assim' }));

    expect(desfechos.abandonados).toEqual([MOTIVO_TEF_DESISTENCIA]);
    expect(desfechos.fechamentos.quantidade).toBe(1);
    expect(
      chamadas.every(
        (chamada) =>
          chamada.caminho.startsWith(CAMINHO_CRIAR) ||
          chamada.caminho.startsWith(CAMINHO_CONSULTAR),
      ),
    ).toBe(true);
  });

  // (f)
  it('REJ_PAG abandona com o motivo de pagamento rejeitado', async () => {
    const { cliente } = erpFake({ statusSequencia: ['PDT', 'REJ_PAG'] });
    const desfechos = renderizar(cliente);

    await waitFor(() => {
      expect(desfechos.abandonados).toEqual(['PAGAMENTO_REJEITADO']);
    });
    expect(desfechos.fechamentos.quantidade).toBe(1);
    expect(avisos.some((aviso) => aviso.includes('operador da maquininha não aceitou'))).toBe(true);
  });

  // `REJ`: o cartão não passou, e o cliente pode tentar de novo (AD-268).
  it('REJ avisa o operador, mantém a janela esperando e some quando o cliente aprova', async () => {
    const { cliente } = erpFake({
      statusSequencia: ['PDT', 'REJ', 'REJ', 'PROC', 'CNC'],
      detalhesDaRecusa: { reason: 'Saldo insuficiente (sintético)' },
    });
    const desfechos = renderizar(cliente);

    const aviso = await screen.findByTestId('tef-tentativa-recusada');
    expect(aviso).toHaveTextContent('O cartão não foi aprovado');
    expect(screen.getByTestId('tef-motivo-recusa')).toHaveTextContent(
      'Saldo insuficiente (sintético)',
    );
    // Não encerrou nada: nenhum abandono, nenhum fechamento, nenhuma aprovação.
    expect(desfechos.abandonados).toHaveLength(0);
    expect(desfechos.fechamentos.quantidade).toBe(0);
    expect(desfechos.aprovados).toHaveLength(0);

    // Cliente tenta de novo e a mesma cobrança chega a `CNC`.
    await waitFor(() => {
      expect(desfechos.aprovados).toHaveLength(1);
    });
    expect(screen.queryByTestId('tef-tentativa-recusada')).toBeNull();
    expect(desfechos.abandonados).toHaveLength(0);
  });

  it('REJ sem reason mostra o aviso sem a linha do motivo', async () => {
    const { cliente } = erpFake({ statusSequencia: ['REJ'] });
    renderizar(cliente);

    await screen.findByTestId('tef-tentativa-recusada');
    expect(screen.queryByTestId('tef-motivo-recusa')).toBeNull();
  });

  // (g) D10.
  it('erro de criação: painel com a frase do ERP, retry faz chamada nova, desistir sai sem confirmação', async () => {
    const usuario = userEvent.setup();
    const { cliente, chamadas } = erpFake({ recusasDeCriacao: 2 });
    const desfechos = renderizar(cliente);

    expect(await screen.findByTestId('erro-criacao-tef')).toHaveTextContent(RECUSA_SERIAL);

    await usuario.click(screen.getByTestId('tentar-novamente-tef'));
    await waitFor(() => {
      expect(criacoes(chamadas)).toHaveLength(2);
    });
    await screen.findByTestId('erro-criacao-tef');

    await usuario.click(screen.getByTestId('desistir-operacao-tef'));

    expect(screen.queryByTestId('confirmar-desistencia-tef')).toBeNull();
    expect(desfechos.abandonados).toEqual([MOTIVO_TEF_DESISTENCIA]);
    expect(desfechos.fechamentos.quantidade).toBe(1);
  });

  // (h) FR-014.
  it('sem UsuarioGAM: nenhuma requisição, abandona com o motivo explicado', async () => {
    const { cliente, chamadas } = erpFake();
    const desfechos = renderizar(cliente, { usuarioGamPresente: false });

    await waitFor(() => {
      expect(desfechos.abandonados).toEqual([MOTIVO_TEF_SEM_USUARIO_GAM]);
    });
    expect(chamadas).toHaveLength(0);
    expect(avisos.some((aviso) => aviso.includes('usuário do TEF'))).toBe(true);
  });

  it('sem cliente: nenhuma requisição, abandona com o motivo explicado', async () => {
    const { cliente, chamadas } = erpFake();
    const desfechos = renderizar(cliente, { clienteAtual: null });

    await waitFor(() => {
      expect(desfechos.abandonados).toEqual([MOTIVO_TEF_SEM_CLIENTE]);
    });
    expect(chamadas).toHaveLength(0);
  });

  // (i) FR-013 + T9.
  it.each([
    [MEIO_PAGTO.CartaoCredito, 2],
    [MEIO_PAGTO.CartaoDebito, 1],
    [MEIO_PAGTO.Pix, 1],
  ])('meio %s com prazo 2 → PagamentoParcelas %d', async (meio, esperado) => {
    const { cliente, chamadas } = erpFake();
    renderizar(cliente, { meioPagtoNFe: meio, prazoDaCondicao: 2 });

    await waitFor(() => {
      expect(criacoes(chamadas)).toHaveLength(1);
    });
    expect(criacoes(chamadas)[0]?.corpo).toMatchObject({
      PagamentoParcelas: esperado,
      PagamentoValor: 83.29,
      PagamentoCpfCliente: '12345678909',
      PagamentoNomeCliente: 'MARIA EXEMPLO',
      FPgCod: 40,
    });
  });

  // (j) J3.
  it('desmontar com o polling ligado não deixa consulta pendente', async () => {
    const { cliente, chamadas } = erpFake();
    const desfechos = renderizar(cliente);

    await waitFor(() => {
      expect(consultas(chamadas)).toBeGreaterThan(0);
    });
    desfechos.desmontar();
    await esperar(INTERVALO_TESTE_MS);
    const depois = consultas(chamadas);
    await esperar(INTERVALO_TESTE_MS * 5);

    expect(consultas(chamadas)).toBe(depois);
  });
});

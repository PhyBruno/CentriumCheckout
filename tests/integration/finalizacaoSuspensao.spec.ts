import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CheckoutFaturarNFCe } from '../../src/client/domain/venda/montarRetratoVenda';
import { DialogoDocumentoFiscal } from '../../src/client/features/finalizacao-suspensao/DialogoDocumentoFiscal';
import {
  BarraAtalhosVenda,
  ProvedorFinalizacaoVenda,
} from '../../src/client/features/finalizacao-suspensao/AcoesFinaisVenda';
import {
  useFinalizarOuSuspenderVenda,
  type FinalizacaoDeps,
} from '../../src/client/features/finalizacao-suspensao/useFinalizarOuSuspenderVenda';
import type { ResultadoFaturamento } from '../../src/client/services/faturamento/faturarNFCeMutation';
import { CHAVE_RAIZ_PRODUTO } from '../../src/client/services/produto/produtoQueries';
import { useSessionStore } from '../../src/client/stores/sessionStore';
import { useVendaStore } from '../../src/client/stores/vendaStore';
import { linhaDe } from '../support/precificacao';
import { registroBootstrapDe } from '../support/sessao';

/**
 * Máquina de estados de envio (T011–T015, T022–T023) — `quickstart.md`,
 * Camada 2.
 *
 * O envio é **injetado**: o alvo destes testes é a máquina de estados e a
 * limpeza de fim de venda, não a camada HTTP (coberta por `faturarNFCeMutation`
 * via o E2E). Valores sintéticos.
 */

const NOTA_FISCAL_VALIDA = {
  PDFImpressao: 'JVBERi0xLjQK-sintetico',
  XMLImpressao: '<NFe><infNFe>sintetico</infNFe></NFe>',
};

const CHAVE_PRODUTO_EM_CACHE = [...CHAVE_RAIZ_PRODUTO, '001234', 'I', 8, null] as const;

interface Cenario {
  readonly deps: FinalizacaoDeps;
  readonly enviados: CheckoutFaturarNFCe[];
  readonly avisos: string[];
  readonly queryClient: QueryClient;
  readonly wrapper: (props: { children: ReactNode }) => ReactNode;
}

function montarCenario(
  respostas: readonly ResultadoFaturamento[],
  sobrescritas: Partial<FinalizacaoDeps> = {},
): Cenario {
  const enviados: CheckoutFaturarNFCe[] = [];
  const avisos: string[] = [];
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  const deps: FinalizacaoDeps = {
    enviar: (retrato) => {
      enviados.push(retrato);
      const resposta = respostas[enviados.length - 1] ?? respostas[respostas.length - 1];
      return Promise.resolve(resposta ?? { estado: 'sucesso', notaFiscal: NOTA_FISCAL_VALIDA });
    },
    avisar: (mensagem) => {
      avisos.push(mensagem);
    },
    ...sobrescritas,
  };

  return {
    deps,
    enviados,
    avisos,
    queryClient,
    wrapper: ({ children }) =>
      createElement(QueryClientProvider, { client: queryClient }, children),
  };
}

function renderizar(cenario: Cenario) {
  return renderHook(() => useFinalizarOuSuspenderVenda(cenario.deps), {
    wrapper: cenario.wrapper,
  });
}

beforeEach(() => {
  useSessionStore.setState({ estado: 'pronto', registro: registroBootstrapDe() });
  const venda = useVendaStore.getState();
  venda.resetarAuditoria('NOVA');
  venda.resetarIdentidadeVenda();
  venda.limparCarrinho();
  useVendaStore.setState({ linhas: [linhaDe({ quantidadeEmUnidades: 2, precoUnitario: 1000 })] });
});

describe('falha de rede — nenhum reenvio automático (T011, FR-004, AD-038)', () => {
  it('vai para falha-rede, anexa FATURAMENTO_FALHOU e não faz uma segunda chamada sozinho', async () => {
    const cenario = montarCenario([{ estado: 'falha-rede' }]);
    const { result } = renderizar(cenario);

    await act(async () => {
      await result.current.finalizar();
    });

    expect(result.current.estado).toEqual({ tipo: 'falha-rede', operacao: 'FATURAR' });
    expect(cenario.enviados).toHaveLength(1);

    const tipos = useVendaStore.getState().eventos.map((evento) => evento.tipo);
    expect(tipos).toContain('VENDA_FINALIZADA');
    expect(tipos.at(-1)).toBe('FATURAMENTO_FALHOU');
  });

  it('ignora um novo acionamento do botão enquanto a confirmação não vier', async () => {
    const cenario = montarCenario([{ estado: 'falha-rede' }]);
    const { result } = renderizar(cenario);

    await act(async () => {
      await result.current.finalizar();
    });
    await act(async () => {
      await result.current.finalizar();
    });

    expect(cenario.enviados).toHaveLength(1);
  });

  it('reenvia com o mesmo payload recomposto e Log estritamente maior na confirmação manual', async () => {
    const cenario = montarCenario([
      { estado: 'falha-rede' },
      { estado: 'sucesso', notaFiscal: NOTA_FISCAL_VALIDA },
    ]);
    const { result } = renderizar(cenario);

    await act(async () => {
      await result.current.finalizar();
    });
    await act(async () => {
      await result.current.confirmarReenvio();
    });

    expect(cenario.enviados).toHaveLength(2);

    const primeiro = cenario.enviados[0];
    const segundo = cenario.enviados[1];
    if (primeiro === undefined || segundo === undefined) {
      throw new Error('as duas tentativas deveriam ter sido registradas');
    }

    // Mesmo payload, exceto o Log — que cresce com o evento da falha anterior.
    expect({ ...segundo, Log: primeiro.Log }).toEqual(primeiro);
    expect(segundo.Log.length).toBeGreaterThan(primeiro.Log.length);

    const logAnterior: unknown[] = JSON.parse(primeiro.Log);
    const logDoReenvio: unknown[] = JSON.parse(segundo.Log);
    expect(logDoReenvio.length).toBe(logAnterior.length + 1);
    expect(result.current.estado.tipo).toBe('sucesso');
  });
});

describe('falha de negócio — reenvio livre (T012, research.md D2)', () => {
  it('vai para falha-negocio quando o ERP responde com erro', async () => {
    const cenario = montarCenario([{ estado: 'falha-negocio', mensagem: 'Cliente sem CPF.' }]);
    const { result } = renderizar(cenario);

    await act(async () => {
      await result.current.finalizar();
    });

    expect(result.current.estado).toEqual({
      tipo: 'falha-negocio',
      mensagem: 'Cliente sem CPF.',
    });
  });

  it('permite novo envio sem exigir confirmação extra', async () => {
    const cenario = montarCenario([
      { estado: 'falha-negocio', mensagem: 'Cliente sem CPF.' },
      { estado: 'sucesso', notaFiscal: NOTA_FISCAL_VALIDA },
    ]);
    const { result } = renderizar(cenario);

    await act(async () => {
      await result.current.finalizar();
    });
    await act(async () => {
      await result.current.finalizar();
    });

    expect(cenario.enviados).toHaveLength(2);
    expect(result.current.estado.tipo).toBe('sucesso');
  });
});

describe('sucesso — limpeza na mesma transação (T013, FR-012)', () => {
  it('descarta carrinho, cache de produto, auditoria e identidade da venda', async () => {
    const cenario = montarCenario([{ estado: 'sucesso', notaFiscal: NOTA_FISCAL_VALIDA }]);
    cenario.queryClient.setQueryData(CHAVE_PRODUTO_EM_CACHE, { codigoProduto: '001234' });
    useVendaStore.getState().definirIdentidadeVenda({ origem: 'RASCUNHO', numeroNota: 4821 });

    const { result } = renderizar(cenario);

    await act(async () => {
      await result.current.finalizar();
    });

    await waitFor(() => {
      expect(result.current.estado.tipo).toBe('sucesso');
    });

    const venda = useVendaStore.getState();
    expect(venda.linhas).toEqual([]);
    expect(venda.identidadeVenda).toEqual({ origem: 'NOVA', numeroNota: 0 });
    // O histórico da venda emitida é descartado e a próxima sessão já nasce
    // aberta: nada da venda anterior sobrevive, e a seguinte nunca começa sem
    // `VENDA_INICIADA` (`FR-012` daqui + `FR-002`/`FR-008` da feature 001).
    expect(venda.eventos.map((evento) => evento.tipo)).toEqual(['VENDA_INICIADA']);
    expect(cenario.queryClient.getQueryData(CHAVE_PRODUTO_EM_CACHE)).toBeUndefined();
  });

  it('envia o NumeroNota do rascunho retomado, não 0 (FR-003)', async () => {
    const cenario = montarCenario([{ estado: 'sucesso', notaFiscal: NOTA_FISCAL_VALIDA }]);
    useVendaStore.getState().definirIdentidadeVenda({ origem: 'RASCUNHO', numeroNota: 4821 });

    const { result } = renderizar(cenario);

    await act(async () => {
      await result.current.finalizar();
    });

    expect(cenario.enviados[0]?.NumeroNota).toBe(4821);
  });
});

describe('gate da validação prévia (T014, FR-014, AD-113)', () => {
  it('bloqueia FATURAR sem veredito favorável, sem tocar a rede nem o estado', async () => {
    const cenario = montarCenario([{ estado: 'sucesso', notaFiscal: NOTA_FISCAL_VALIDA }], {
      podeFinalizar: () => false,
    });
    const { result } = renderizar(cenario);

    await act(async () => {
      await result.current.finalizar();
    });

    expect(cenario.enviados).toHaveLength(0);
    expect(result.current.estado).toEqual({ tipo: 'ocioso' });
    expect(cenario.avisos).toHaveLength(1);
  });

  it('não se aplica a SUSPENDER (FR-016)', async () => {
    const cenario = montarCenario([{ estado: 'sucesso', notaFiscal: null }], {
      podeFinalizar: () => false,
    });
    const { result } = renderizar(cenario);

    await act(async () => {
      await result.current.suspender();
    });

    expect(cenario.enviados).toHaveLength(1);
    expect(cenario.enviados[0]?.SuspenderOuFaturar).toBe('SUSPENDER');
  });
});

describe('bloqueio de suspensão por pagamento não removível (T022/T023, FR-005/FR-006)', () => {
  it('bloqueia SUSPENDER com TEF/PIX aprovado, sem chamada de rede', async () => {
    const cenario = montarCenario([{ estado: 'sucesso', notaFiscal: null }], {
      temPagamentoNaoRemovivel: () => true,
    });
    const { result } = renderizar(cenario);

    await act(async () => {
      await result.current.suspender();
    });

    expect(cenario.enviados).toHaveLength(0);
    expect(result.current.estado).toEqual({ tipo: 'ocioso' });
    expect(cenario.avisos).toHaveLength(1);
  });

  it('permite SUSPENDER quando só há pagamento removível', async () => {
    const cenario = montarCenario([{ estado: 'sucesso', notaFiscal: null }], {
      temPagamentoNaoRemovivel: () => false,
    });
    const { result } = renderizar(cenario);

    await act(async () => {
      await result.current.suspender();
    });

    expect(cenario.enviados).toHaveLength(1);
    expect(useVendaStore.getState().linhas).toEqual([]);
  });

  it('nunca bloqueia FATURAR — finalizar com pagamento aprovado é o caminho normal', async () => {
    const cenario = montarCenario([{ estado: 'sucesso', notaFiscal: NOTA_FISCAL_VALIDA }], {
      temPagamentoNaoRemovivel: () => true,
    });
    const { result } = renderizar(cenario);

    await act(async () => {
      await result.current.finalizar();
    });

    expect(cenario.enviados).toHaveLength(1);
    expect(cenario.enviados[0]?.SuspenderOuFaturar).toBe('FATURAR');
  });
});

describe('auditoria do desfecho (SC-001)', () => {
  it('fecha o Log com VENDA_SUSPENSA ao suspender', async () => {
    const cenario = montarCenario([{ estado: 'sucesso', notaFiscal: null }]);
    const { result } = renderizar(cenario);

    await act(async () => {
      await result.current.suspender();
    });

    const enviado = cenario.enviados[0];
    if (enviado === undefined) {
      throw new Error('a suspensão deveria ter sido enviada');
    }
    const eventos: { tipo: string }[] = JSON.parse(enviado.Log);
    expect(eventos.at(-1)?.tipo).toBe('VENDA_SUSPENSA');
  });
});

describe('configuração do PDV ausente', () => {
  it('não envia nada quando o bootstrap ainda não carregou', async () => {
    useSessionStore.setState({ estado: 'carregando', registro: null });
    const cenario = montarCenario([{ estado: 'sucesso', notaFiscal: NOTA_FISCAL_VALIDA }]);
    const { result } = renderizar(cenario);

    await act(async () => {
      await result.current.finalizar();
    });

    expect(cenario.enviados).toHaveLength(0);
    expect(result.current.estado.tipo).toBe('falha-negocio');
  });
});

describe('descartar', () => {
  it('volta a ocioso depois de um desfecho', async () => {
    const cenario = montarCenario([{ estado: 'falha-negocio', mensagem: 'erro sintético' }]);
    const { result } = renderizar(cenario);

    await act(async () => {
      await result.current.finalizar();
    });
    act(() => {
      result.current.descartar();
    });

    expect(result.current.estado).toEqual({ tipo: 'ocioso' });
  });
});

describe('fallback de impressão (T015, FR-009, research.md D5)', () => {
  function renderizarDocumento(
    tipoImpressao: 'E' | 'P',
    fetchImpl: typeof fetch,
    protocoloDaPagina = 'http:',
  ) {
    return render(
      createElement(DialogoDocumentoFiscal, {
        notaFiscal: NOTA_FISCAL_VALIDA,
        tipoImpressao,
        cadMaqHost: '127.0.0.1:4545',
        onFechar: () => undefined,
        impressaoDeps: { fetchImpl, protocoloDaPagina },
      }),
    );
  }

  it("imprime direto quando TipoImpressao = 'E' e o serviço local responde", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.resolve(new Response('')));

    renderizarDocumento('E', fetchImpl);

    expect(await screen.findByText(/enviado para impressão/i)).toBeInTheDocument();
    expect(screen.queryByTestId('link-pdf-documento-fiscal')).not.toBeInTheDocument();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('oferece o PDF quando o serviço local não responde — nunca falha em silêncio', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('Failed to fetch')));

    renderizarDocumento('E', fetchImpl);

    expect(await screen.findByTestId('link-pdf-documento-fiscal')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/serviço de impressão da máquina/i);
  });

  it('distingue o bloqueio do navegador do serviço indisponível', async () => {
    // Página em `https:` chamando `http://…`: Mixed Content, decidível antes de
    // tentar. A remediação é de política de TI, não de impressora.
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.resolve(new Response('')));

    renderizarDocumento('E', fetchImpl, 'https:');

    expect(await screen.findByTestId('link-pdf-documento-fiscal')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/navegador bloqueou/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("apresenta o PDF direto quando TipoImpressao = 'P', sem tentar o serviço local", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.resolve(new Response('')));

    renderizarDocumento('P', fetchImpl);

    expect(await screen.findByTestId('link-pdf-documento-fiscal')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('classificação da falha vem da origem, não da mensagem (research.md D2)', () => {
  it('usa o resultado do serviço sem reinterpretar texto', async () => {
    const enviar = vi.fn<() => Promise<ResultadoFaturamento>>(() =>
      Promise.resolve({ estado: 'falha-rede' }),
    );
    const cenario = montarCenario([], { enviar });
    const { result } = renderizar(cenario);

    await act(async () => {
      await result.current.finalizar();
    });

    expect(enviar).toHaveBeenCalledTimes(1);
    expect(result.current.estado.tipo).toBe('falha-rede');
  });
});

/**
 * `children` entra no objeto de props, não como terceiro argumento de
 * `createElement`: o tipo de `ProvedorFinalizacaoVendaProps` o declara
 * obrigatório, e o overload variádico não o satisfaz sob `tsc`.
 */
function renderizarAtalhos(cenario: Cenario) {
  return createElement(
    cenario.wrapper,
    null,
    createElement(ProvedorFinalizacaoVenda, {
      deps: cenario.deps,
      children: createElement(BarraAtalhosVenda),
    }),
  );
}

describe('correções do usuário (2026-09-02)', () => {
  it('desabilita "Cancelar venda" enquanto a venda não tem item', () => {
    const cenario = montarCenario([{ estado: 'sucesso', notaFiscal: null }]);
    useVendaStore.getState().limparCarrinho();

    render(renderizarAtalhos(cenario));

    expect(screen.getByTestId('botao-cancelar-venda')).toBeDisabled();
  });

  it('habilita "Cancelar venda" assim que existe linha ativa', () => {
    const cenario = montarCenario([{ estado: 'sucesso', notaFiscal: null }]);

    render(renderizarAtalhos(cenario));

    expect(screen.getByTestId('botao-cancelar-venda')).toBeEnabled();
  });

  it('não conta linha cancelada como venda a suspender (CART-08)', () => {
    const cenario = montarCenario([{ estado: 'sucesso', notaFiscal: null }]);
    useVendaStore.setState({ linhas: [linhaDe({ cancelada: true })] });

    render(renderizarAtalhos(cenario));

    expect(screen.getByTestId('botao-cancelar-venda')).toBeDisabled();
  });

  it('comunica a suspensão por notificação, não por texto fixo na tela', async () => {
    const notificacoes: string[] = [];
    const cenario = montarCenario([{ estado: 'sucesso', notaFiscal: null }], {
      notificar: (mensagem) => {
        notificacoes.push(mensagem);
      },
    });
    const { result } = renderizar(cenario);

    await act(async () => {
      await result.current.suspender();
    });

    expect(notificacoes).toEqual(['Venda suspensa. O rascunho continua disponível para retomada.']);
  });

  it('não notifica nada ao finalizar — quem comunica é o modal do documento fiscal', async () => {
    const notificacoes: string[] = [];
    const cenario = montarCenario([{ estado: 'sucesso', notaFiscal: NOTA_FISCAL_VALIDA }], {
      notificar: (mensagem) => {
        notificacoes.push(mensagem);
      },
    });
    const { result } = renderizar(cenario);

    await act(async () => {
      await result.current.finalizar();
    });

    expect(notificacoes).toEqual([]);
  });

  it('fecha o modal do documento fiscal com ESC', async () => {
    const fechado = vi.fn();
    render(
      createElement(DialogoDocumentoFiscal, {
        notaFiscal: NOTA_FISCAL_VALIDA,
        tipoImpressao: 'P',
        cadMaqHost: '127.0.0.1:4545',
        onFechar: fechado,
      }),
    );

    await userEvent.keyboard('{Escape}');

    expect(fechado).toHaveBeenCalledTimes(1);
  });
});

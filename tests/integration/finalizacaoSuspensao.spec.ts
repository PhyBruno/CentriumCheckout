import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CheckoutFaturarNFCe } from '../../src/client/domain/venda/montarRetratoVenda';
import { DialogoDocumentoFiscal } from '../../src/client/features/finalizacao-suspensao/DialogoDocumentoFiscal';
import {
  AcoesFinaisVenda,
  motivoDeBloqueioDoFinalizar,
  BarraAtalhosVenda,
  ProvedorFinalizacaoVenda,
  useFinalizacaoVenda,
} from '../../src/client/features/finalizacao-suspensao/AcoesFinaisVenda';
import {
  useFinalizarOuSuspenderVenda,
  type FinalizacaoDeps,
} from '../../src/client/features/finalizacao-suspensao/useFinalizarOuSuspenderVenda';
import type { ResultadoFaturamento } from '../../src/client/services/faturamento/faturarNFCeMutation';
import type { abrirPdfNFCe } from '../../src/client/services/impressao/abrirPdfNFCe';
import { CHAVE_RAIZ_PRODUTO } from '../../src/client/services/produto/produtoQueries';
import { useSessionStore } from '../../src/client/stores/sessionStore';
import { useVendaStore } from '../../src/client/stores/vendaStore';
import { clienteCheckoutDe } from '../support/cliente';
import { pagamentoDe } from '../support/pagamento';
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
    // Gate da 014 aprovado por padrão. Até a feature 014 existir, o default do
    // hook era `() => true` e esta suíte não precisava dizer nada; hoje o
    // default lê `vendaStore.podeFinalizar()`, que é `false` numa venda sem
    // veredito — e sem esta linha **todo** cenário de finalização pararia no
    // gate antes de exercitar a máquina de estados, que é o que ela testa.
    // Os dois cenários que verificam o bloqueio sobrescrevem para `false`.
    podeFinalizar: () => true,
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
  const registro = registroBootstrapDe({ VendedorCodigo: 7, VendedorNome: 'Fulano' });
  useSessionStore.setState({ estado: 'pronto', registro });
  const venda = useVendaStore.getState();
  venda.resetarAuditoria('NOVA');
  venda.resetarIdentidadeVenda();
  venda.limparCarrinho();
  // Zera o pagamento junto com o resto da venda (feature 008). Sem isto, um
  // teste que aplica pagamento deixa `podeMutarCarrinho()` em `false` para o
  // próximo — e `selecionarCliente`/`editarItem` viram no-op silencioso, que é
  // exatamente o bloqueio de I7 funcionando fora de hora.
  venda.limparPagamentos();
  // Vendedor default presente (feature 012, `FR-005`): mesmo estado que
  // `abrirSessaoDeVenda` produz numa venda real. Sem isto, `AcoesFinaisVenda`
  // bloquearia "Finalizar venda" por falta de vendedor (`FR-006`/`SC-003`) em
  // testes que não são sobre essa regra.
  venda.inicializarVendedorPadrao(registro.SessaoUsuario);
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

  it('mantém a venda no caixa — nada é limpo numa recusa sem documento gravado', async () => {
    const cenario = montarCenario([{ estado: 'falha-negocio', mensagem: 'Cliente sem CPF.' }]);
    const { result } = renderizar(cenario);

    await act(async () => {
      await result.current.finalizar();
    });
    act(() => {
      result.current.descartar();
    });

    expect(useVendaStore.getState().linhas).toHaveLength(1);
  });
});

/**
 * NFCe rejeitada — o ERP gravou o documento (correção do usuário, 2026-09-10).
 *
 * O que separa este bloco do de cima é o destino da venda: aqui ela **não pode**
 * continuar no caixa, porque a nota já existe do lado do ERP e um segundo envio
 * emitiria outra para a mesma compra.
 */
describe('NFCe rejeitada — o caixa é liberado ao fechar o aviso', () => {
  const REJEICAO = {
    estado: 'nfce-rejeitada',
    mensagem: 'Rejeicao: Duplicidade de NF-e (erro 539)',
    numeroNota: 9001,
    serieNota: '1',
  } as const;

  it('leva o motivo do ERP e a identificação da nota até a tela', async () => {
    const cenario = montarCenario([REJEICAO]);
    const { result } = renderizar(cenario);

    await act(async () => {
      await result.current.finalizar();
    });

    expect(result.current.estado).toEqual({
      tipo: 'nfce-rejeitada',
      mensagem: 'Rejeicao: Duplicidade de NF-e (erro 539)',
      numeroNota: 9001,
      serieNota: '1',
    });
  });

  it('não limpa nada antes de o operador fechar o aviso', async () => {
    const cenario = montarCenario([REJEICAO]);
    useVendaStore.getState().definirIdentidadeVenda({ origem: 'RASCUNHO', numeroNota: 4821 });
    const { result } = renderizar(cenario);

    await act(async () => {
      await result.current.finalizar();
    });

    const venda = useVendaStore.getState();
    expect(venda.linhas).toHaveLength(1);
    expect(venda.identidadeVenda).toEqual({ origem: 'RASCUNHO', numeroNota: 4821 });
  });

  it('descarta carrinho, cache de produto, auditoria e identidade ao fechar', async () => {
    const cenario = montarCenario([REJEICAO]);
    cenario.queryClient.setQueryData(CHAVE_PRODUTO_EM_CACHE, { codigoProduto: '001234' });
    useVendaStore.getState().definirIdentidadeVenda({ origem: 'RASCUNHO', numeroNota: 4821 });
    const { result } = renderizar(cenario);

    await act(async () => {
      await result.current.finalizar();
    });
    act(() => {
      result.current.descartar();
    });

    const venda = useVendaStore.getState();
    expect(venda.linhas).toEqual([]);
    expect(venda.identidadeVenda).toEqual({ origem: 'NOVA', numeroNota: 0 });
    // A próxima venda já nasce com histórico aberto: sem isto o primeiro item
    // dela cairia num `Log` sem `VENDA_INICIADA` (`FR-002` da feature 001).
    expect(venda.eventos.map((evento) => evento.tipo)).toEqual(['VENDA_INICIADA']);
    expect(cenario.queryClient.getQueryData(CHAVE_PRODUTO_EM_CACHE)).toBeUndefined();
    expect(result.current.estado).toEqual({ tipo: 'ocioso' });
  });

  it('recusa um segundo envio enquanto o aviso está aberto — nunca duas NFCe para a mesma compra', async () => {
    const cenario = montarCenario([REJEICAO]);
    const { result } = renderizar(cenario);

    await act(async () => {
      await result.current.finalizar();
    });
    await act(async () => {
      await result.current.finalizar();
    });

    expect(cenario.enviados).toHaveLength(1);
    expect(result.current.estado.tipo).toBe('nfce-rejeitada');
  });

  it('não anexa FATURAMENTO_FALHOU: não há reenvio a carregar o evento', async () => {
    const cenario = montarCenario([REJEICAO]);
    const { result } = renderizar(cenario);

    await act(async () => {
      await result.current.finalizar();
    });

    const tipos = useVendaStore.getState().eventos.map((evento) => evento.tipo);
    expect(tipos).toContain('VENDA_FINALIZADA');
    expect(tipos).not.toContain('FATURAMENTO_FALHOU');
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

describe('entrega do documento fiscal (T015, FR-009; correções do usuário 2026-09-02)', () => {
  function renderizarEntrega(
    tipoImpressao: 'E' | 'P',
    opcoes: {
      fetchImpl?: typeof fetch;
      protocoloDaPagina?: string;
      abrirPdf?: typeof abrirPdfNFCe;
      onFechar?: () => void;
    } = {},
  ) {
    const fetchImpl =
      opcoes.fetchImpl ?? vi.fn<typeof fetch>(() => Promise.resolve(new Response('')));
    return render(
      createElement(DialogoDocumentoFiscal, {
        notaFiscal: NOTA_FISCAL_VALIDA,
        tipoImpressao,
        cadMaqHost: '127.0.0.1:4545',
        onFechar: opcoes.onFechar ?? (() => undefined),
        impressaoDeps: {
          fetchImpl,
          protocoloDaPagina: opcoes.protocoloDaPagina ?? 'http:',
        },
        abrirPdf: opcoes.abrirPdf ?? (() => ({ estado: 'aberto' })),
      }),
    );
  }

  it("com TipoImpressao = 'P' abre o PDF em outra aba e não mostra modal nenhum", async () => {
    const abrirPdf = vi.fn<typeof abrirPdfNFCe>(() => ({ estado: 'aberto' }));
    const onFechar = vi.fn();

    renderizarEntrega('P', { abrirPdf, onFechar });

    await waitFor(() => {
      expect(abrirPdf).toHaveBeenCalledTimes(1);
    });
    expect(abrirPdf).toHaveBeenCalledWith(NOTA_FISCAL_VALIDA.PDFImpressao);
    expect(screen.queryByTestId('dialogo-documento-fiscal')).not.toBeInTheDocument();
    expect(onFechar).toHaveBeenCalled();
  });

  it('impressão direta bem-sucedida também não mostra modal', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.resolve(new Response('')));
    const onFechar = vi.fn();

    renderizarEntrega('E', { fetchImpl, onFechar });

    await waitFor(() => {
      expect(onFechar).toHaveBeenCalled();
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('dialogo-documento-fiscal')).not.toBeInTheDocument();
  });

  it('mostra o modal enquanto conversa com a impressora', () => {
    // `fetch` que nunca resolve: mantém a entrega no estado de espera.
    const fetchImpl = vi.fn<typeof fetch>(() => new Promise<Response>(() => undefined));

    renderizarEntrega('E', { fetchImpl });

    expect(screen.getByTestId('dialogo-documento-fiscal')).toBeInTheDocument();
    expect(screen.getByText(/enviando para a impressora/i)).toBeInTheDocument();
  });

  it('oferece o PDF quando o serviço local não responde — nunca falha em silêncio', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('Failed to fetch')));

    renderizarEntrega('E', { fetchImpl });

    expect(await screen.findByTestId('abrir-pdf-documento-fiscal')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/serviço de impressão da máquina/i);
  });

  it('distingue o bloqueio do navegador do serviço indisponível', async () => {
    // Página em `https:` chamando `http://…`: Mixed Content, decidível antes de
    // tentar. A remediação é de política de TI, não de impressora.
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.resolve(new Response('')));

    renderizarEntrega('E', { fetchImpl, protocoloDaPagina: 'https:' });

    expect(await screen.findByTestId('abrir-pdf-documento-fiscal')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/navegador bloqueou/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('mostra o modal quando o navegador recusa a aba do PDF, sem perder o documento', async () => {
    const abrirPdf = vi.fn<typeof abrirPdfNFCe>(() => ({ estado: 'bloqueado-pelo-navegador' }));

    renderizarEntrega('P', { abrirPdf });

    expect(await screen.findByTestId('dialogo-documento-fiscal')).toBeInTheDocument();
    expect(screen.getByText(/bloqueou a aba do pdf/i)).toBeInTheDocument();
    expect(screen.getByTestId('abrir-pdf-documento-fiscal')).toBeInTheDocument();
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
  it('desabilita "Cancelar venda" enquanto a venda não tem item, com o motivo legível no botão', async () => {
    const cenario = montarCenario([{ estado: 'sucesso', notaFiscal: null }]);
    useVendaStore.getState().limparCarrinho();

    render(renderizarAtalhos(cenario));

    // `aria-disabled`, não `disabled`: o botão bloqueado precisa continuar
    // clicável para dizer por que está bloqueado (`lib/bloqueio.ts`). O texto
    // do motivo é afirmado aqui pelo `title`; que ele **também** vira
    // notificação ao clicar é o que o E2E verifica, com o toast real na tela.
    const botao = screen.getByTestId('botao-cancelar-venda');
    expect(botao).toHaveAttribute('aria-disabled', 'true');
    expect(botao).toHaveAttribute('title', expect.stringMatching(/nenhum item foi lançado/i));

    await userEvent.click(botao);

    // Clicar bloqueado não suspende nada: nenhum retrato foi ao ERP.
    expect(cenario.enviados).toHaveLength(0);
  });

  it('habilita "Cancelar venda" assim que existe linha ativa', () => {
    const cenario = montarCenario([{ estado: 'sucesso', notaFiscal: null }]);

    render(renderizarAtalhos(cenario));

    expect(screen.getByTestId('botao-cancelar-venda')).not.toHaveAttribute('aria-disabled');
  });

  it('habilita "Cancelar venda" quando só restam linhas canceladas (correção de 2026-09-03)', () => {
    const cenario = montarCenario([{ estado: 'sucesso', notaFiscal: null }]);
    useVendaStore.setState({ linhas: [linhaDe({ cancelada: true })] });

    render(renderizarAtalhos(cenario));

    // A regra anterior exigia linha **ativa** e deixava o operador sem saída
    // numa venda cujos itens foram todos cancelados: nada a finalizar e nada a
    // cancelar. A linha cancelada continua no array por rastreabilidade
    // (`CART-08`) e é prova de que a venda foi digitada.
    expect(screen.getByTestId('botao-cancelar-venda')).not.toHaveAttribute('aria-disabled');
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
    // `fetch` que nunca resolve: segura o modal no estado de espera, que é o
    // único caminho em que ele fica na tela esperando o operador.
    render(
      createElement(DialogoDocumentoFiscal, {
        notaFiscal: NOTA_FISCAL_VALIDA,
        tipoImpressao: 'E',
        cadMaqHost: '127.0.0.1:4545',
        onFechar: fechado,
        impressaoDeps: { fetchImpl: () => new Promise<Response>(() => undefined) },
      }),
    );
    expect(screen.getByTestId('dialogo-documento-fiscal')).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');

    expect(fechado).toHaveBeenCalledTimes(1);
  });
});

/**
 * A frase que cada trava produz, e a ordem entre elas (correção do usuário,
 * 2026-09-10). Pura, então não precisa de componente montado.
 */
describe('motivoDeBloqueioDoFinalizar', () => {
  const LIBERADO = {
    haValorAFaturar: true,
    temVereditoFavoravel: true,
    falhaDeRede: false,
    temVendedor: true,
  };

  it('devolve null quando as quatro condições estão satisfeitas', () => {
    expect(motivoDeBloqueioDoFinalizar(LIBERADO)).toBeNull();
  });

  it('nomeia o vendedor — a trava que o tenant real aciona com VendedorCodigo = 0', () => {
    expect(motivoDeBloqueioDoFinalizar({ ...LIBERADO, temVendedor: false })).toContain(
      'Escolha o vendedor da venda',
    );
  });

  it('nomeia o pagamento quando a venda não fecha', () => {
    expect(motivoDeBloqueioDoFinalizar({ ...LIBERADO, haValorAFaturar: false })).toContain(
      'cubra todo o total com as formas de pagamento',
    );
  });

  it('nomeia o veredito do ERP quando só ele falta', () => {
    expect(motivoDeBloqueioDoFinalizar({ ...LIBERADO, temVereditoFavoravel: false })).toContain(
      'O ERP ainda não aprovou',
    );
  });

  /**
   * A precedência importa: com a rede falhada o operador tem uma saída
   * imediata ("Tentar novamente"), e mandá-lo escolher vendedor primeiro o
   * faria consertar o que não está quebrado.
   */
  it('falha de rede tem precedência sobre as demais travas', () => {
    expect(
      motivoDeBloqueioDoFinalizar({
        haValorAFaturar: false,
        temVereditoFavoravel: false,
        falhaDeRede: true,
        temVendedor: false,
      }),
    ).toContain('Tentar novamente');
  });
});

describe('guarda de valor a faturar (correção do usuário, 2026-09-02)', () => {
  /**
   * Bloqueio é `aria-disabled` + motivo no `title`, nunca o `disabled` nativo
   * (`lib/bloqueio.ts`; correção do usuário, 2026-09-10). Cada caso afirma
   * **qual** frase o operador lê: era exatamente a informação que faltava
   * quando as quatro travas colapsavam num `disabled` mudo, e um teste que só
   * conferisse "está apagado" não pegaria a volta desse defeito.
   */
  function esperarBloqueado(trechoDoMotivo: string) {
    const botao = screen.getByTestId('botao-finalizar-venda');
    expect(botao).toHaveAttribute('aria-disabled', 'true');
    expect(botao.getAttribute('title')).toContain(trechoDoMotivo);
  }

  function renderizarAcoes(cenario: Cenario) {
    return render(
      createElement(
        cenario.wrapper,
        null,
        createElement(ProvedorFinalizacaoVenda, {
          deps: cenario.deps,
          children: createElement(AcoesFinaisVenda),
        }),
      ),
    );
  }

  it('desabilita "Finalizar venda" com o carrinho vazio', () => {
    const cenario = montarCenario([{ estado: 'sucesso', notaFiscal: NOTA_FISCAL_VALIDA }]);
    useVendaStore.getState().limparCarrinho();

    renderizarAcoes(cenario);

    esperarBloqueado('A venda ainda não fecha');
  });

  it('desabilita "Finalizar venda" quando o subtotal é zero', () => {
    const cenario = montarCenario([{ estado: 'sucesso', notaFiscal: NOTA_FISCAL_VALIDA }]);
    useVendaStore.setState({
      linhas: [linhaDe({ quantidadeEmUnidades: 1, precoUnitario: 0 })],
    });

    renderizarAcoes(cenario);

    esperarBloqueado('A venda ainda não fecha');
  });

  // Comportamento **estendido pela feature 008** (2026-09-03): ter item com
  // valor deixou de bastar. Enquanto os pagamentos aprovados não cobrem o total
  // líquido, finalizar emitiria uma NFCe cujo `Σ FormaValor` não fecha com o
  // total da nota — por isso o botão só libera com `saldoRestante === 0`.
  it('mantém "Finalizar venda" desabilitado enquanto o saldo não é coberto', () => {
    const cenario = montarCenario([{ estado: 'sucesso', notaFiscal: NOTA_FISCAL_VALIDA }]);

    renderizarAcoes(cenario);

    expect(useVendaStore.getState().saldo().saldoRestante).toBeGreaterThan(0);
    esperarBloqueado('cubra todo o total com as formas de pagamento');
  });

  it('habilita "Finalizar venda" com item, subtotal positivo e saldo coberto', () => {
    const cenario = montarCenario([{ estado: 'sucesso', notaFiscal: NOTA_FISCAL_VALIDA }]);
    const total = useVendaStore.getState().saldo().totalLiquido;
    // O veredito entra junto com o pagamento porque este cenário injeta a forma
    // **por baixo** do gate da 014, que na venda real é quem o gravaria. Desde
    // que o botão passou a refletir `vereditoVigente` (revisão de 2026-09-08),
    // saldo coberto sozinho não libera a emissão — e é exatamente esse o ponto:
    // um pagamento que nunca foi validado não autoriza a nota.
    useVendaStore.setState({
      pagamentos: [pagamentoDe({ valorAplicado: total })],
      vereditoVigente: { resultado: 'ACEITA', avisos: [] },
    });

    renderizarAcoes(cenario);

    expect(screen.getByTestId('botao-finalizar-venda')).toBeEnabled();
  });

  it('mantém "Finalizar venda" desabilitado sem veredito, mesmo com o saldo coberto', () => {
    const cenario = montarCenario([{ estado: 'sucesso', notaFiscal: NOTA_FISCAL_VALIDA }]);
    const total = useVendaStore.getState().saldo().totalLiquido;
    // Mesma venda do caso acima, sem o veredito: é a diferença entre "o dinheiro
    // fecha" e "o ERP aprovou esta venda" (`FR-014`/I6 da 014).
    useVendaStore.setState({ pagamentos: [pagamentoDe({ valorAplicado: total })] });

    renderizarAcoes(cenario);

    esperarBloqueado('O ERP ainda não aprovou esta venda');
  });

  // `FR-006`/`SC-003` (feature 012): nenhuma venda é finalizada sem vendedor
  // associado — empresa sem default configurado e sem seleção manual do
  // operador não pode chegar a `FaturarNFCe` com `vendedorCodigo: 0`.
  it('desabilita "Finalizar venda" sem vendedor associado à venda', () => {
    const cenario = montarCenario([{ estado: 'sucesso', notaFiscal: NOTA_FISCAL_VALIDA }]);
    const total = useVendaStore.getState().saldo().totalLiquido;
    useVendaStore.setState({
      pagamentos: [pagamentoDe({ valorAplicado: total })],
      // Veredito favorável de propósito: sem ele o botão ficaria desabilitado
      // por dois motivos e o teste deixaria de isolar a ausência de vendedor.
      vereditoVigente: { resultado: 'ACEITA', avisos: [] },
      vendedorAtual: null,
    });

    renderizarAcoes(cenario);

    // A trava que o tenant real acionava sem nunca dizer o nome: `GetSessao`
    // devolve `VendedorCodigo = 0`, `vendedorAtual` nasce `null` e o operador
    // via o botão apagado com o pagamento cobrindo o total (relato do usuário,
    // 2026-09-10). A frase precisa nomear o vendedor e a saída.
    esperarBloqueado('Escolha o vendedor da venda');
  });

  it('recusa FATURAR sem valor mesmo quando acionado fora do botão', async () => {
    const cenario = montarCenario([{ estado: 'sucesso', notaFiscal: NOTA_FISCAL_VALIDA }]);
    useVendaStore.getState().limparCarrinho();
    const { result } = renderizar(cenario);

    await act(async () => {
      await result.current.finalizar();
    });

    expect(cenario.enviados).toHaveLength(0);
    expect(cenario.avisos).toHaveLength(1);
    expect(result.current.estado).toEqual({ tipo: 'ocioso' });
  });

  it('não aplica a guarda a SUSPENDER — o bloqueio de venda vazia é do atalho', async () => {
    const cenario = montarCenario([{ estado: 'sucesso', notaFiscal: null }]);
    const { result } = renderizar(cenario);

    await act(async () => {
      await result.current.suspender();
    });

    expect(cenario.enviados).toHaveLength(1);
  });
});

describe('cliente do retrato (regressão achada pela feature 006)', () => {
  it('envia o cliente identificado na venda, não o default do PDV', async () => {
    // Carrinho vazio na hora de selecionar: sem SKU vivo, a troca de cliente
    // não dispara re-fetch de preço, e o teste fica sobre o retrato.
    useVendaStore.getState().limparCarrinho();
    await act(async () => {
      await useVendaStore
        .getState()
        .selecionarCliente(clienteCheckoutDe({ CodCliente: 2538 }), 'BUSCA_DOCUMENTO');
    });
    useVendaStore.setState({ linhas: [linhaDe({ quantidadeEmUnidades: 1, precoUnitario: 1000 })] });

    const cenario = montarCenario([{ estado: 'sucesso', notaFiscal: NOTA_FISCAL_VALIDA }]);
    const { result } = renderizar(cenario);

    await act(async () => {
      await result.current.finalizar();
    });

    // `ClienteDefaultCodigo` do bootstrap sintético é `1`. Antes desta correção
    // o retrato mandava sempre esse `1`, e a NFCe saía para o consumidor padrão
    // mesmo com outro cliente identificado.
    expect(cenario.enviados[0]?.clienteCodigo).toBe(2538);
  });

  it('cai no cliente default do PDV quando não houve identificação (AD-032)', async () => {
    useVendaStore.getState().limparCliente();

    const cenario = montarCenario([{ estado: 'sucesso', notaFiscal: NOTA_FISCAL_VALIDA }]);
    const { result } = renderizar(cenario);

    await act(async () => {
      await result.current.finalizar();
    });

    expect(cenario.enviados[0]?.clienteCodigo).toBe(1);
  });
});

/**
 * A janela que o operador de fato vê na rejeição (correção do usuário,
 * 2026-09-10) — o provider ligado ao diálogo, não só a máquina de estados.
 *
 * O disparo vem de um botão auxiliar, e não de `AcoesFinaisVenda`: aquele passa
 * pelas quatro travas da finalização (saldo, vendedor, veredito, falha de rede),
 * que não são o alvo aqui e obrigariam cada teste desta janela a montar uma
 * venda paga inteira só para chegar ao modal.
 */
describe('janela da NFCe rejeitada', () => {
  function DisparadorDeFinalizacao(): ReactNode {
    const { finalizar } = useFinalizacaoVenda();
    return createElement('button', {
      type: 'button',
      'data-testid': 'disparar-finalizacao',
      onClick: () => {
        void finalizar();
      },
    });
  }

  function renderizarJanela(cenario: Cenario) {
    return render(
      createElement(
        cenario.wrapper,
        null,
        createElement(ProvedorFinalizacaoVenda, {
          deps: cenario.deps,
          children: createElement(DisparadorDeFinalizacao),
        }),
      ),
    );
  }

  const CENARIO_REJEICAO = {
    estado: 'nfce-rejeitada',
    mensagem: 'Rejeicao: Duplicidade de NF-e (erro 539)',
    numeroNota: 9001,
    serieNota: '1',
  } as const;

  it('mostra o motivo do ERP e diz que o caixa será liberado', async () => {
    const cenario = montarCenario([CENARIO_REJEICAO]);
    renderizarJanela(cenario);

    await userEvent.click(screen.getByTestId('disparar-finalizacao'));

    expect(await screen.findByTestId('dialogo-erro-faturamento')).toBeInTheDocument();
    // O texto do ERP chega íntegro à tela — era exatamente o que se perdia
    // antes desta correção.
    expect(screen.getByTestId('erro-finalizacao')).toHaveTextContent(
      'Rejeicao: Duplicidade de NF-e (erro 539)',
    );
    expect(screen.getByTestId('documento-rejeitado')).toHaveTextContent('NFCe 9001 · série 1');
    expect(screen.getByRole('alertdialog')).toHaveAccessibleName('NFCe rejeitada pelo ERP');
    // A instrução é o oposto da recusa sem documento gravado: não há o que
    // corrigir e reenviar daqui.
    expect(screen.getByText(/o caixa fica livre para uma nova NFCe/i)).toBeInTheDocument();
  });

  it('fecha pelo botão e libera o caixa para a próxima venda', async () => {
    const cenario = montarCenario([CENARIO_REJEICAO]);
    renderizarJanela(cenario);

    await userEvent.click(screen.getByTestId('disparar-finalizacao'));
    await screen.findByTestId('dialogo-erro-faturamento');
    expect(useVendaStore.getState().linhas).toHaveLength(1);

    await userEvent.click(screen.getByTestId('fechar-erro-faturamento'));

    await waitFor(() => {
      expect(screen.queryByTestId('dialogo-erro-faturamento')).not.toBeInTheDocument();
    });
    expect(useVendaStore.getState().linhas).toEqual([]);
  });

  it('a recusa sem documento gravado continua dizendo que a venda segue aberta', async () => {
    const cenario = montarCenario([{ estado: 'falha-negocio', mensagem: 'Cliente sem CPF.' }]);
    renderizarJanela(cenario);

    await userEvent.click(screen.getByTestId('disparar-finalizacao'));

    await screen.findByTestId('dialogo-erro-faturamento');
    expect(screen.getByText(/A venda continua aberta no caixa/i)).toBeInTheDocument();
    expect(screen.queryByTestId('documento-rejeitado')).not.toBeInTheDocument();
  });
});

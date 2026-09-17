import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import {
  ProvedorFinalizacaoVenda,
  useFinalizacaoVenda,
} from '../../src/client/features/finalizacao-suspensao/AcoesFinaisVenda';
import type { FinalizacaoDeps } from '../../src/client/features/finalizacao-suspensao/useFinalizarOuSuspenderVenda';
import { haJanelaAberta } from '../../src/client/lib/useFocoDeModal';
import type { ResultadoFaturamento } from '../../src/client/services/faturamento/faturarNFCeMutation';
import { useSessionStore } from '../../src/client/stores/sessionStore';
import { useVendaStore } from '../../src/client/stores/vendaStore';
import { linhaDe } from '../support/precificacao';
import { registroBootstrapDe } from '../support/sessao';

/**
 * Espera da autorização da NFCe (AD-244).
 *
 * Entre o clique em "Finalizar" e a resposta do ERP a tela ficava parada, com
 * cara de travada. O provider passa a mostrar "Autorizando NFCe" enquanto a
 * máquina está em `enviando` com `FATURAR`, e troca pelo desfecho de sempre
 * quando a resposta chega. Envio injetado e controlado pelo teste; valores
 * sintéticos.
 */

interface EnvioPendente {
  readonly deps: FinalizacaoDeps;
  responder: (resultado: ResultadoFaturamento) => void;
}

function envioPendente(): EnvioPendente {
  const pendente: EnvioPendente = {
    responder: () => {
      throw new Error('O envio ainda não foi disparado.');
    },
    deps: {
      podeFinalizar: () => true,
      temPagamentoNaoRemovivel: () => false,
      temPixNaVenda: () => false,
      notificar: () => {},
      avisar: () => {},
      enviar: () =>
        new Promise<ResultadoFaturamento>((resolver) => {
          pendente.responder = resolver;
        }),
    },
  };
  return pendente;
}

function Acionadores(): ReactElement {
  const { finalizar, suspender } = useFinalizacaoVenda();
  return (
    <>
      <button type="button" onClick={() => void finalizar()}>
        finalizar
      </button>
      <button type="button" onClick={() => void suspender()}>
        suspender
      </button>
    </>
  );
}

function renderizar(deps: FinalizacaoDeps): void {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={cliente}>
      <ProvedorFinalizacaoVenda deps={deps}>
        <Acionadores />
      </ProvedorFinalizacaoVenda>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  const registro = registroBootstrapDe({ VendedorCodigo: 7, VendedorNome: 'Fulano' });
  useSessionStore.setState({ estado: 'pronto', registro });
  const venda = useVendaStore.getState();
  venda.resetarAuditoria('NOVA');
  venda.resetarIdentidadeVenda();
  venda.limparCarrinho();
  venda.limparPagamentos();
  venda.inicializarVendedorPadrao(registro.SessaoUsuario);
  useVendaStore.setState({ linhas: [linhaDe({ quantidadeEmUnidades: 2, precoUnitario: 1000 })] });
});

describe('Autorizando NFCe (AD-244)', () => {
  it('abre ao finalizar e dá lugar ao desfecho quando o ERP responde', async () => {
    const envio = envioPendente();
    renderizar(envio.deps);

    await userEvent.click(screen.getByRole('button', { name: 'finalizar' }));

    const espera = screen.getByTestId('dialogo-autorizando-nfce');
    expect(espera).toHaveTextContent('Autorizando NFCe');
    expect(screen.getByRole('status')).toHaveTextContent('Autorizando NFCe');
    // Conta como janela aberta: as teclas fixas (016) não passam por baixo.
    expect(haJanelaAberta()).toBe(true);

    await act(async () => {
      envio.responder({ estado: 'falha-negocio', mensagem: 'Serviço indisponível.' });
      await Promise.resolve();
    });

    expect(screen.queryByTestId('dialogo-autorizando-nfce')).not.toBeInTheDocument();
    expect(screen.getByTestId('dialogo-erro-faturamento')).toHaveTextContent(
      'Serviço indisponível.',
    );
  });

  it('não tem botão de fechar e ignora o ESC — o envio já partiu', async () => {
    const envio = envioPendente();
    renderizar(envio.deps);

    await userEvent.click(screen.getByRole('button', { name: 'finalizar' }));
    const espera = screen.getByTestId('dialogo-autorizando-nfce');

    expect(espera.querySelector('button')).toBeNull();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByTestId('dialogo-autorizando-nfce')).toBeInTheDocument();
  });

  it('recebe o foco, para a bipagem não cair no campo de código por trás', async () => {
    const envio = envioPendente();
    renderizar(envio.deps);

    await userEvent.click(screen.getByRole('button', { name: 'finalizar' }));

    expect(screen.getByRole('dialog', { name: 'Autorizando NFCe' })).toHaveFocus();
  });

  it('não aparece ao cancelar (suspender) a venda — só a emissão espera a SEFAZ', async () => {
    const envio = envioPendente();
    renderizar(envio.deps);

    await userEvent.click(screen.getByRole('button', { name: 'suspender' }));

    expect(screen.queryByTestId('dialogo-autorizando-nfce')).not.toBeInTheDocument();
  });
});

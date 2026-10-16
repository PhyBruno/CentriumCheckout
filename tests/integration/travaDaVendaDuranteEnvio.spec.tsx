import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import {
  ProvedorFinalizacaoVenda,
  TravaDaVendaDuranteEnvio,
  useFinalizacaoVenda,
} from '../../src/client/features/finalizacao-suspensao/AcoesFinaisVenda';
import type { FinalizacaoDeps } from '../../src/client/features/finalizacao-suspensao/useFinalizarOuSuspenderVenda';
import { notificar } from '../../src/client/lib/notificar';
import type { ResultadoFaturamento } from '../../src/client/services/faturamento/faturarNFCeMutation';
import { useFocoVendaStore } from '../../src/client/stores/focoVendaStore';
import { useSessionStore } from '../../src/client/stores/sessionStore';
import { useVendaStore } from '../../src/client/stores/vendaStore';
import { linhaDe } from '../support/precificacao';
import { registroBootstrapDe } from '../support/sessao';

/**
 * A tela inerte enquanto a suspensão espera o ERP (AD-280) e o que acontece na
 * saída dela (revisão de 2026-10-16).
 *
 * O `inert` tira o foco do campo de código, e a venda seguinte nasce com a barra
 * já vazia — nada a trazia de volta, e o primeiro bipe caía no `body`. O jsdom
 * não aplica a correção de foco do `inert`, então o teste a faz à mão: é o
 * estado em que o navegador deixa a tela.
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

function Suspender(): ReactElement {
  const { suspender } = useFinalizacaoVenda();
  return (
    <button type="button" onClick={() => void suspender()}>
      suspender
    </button>
  );
}

function renderizar(deps: FinalizacaoDeps): void {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={cliente}>
      <ProvedorFinalizacaoVenda deps={deps}>
        <TravaDaVendaDuranteEnvio>
          <input aria-label="Código do produto" />
          <Suspender />
        </TravaDaVendaDuranteEnvio>
      </ProvedorFinalizacaoVenda>
    </QueryClientProvider>,
  );
}

/** O que o navegador faz ao aplicar `inert` sobre o elemento focado. */
function perderFocoComoNoNavegador(): void {
  (document.activeElement as HTMLElement | null)?.blur();
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

describe('TravaDaVendaDuranteEnvio (AD-280)', () => {
  it('pede o foco de volta ao campo de código quando a suspensão termina', async () => {
    vi.spyOn(notificar, 'sucesso').mockImplementation(() => {});
    const envio = envioPendente();
    renderizar(envio.deps);
    const pedidosAntes = useFocoVendaStore.getState().pedidosDeFocoNoCodigo;

    await userEvent.click(screen.getByRole('button', { name: 'suspender' }));
    expect(screen.getByLabelText('Código do produto').closest('[inert]')).not.toBeNull();
    perderFocoComoNoNavegador();

    await act(async () => {
      envio.responder({ estado: 'sucesso', notaFiscal: null });
      await Promise.resolve();
    });

    expect(screen.getByLabelText('Código do produto').closest('[inert]')).toBeNull();
    expect(useFocoVendaStore.getState().pedidosDeFocoNoCodigo).toBe(pedidosAntes + 1);
  });

  it('não pede foco quando a saída abre uma janela — o foco é dela', async () => {
    const envio = envioPendente();
    renderizar(envio.deps);
    const pedidosAntes = useFocoVendaStore.getState().pedidosDeFocoNoCodigo;

    await userEvent.click(screen.getByRole('button', { name: 'suspender' }));
    perderFocoComoNoNavegador();

    // Falha de rede abre a confirmação de reenvio.
    await act(async () => {
      envio.responder({ estado: 'falha-rede' });
      await Promise.resolve();
    });

    expect(screen.getByTestId('dialogo-confirmar-reenvio')).toBeInTheDocument();
    expect(useFocoVendaStore.getState().pedidosDeFocoNoCodigo).toBe(pedidosAntes);
  });

  it('a marca de envio do Log acompanha a espera e é desligada na resposta', async () => {
    const envio = envioPendente();
    renderizar(envio.deps);

    await userEvent.click(screen.getByRole('button', { name: 'suspender' }));
    expect(useVendaStore.getState().logEmEnvio).toBe(true);

    await act(async () => {
      envio.responder({ estado: 'falha-rede' });
      await Promise.resolve();
    });

    expect(useVendaStore.getState().logEmEnvio).toBe(false);
  });
});

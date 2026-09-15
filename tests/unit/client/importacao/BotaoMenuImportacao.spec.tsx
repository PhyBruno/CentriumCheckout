import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BotaoMenuImportacao } from '../../../../src/client/features/importacao/BotaoMenuImportacao';
import { notificar } from '../../../../src/client/lib/notificar';
import { useJanelasStore } from '../../../../src/client/stores/janelasStore';
import { useSessionStore } from '../../../../src/client/stores/sessionStore';
import { useVendaStore } from '../../../../src/client/stores/vendaStore';
import { instalarMatchMediaDeLayout } from '../../../support/layout';
import { linhaDe } from '../../../support/precificacao';
import { registroBootstrapDe } from '../../../support/sessao';

/**
 * T024 (feature 016) — o caminho por clique do "Menu Importação" continua
 * passando pelo seletor depois de a janela ter subido para o `janelasStore`.
 *
 * O atalho (F1/F2) pula o seletor; o clique não. Os dois terminam no mesmo
 * valor do store, e é por isso que a escolha no seletor **substitui** a janela
 * em vez de abrir uma segunda por cima.
 */

function renderBotao(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }): ReactNode =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  render(createElement(Wrapper, null, createElement(BotaoMenuImportacao)));
}

/** O esqueleto do Boneyard nas janelas de importação mede a caixa; jsdom não traz `ResizeObserver`. */
class ResizeObserverStub implements ResizeObserver {
  observe(): void {
    /* sem medição */
  }
  unobserve(): void {
    /* nada a fazer */
  }
  disconnect(): void {
    /* nada a fazer */
  }
}

beforeAll(() => {
  window.ResizeObserver = ResizeObserverStub;
  // As janelas de importação consultam `matchMedia` (tema e layout do toast).
  instalarMatchMediaDeLayout();
});

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>(() => {
          /* a lista de documentos não é o assunto destes testes */
        }),
    ),
  );
  useSessionStore.setState({ estado: 'pronto', registro: registroBootstrapDe() });
  useVendaStore.setState({ linhas: [], clienteAtual: null, houveEscolhaExplicita: false });
  useVendaStore.getState().resetarAuditoria('NOVA');
});

describe('BotaoMenuImportacao — caminho por clique (T024)', () => {
  it('o clique abre o seletor, não a janela de DAV direto', async () => {
    const usuario = userEvent.setup();
    renderBotao();

    await usuario.click(screen.getByTestId('botao-menu-importacao'));

    expect(await screen.findByTestId('modal-menu-importacao')).toBeInTheDocument();
    expect(useJanelasStore.getState().janela).toBe('seletor-importacao');
    expect(screen.queryByTestId('modal-importacao-dav')).toBeNull();
  });

  it.each([
    ['opcao-importar-dav', 'dav', 'modal-importacao-dav'],
    ['opcao-importar-nfce', 'nfce', 'modal-recuperacao-nfce'],
  ] as const)(
    'escolher %s substitui o seletor pela janela escolhida',
    async (opcao, janela, modal) => {
      const usuario = userEvent.setup();
      renderBotao();

      await usuario.click(screen.getByTestId('botao-menu-importacao'));
      await usuario.click(await screen.findByTestId(opcao));

      expect(useJanelasStore.getState().janela).toBe(janela);
      expect(await screen.findByTestId(modal)).toBeInTheDocument();
    },
  );

  it('com item lançado, o clique recusa com o motivo e nada abre', async () => {
    const usuario = userEvent.setup();
    const erro = vi.spyOn(notificar, 'erro');
    useVendaStore.setState({ linhas: [linhaDe({ idLinha: 'l1' })] });
    renderBotao();

    await usuario.click(screen.getByTestId('botao-menu-importacao'));

    expect(erro).toHaveBeenCalledOnce();
    expect(useJanelasStore.getState().janela).toBe('nenhuma');
  });
});

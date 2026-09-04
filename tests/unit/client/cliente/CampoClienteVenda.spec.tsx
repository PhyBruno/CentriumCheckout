import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CampoClienteVenda } from '../../../../src/client/features/cliente/CampoClienteVenda';
import { useFocoVendaStore } from '../../../../src/client/stores/focoVendaStore';
import { useSessionStore } from '../../../../src/client/stores/sessionStore';
import { useVendaStore } from '../../../../src/client/stores/vendaStore';

/**
 * Pedido do usuário (2026-09-04): Shift+TAB no campo de código de produto volta
 * para a identificação do cliente, e não para o botão "Recolhido" do cabeçalho.
 * O gesto chega aqui pelo `focoVendaStore` (os dois cards são irmãos em
 * `TelaDeVenda`, sem relação de pai/filho); este spec cobre a metade que é
 * deste componente — expandir o card e focar o campo.
 */

function registroDeBootstrap() {
  return {
    tenant: 'acme',
    codigoEmpresa: '1',
    _versionHash: 'hash-teste',
    SessaoUsuario: {
      TipoPreco: 1,
      CadMaqCod: 'PDV01',
      ListaPrecoDefault: 3,
      CenarioPagamento: '[]',
      QtdMinCharParaConsulta: 3,
      UsuarioTipoCodigoProduto: 'I',
      ClienteDefaultCodigo: 1,
      CadSerieNFCe: '1',
      CadMaqHost: '127.0.0.1:4545',
      TipoImpressao: 'E' as const,
    },
  };
}

function renderCard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }): ReactNode =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return render(createElement(Wrapper, null, createElement(CampoClienteVenda)));
}

describe('CampoClienteVenda — foco pedido de fora (pedido do usuário, 2026-09-04)', () => {
  beforeEach(() => {
    useSessionStore.setState({ estado: 'pronto', registro: registroDeBootstrap() });
    useVendaStore.setState({ linhas: [] });
    useVendaStore.getState().resetarAuditoria('NOVA');
    useFocoVendaStore.setState({ pedidosDeFocoNoDocumento: 0 });
  });

  it('expande o card recolhido e foca o campo de código/CPF do cliente', async () => {
    renderCard();

    // Nasce recolhido (pedido do usuário, 2026-09-03): o campo existe no DOM,
    // mas está `inert` — não é alcançável por TAB nem por `focus()`.
    expect(screen.getByTestId('alternar-cliente-expandido')).toHaveAttribute(
      'aria-expanded',
      'false',
    );

    act(() => {
      useFocoVendaStore.getState().focarDocumentoCliente();
    });

    await waitFor(() => {
      expect(screen.getByTestId('campo-documento-cliente')).toHaveFocus();
    });
    expect(screen.getByTestId('alternar-cliente-expandido')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByTestId('campos-cliente-venda')).not.toHaveAttribute('inert');
  });

  it('um segundo pedido volta a focar o campo — o contador não fica preso no primeiro', async () => {
    renderCard();

    act(() => {
      useFocoVendaStore.getState().focarDocumentoCliente();
    });
    await waitFor(() => {
      expect(screen.getByTestId('campo-documento-cliente')).toHaveFocus();
    });

    act(() => {
      screen.getByTestId('abrir-busca-cliente').focus();
    });
    expect(screen.getByTestId('campo-documento-cliente')).not.toHaveFocus();

    act(() => {
      useFocoVendaStore.getState().focarDocumentoCliente();
    });
    await waitFor(() => {
      expect(screen.getByTestId('campo-documento-cliente')).toHaveFocus();
    });
  });
});

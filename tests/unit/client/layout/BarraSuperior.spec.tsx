import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BarraSuperior } from '../../../../src/client/layout/BarraSuperior';
import { useSessionStore } from '../../../../src/client/stores/sessionStore';
import { registroBootstrapDe } from '../../../support/sessao';

/**
 * Barra superior (nó `cm8HS` do Pencil): tudo o que ela mostra vem de
 * `SessaoUsuario`, e o indicador de conexão segue os eventos do navegador.
 */

function montarSessao(sobrescritas: Record<string, unknown> = {}): void {
  // Em `act` porque o store alimenta um componente que pode já estar montado —
  // sem isso o React avisa a cada troca de sessão feita no meio do teste.
  act(() => {
    useSessionStore.setState({
      estado: 'pronto',
      registro: registroBootstrapDe(sobrescritas),
    });
  });
}

/** Força `navigator.onLine`, que o jsdom expõe como getter do protótipo. */
function definirConexao(online: boolean): void {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online);
}

describe('BarraSuperior', () => {
  beforeEach(() => {
    definirConexao(true);
    montarSessao();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    act(() => {
      useSessionStore.setState({ estado: 'carregando', registro: null });
    });
  });

  it('mostra produto, empresa, caixa, PDV e operador vindos do GetSessao', () => {
    render(<BarraSuperior />);

    expect(
      screen.getByRole('heading', { name: 'Centrium Checkout - Organizações Tabajara' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Caixa 03 • PDV 01')).toBeInTheDocument();
    expect(screen.getByTestId('operador-da-sessao')).toHaveTextContent('Bruno');
  });

  it('omite o operador quando o ERP não manda UsuarioNome', () => {
    montarSessao({ UsuarioNome: undefined });
    render(<BarraSuperior />);

    expect(screen.queryByTestId('operador-da-sessao')).not.toBeInTheDocument();
    // A barra continua de pé: nenhum rótulo ausente vira placeholder.
    expect(screen.getByTestId('barra-superior')).toBeInTheDocument();
  });

  it('mostra "Online" e troca para "Offline" quando o navegador perde a rede', () => {
    render(<BarraSuperior />);
    expect(screen.getByTestId('status-conexao')).toHaveTextContent('Online');

    definirConexao(false);
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(screen.getByTestId('status-conexao')).toHaveTextContent('Offline');
  });

  it('renderiza os dois botões do desenho, ainda sem ação', () => {
    render(<BarraSuperior />);

    expect(screen.getByRole('button', { name: /display do cliente/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /menu gerencial/i })).toBeDisabled();
  });
});

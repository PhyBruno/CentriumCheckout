import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BarraSuperior } from '../../../../src/client/layout/BarraSuperior';
import { useSessionStore } from '../../../../src/client/stores/sessionStore';
import { useStatusSistemaStore } from '../../../../src/client/stores/statusSistemaStore';
import { registroBootstrapDe } from '../../../support/sessao';

/**
 * Barra superior (nó `cm8HS` do Pencil): a identidade vem de `SessaoUsuario` e
 * o indicador de operação vem do último `GetStatusSistema` lido pelo polling.
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

function registrarStatus(valor: number | null): void {
  act(() => {
    useStatusSistemaStore.setState({ ultimoStatus: valor });
  });
}

describe('BarraSuperior', () => {
  beforeEach(() => {
    registrarStatus(0);
    montarSessao();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    act(() => {
      useSessionStore.setState({ estado: 'carregando', registro: null });
      useStatusSistemaStore.setState({ ultimoStatus: null });
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

  it('mostra "Online" com status 0 e "Contingência" quando o ERP passa a responder 1', () => {
    render(<BarraSuperior />);
    expect(screen.getByTestId('status-operacao-nfce')).toHaveTextContent('Online');

    registrarStatus(1);

    expect(screen.getByTestId('status-operacao-nfce')).toHaveTextContent('Contingência');
  });

  it('não afirma "Online" antes da primeira leitura do polling', () => {
    registrarStatus(null);
    render(<BarraSuperior />);

    expect(screen.getByTestId('status-operacao-nfce')).toHaveTextContent('Verificando');
  });

  it('renderiza os dois botões do desenho, ainda sem ação', () => {
    render(<BarraSuperior />);

    expect(screen.getByRole('button', { name: /display do cliente/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /menu gerencial/i })).toBeDisabled();
  });
});

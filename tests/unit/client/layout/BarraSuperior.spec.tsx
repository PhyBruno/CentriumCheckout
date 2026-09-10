import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BarraSuperior } from '../../../../src/client/layout/BarraSuperior';
import { NOME_JANELA_DISPLAY, ROTA_DISPLAY } from '../../../../src/shared/display';
import { useSessionStore } from '../../../../src/client/stores/sessionStore';
import { registroBootstrapDe } from '../../../support/sessao';

/**
 * Barra superior (nó `cm8HS` do Pencil): tudo o que ela mostra vem de
 * `SessaoUsuario`. A pílula "Online" do desenho não é implementada — ver o
 * TSDoc do componente.
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

describe('BarraSuperior', () => {
  beforeEach(() => {
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

  it('não exibe indicador de status — o valor de GetStatusSistema não é do operador', () => {
    render(<BarraSuperior />);

    expect(screen.queryByText(/online|contingência/i)).not.toBeInTheDocument();
  });

  it('a engrenagem continua inerte — ela é a que não tem destino', () => {
    render(<BarraSuperior />);

    expect(screen.getByRole('button', { name: /configurações/i })).toBeDisabled();
  });

  /**
   * Feature 015 (T026, FR-027/FR-028). O botão do monitor deixou de ser inerte:
   * o display do cliente existe, e o item 28 de `PENDENCIES.md` fechou.
   */
  describe('botão do display do cliente', () => {
    it('não está mais desabilitado e o rótulo não fala em indisponibilidade', () => {
      render(<BarraSuperior />);

      const botao = screen.getByRole('button', { name: /display do cliente/i });
      expect(botao).not.toBeDisabled();
      expect(botao).not.toHaveAttribute('aria-disabled', 'true');
      expect(botao.getAttribute('aria-label') ?? '').not.toMatch(/ainda não disponível/i);
    });

    it('abre a rota do display numa janela **nomeada** e sem noopener', async () => {
      const usuario = userEvent.setup();
      const abrir = vi.fn<typeof window.open>(() => null);
      vi.stubGlobal('open', abrir);

      render(<BarraSuperior />);
      await usuario.click(screen.getByRole('button', { name: /display do cliente/i }));

      expect(abrir).toHaveBeenCalledTimes(1);
      const [url, nome, features] = abrir.mock.calls[0] ?? [];
      expect(url).toBe(ROTA_DISPLAY);
      // O **nome** é o que faz o segundo clique reaproveitar a tela (FR-028).
      expect(nome).toBe(NOME_JANELA_DISPLAY);
      // `noopener` faria o navegador ignorar o nome e abrir uma aba nova a cada
      // clique — três cliques, três displays (research D3). Desvio consciente de
      // `BotaoMenuGerencial.tsx:40`, que continua certo lá: aquele destino é
      // outra origem.
      expect(features ?? '').not.toMatch(/noopener/);
    });

    it('cliques repetidos usam sempre o mesmo nome de janela', async () => {
      const usuario = userEvent.setup();
      const abrir = vi.fn<typeof window.open>(() => null);
      vi.stubGlobal('open', abrir);

      render(<BarraSuperior />);
      const botao = screen.getByRole('button', { name: /display do cliente/i });
      await usuario.click(botao);
      await usuario.click(botao);
      await usuario.click(botao);

      expect(abrir.mock.calls.map((chamada) => chamada[1])).toEqual([
        NOME_JANELA_DISPLAY,
        NOME_JANELA_DISPLAY,
        NOME_JANELA_DISPLAY,
      ]);
    });
  });

  it('a engrenagem não promete o Menu gerencial, que vive no atalho da faixa (AD-203)', () => {
    render(<BarraSuperior />);

    expect(screen.queryByRole('button', { name: /menu gerencial/i })).not.toBeInTheDocument();
  });
});

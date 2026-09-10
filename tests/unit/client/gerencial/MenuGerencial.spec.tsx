import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BotaoMenuGerencial } from '../../../../src/client/features/gerencial/BotaoMenuGerencial';
import { urlDaTelaGerencial } from '../../../../src/shared/gerencial';

/**
 * Atalho e seletor do Menu gerencial (frame `viV0S` do Pencil).
 *
 * As duas opções saem do Checkout para telas legadas do ERP. O que estes
 * testes fixam é que a saída é **em nova aba** — a venda em andamento não vive
 * um `F5` (Zustand sem `persist`), então navegar na mesma aba mataria o
 * carrinho — e que cada opção tem o seu próprio destino, não um destino só
 * compartilhado como AD-020/AD-026 registravam.
 */

function espionarOpen() {
  const open = vi.fn<typeof window.open>(() => null);
  vi.stubGlobal('open', open);
  return open;
}

async function abrirMenu() {
  const usuario = userEvent.setup();
  render(<BotaoMenuGerencial />);
  await usuario.click(screen.getByTestId('botao-menu-gerencial'));
  return usuario;
}

describe('BotaoMenuGerencial', () => {
  it('abre o seletor com as duas opções do desenho', async () => {
    await abrirMenu();

    expect(screen.getByTestId('modal-menu-gerencial')).toBeInTheDocument();
    expect(screen.getByText('Central de movimentação não fiscal')).toBeInTheDocument();
    expect(screen.getByText('Relatório de resumo de caixa')).toBeInTheDocument();
  });

  it('nunca fica bloqueado — ao contrário do Menu Importação', async () => {
    // Abrir uma tela de retaguarda em outra aba não toca no carrinho, então não
    // há motivo para a recusa que `BotaoMenuImportacao` aplica (AD-138).
    render(<BotaoMenuGerencial />);

    expect(screen.getByTestId('botao-menu-gerencial')).not.toHaveAttribute('aria-disabled', 'true');
  });
});

describe('escolha de uma opção', () => {
  it('abre a central de movimentação não fiscal em nova aba', async () => {
    const open = espionarOpen();
    const usuario = await abrirMenu();

    await usuario.click(screen.getByTestId('opcao-movimento-nao-fiscal'));

    expect(open).toHaveBeenCalledWith(
      urlDaTelaGerencial('movimento-nao-fiscal'),
      '_blank',
      'noopener',
    );
  });

  it('abre o resumo de caixa na sua própria tela, não na da movimentação', async () => {
    const open = espionarOpen();
    const usuario = await abrirMenu();

    await usuario.click(screen.getByTestId('opcao-resumo-caixa'));

    expect(open).toHaveBeenCalledWith(urlDaTelaGerencial('resumo-caixa'), '_blank', 'noopener');
    expect(urlDaTelaGerencial('resumo-caixa')).not.toBe(urlDaTelaGerencial('movimento-nao-fiscal'));
  });

  it('fecha o seletor depois de escolher', async () => {
    espionarOpen();
    const usuario = await abrirMenu();

    await usuario.click(screen.getByTestId('opcao-resumo-caixa'));

    await waitFor(() => {
      expect(screen.queryByTestId('modal-menu-gerencial')).not.toBeInTheDocument();
    });
  });
});

describe('fechamento sem escolher', () => {
  it('fecha no ESC', async () => {
    const usuario = await abrirMenu();

    await usuario.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByTestId('modal-menu-gerencial')).not.toBeInTheDocument();
    });
  });

  it('fecha no botão de fechar do cabeçalho', async () => {
    const usuario = await abrirMenu();

    await usuario.click(screen.getByRole('button', { name: 'Fechar' }));

    await waitFor(() => {
      expect(screen.queryByTestId('modal-menu-gerencial')).not.toBeInTheDocument();
    });
  });
});

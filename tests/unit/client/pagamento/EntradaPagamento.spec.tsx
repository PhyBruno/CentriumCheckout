import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { EntradaPagamento } from '../../../../src/client/features/pagamento/EntradaPagamento';
import { useVendaStore } from '../../../../src/client/stores/vendaStore';
import { formaDe } from '../../../support/pagamento';
import { linhaDe } from '../../../support/precificacao';

/**
 * "Não pode colocar o valor recebido antes de informar a forma de pagamento"
 * (pedido do usuário, 2026-09-04) — revoga a decisão anterior, que travava o
 * campo só por venda sem valor e deixava a digitação livre sem forma
 * escolhida (ver o TSDoc de `bloqueioDoCampo` em `EntradaPagamento.tsx`).
 */
describe('EntradaPagamento — campo trava sem forma escolhida (pedido do usuário, 2026-09-04)', () => {
  beforeEach(() => {
    // Uma linha com valor, para `totalLiquido` não travar o campo por outro
    // motivo (venda sem valor) e o teste isolar exatamente a regra da forma.
    useVendaStore.setState({
      linhas: [linhaDe({ precoUnitario: 10_000, quantidadeEmUnidades: 1 })],
      condicaoSelecionada: null,
      pagamentos: [],
      descontoCapa: null,
    });
    useVendaStore.getState().resetarAuditoria('NOVA');
  });

  it('sem forma escolhida, o campo fica bloqueado e ignora a digitação', async () => {
    const usuario = userEvent.setup();
    render(createElement(EntradaPagamento, { forma: null }));

    const campo = screen.getByTestId('campo-valor-recebido');
    expect(campo).toHaveAttribute('aria-disabled', 'true');
    expect(campo).toHaveAttribute(
      'title',
      'Escolha a forma de pagamento antes de informar o valor recebido.',
    );

    await usuario.click(campo);
    await usuario.keyboard('10,00');

    expect(campo).toHaveValue('');
  });

  it('com forma escolhida, o campo aceita a digitação normalmente', async () => {
    const usuario = userEvent.setup();
    render(createElement(EntradaPagamento, { forma: formaDe({ meioPagtoNFe: 'Dinheiro' }) }));

    const campo = screen.getByTestId('campo-valor-recebido');
    expect(campo).not.toHaveAttribute('aria-disabled', 'true');

    await usuario.click(campo);
    await usuario.keyboard('10,00');

    expect(campo).toHaveValue('10,00');
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { EntradaPagamento } from '../../../../src/client/features/pagamento/EntradaPagamento';
import { useFocoVendaStore } from '../../../../src/client/stores/focoVendaStore';
import { useVendaStore } from '../../../../src/client/stores/vendaStore';
import { MEIO_PAGTO } from '../../../../src/client/domain/pagamento/formaPagamento';
import { formaDe, pagamentoDe } from '../../../support/pagamento';
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

  /**
   * Pedido do usuário (2026-09-16): coberta a venda, o foco vai para
   * "Finalizar venda", e o Enter dali fecha. Faltando valor, o foco volta ao
   * campo — o gesto seguinte é informar o próximo pagamento.
   *
   * O pedido de foco viaja pelo `focoVendaStore` (mesmo mecanismo do foco pós
   * identificação de cliente, AD-174); quem o consome é `BotaoFinalizarVenda`,
   * que não está montado aqui.
   */
  describe('foco depois de aplicar o pagamento', () => {
    const DINHEIRO = formaDe({ meioPagtoNFe: MEIO_PAGTO.Dinheiro });

    it('venda coberta pede o foco no botão de finalizar', async () => {
      // A venda já está quitada: seja qual for o desfecho da tentativa, o saldo
      // lido depois dela é zero — é o estado que decide o foco.
      useVendaStore.setState({ pagamentos: [pagamentoDe({ valorAplicado: 10_000 })] });
      const antes = useFocoVendaStore.getState().pedidosDeFocoNaFinalizacao;
      const usuario = userEvent.setup();
      render(createElement(EntradaPagamento, { forma: DINHEIRO }));

      await usuario.click(screen.getByTestId('campo-valor-recebido'));
      await usuario.keyboard('10,00{Enter}');

      await waitFor(() => {
        expect(useFocoVendaStore.getState().pedidosDeFocoNaFinalizacao).toBe(antes + 1);
      });
    });

    it('com valor ainda faltando, o foco volta para o campo', async () => {
      const antes = useFocoVendaStore.getState().pedidosDeFocoNaFinalizacao;
      const usuario = userEvent.setup();
      render(createElement(EntradaPagamento, { forma: DINHEIRO }));

      const campo = screen.getByTestId('campo-valor-recebido');
      await usuario.click(campo);
      await usuario.keyboard('10,00{Enter}');

      await waitFor(() => {
        expect(campo).toHaveFocus();
      });
      expect(useFocoVendaStore.getState().pedidosDeFocoNaFinalizacao).toBe(antes);
    });
  });

  it('com forma escolhida, o campo aceita a digitação normalmente', async () => {
    const usuario = userEvent.setup();
    render(
      createElement(EntradaPagamento, { forma: formaDe({ meioPagtoNFe: MEIO_PAGTO.Dinheiro }) }),
    );

    const campo = screen.getByTestId('campo-valor-recebido');
    expect(campo).not.toHaveAttribute('aria-disabled', 'true');

    await usuario.click(campo);
    await usuario.keyboard('10,00');

    expect(campo).toHaveValue('10,00');
  });
});

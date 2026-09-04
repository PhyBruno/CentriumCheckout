import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { ControleDescontoCapa } from '../../../../src/client/features/pagamento/ControleDescontoCapa';
import { useVendaStore } from '../../../../src/client/stores/vendaStore';
import { linhaDe } from '../../../support/precificacao';

/**
 * Campo de desconto de capa — as duas correções do usuário de 2026-09-04.
 *
 * O componente já era coberto de lado pelo E2E do fluxo dourado; estes testes
 * existem porque as duas regras aqui são invisíveis lá: o E2E só exercita um
 * percentual **aceito**, e é justamente no caminho recusado que o equivalente
 * financeiro parava de acompanhar o campo.
 */
describe('ControleDescontoCapa — percentual e equivalente financeiro', () => {
  beforeEach(() => {
    // Uma linha de 100,00: subtotal redondo, para o equivalente de N% ser N,00.
    useVendaStore.setState({
      linhas: [linhaDe({ precoUnitario: 10_000, quantidadeEmUnidades: 1 })],
      condicaoSelecionada: null,
      pagamentos: [],
      descontoCapa: null,
    });
    useVendaStore.getState().resetarAuditoria('NOVA');
  });

  function equivalente(): string {
    return screen.getByTestId('equivalente-financeiro-desconto-capa').textContent ?? '';
  }

  it('enquanto 100% está no campo, o equivalente acompanha o que foi digitado', async () => {
    // O sintoma relatado: a linha "= R$ …" ficava parada no valor anterior,
    // porque lia o desconto **aplicado** — e um desconto recusado nunca chega
    // ao store. O operador via o número velho ao lado do aviso de recusa.
    const usuario = userEvent.setup();
    render(createElement(ControleDescontoCapa));

    await usuario.click(screen.getByTestId('campo-valor-ajuste'));
    await usuario.keyboard('100');

    expect(equivalente()).toContain('100,00');
  });

  it('ao sair do campo, o 100% recusado é descartado — texto e equivalente vão junto', async () => {
    // A outra metade da mesma regra (correção do usuário, 2026-09-04): o número
    // acompanha o campo enquanto está nele, e **some** quando a regra o recusa.
    // Deixá-lo em tela depois da recusa foi o que produziu o desconto fantasma
    // — texto preenchido, equivalente calculado e total a pagar sem desconto.
    const usuario = userEvent.setup();
    render(createElement(ControleDescontoCapa));

    await usuario.click(screen.getByTestId('campo-valor-ajuste'));
    await usuario.keyboard('100');
    await usuario.tab();

    expect(useVendaStore.getState().descontoCapa).toBeNull();
    expect(screen.getByTestId('campo-valor-ajuste')).toHaveValue('');
    expect(equivalente()).toContain('0,00');
  });

  it('carrinho vazio bloqueia o campo em vez de aceitar um desconto que será recusado', async () => {
    const usuario = userEvent.setup();
    useVendaStore.setState({ linhas: [] });
    render(createElement(ControleDescontoCapa));

    const campo = screen.getByTestId('campo-valor-ajuste');
    expect(campo).toHaveAttribute('aria-disabled', 'true');
    expect(campo).toHaveAttribute(
      'title',
      'Insira ao menos um produto na venda antes de aplicar desconto.',
    );

    await usuario.click(campo);
    await usuario.keyboard('10');

    expect(campo).toHaveValue('');
    expect(useVendaStore.getState().descontoCapa).toBeNull();
  });

  it('uma casa decimal é aceita e aplicada', async () => {
    const usuario = userEvent.setup();
    render(createElement(ControleDescontoCapa));

    await usuario.click(screen.getByTestId('campo-valor-ajuste'));
    await usuario.keyboard('99,9');
    await usuario.tab();

    expect(equivalente()).toContain('99,90');
    expect(useVendaStore.getState().descontoCapa).toEqual({
      modo: 'PERCENTUAL',
      entrada: 99.9,
      valorResolvido: 9_990,
    });
  });

  it('duas casas decimais são recusadas: o formato do produto é 99,9', async () => {
    const usuario = userEvent.setup();
    render(createElement(ControleDescontoCapa));

    await usuario.click(screen.getByTestId('campo-valor-ajuste'));
    await usuario.keyboard('10,25');
    await usuario.tab();

    expect(useVendaStore.getState().descontoCapa).toBeNull();
    // Texto ilegível como percentual cai no valor efetivamente aplicado, que
    // aqui é nenhum — não num equivalente inventado a partir de entrada
    // inválida.
    expect(equivalente()).toContain('0,00');
  });
});

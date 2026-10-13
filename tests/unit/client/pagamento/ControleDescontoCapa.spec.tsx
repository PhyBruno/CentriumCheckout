import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { ControleDescontoCapa } from '../../../../src/client/features/pagamento/ControleDescontoCapa';
import { centavos } from '../../../../src/client/domain/precificacao/dinheiro';
import { AVISO_DESCONTO_COM_PAGAMENTO } from '../../../../src/client/stores/slices/pagamentoSlice';
import { useVendaStore } from '../../../../src/client/stores/vendaStore';
import { pagamentoDe } from '../../../support/pagamento';
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

  /**
   * O controle abre em `R$` desde 2026-09-05 (pedido do usuário): todo cenário
   * de **percentual** precisa trocar o modo antes, como o operador faz. A linha
   * "= R$ …" só existe no modo percentual, então sem isto ela nem é renderizada.
   */
  async function irParaPercentual(usuario: ReturnType<typeof userEvent.setup>): Promise<void> {
    await usuario.click(screen.getByTestId('toggle-ajuste-percentual'));
  }

  it('abre em R$, não em % — é o desconto que o caixa negocia no balcão', () => {
    render(createElement(ControleDescontoCapa));

    expect(screen.getByTestId('toggle-ajuste-valor')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('toggle-ajuste-percentual')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('campo-valor-ajuste')).toHaveAttribute(
      'aria-label',
      'Desconto em reais',
    );
    // A linha do equivalente financeiro é exclusiva do modo percentual.
    expect(screen.queryByTestId('equivalente-financeiro-desconto-capa')).toBeNull();
  });

  it('um desconto já aplicado manda no modo de abertura, não o padrão', () => {
    useVendaStore.setState({
      descontoCapa: { modo: 'PERCENTUAL', entrada: 10, valorResolvido: centavos(1_000) },
    });
    render(createElement(ControleDescontoCapa));

    expect(screen.getByTestId('toggle-ajuste-percentual')).toHaveAttribute('aria-pressed', 'true');
  });

  it('enquanto 100% está no campo, o equivalente acompanha o que foi digitado', async () => {
    // O sintoma relatado: a linha "= R$ …" ficava parada no valor anterior,
    // porque lia o desconto **aplicado** — e um desconto recusado nunca chega
    // ao store. O operador via o número velho ao lado do aviso de recusa.
    const usuario = userEvent.setup();
    render(createElement(ControleDescontoCapa));
    await irParaPercentual(usuario);

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
    await irParaPercentual(usuario);

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
    await irParaPercentual(usuario);

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
    await irParaPercentual(usuario);

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

/**
 * Estado do desconto (correção do usuário, 2026-10-13): o total a pagar
 * acompanha o campo **enquanto se digita**, e o campo nunca descreve um desconto
 * diferente do que vale na venda.
 *
 * O defeito relatado: apagar o desconto deixava o campo vazio e o total ainda
 * descontado até o campo perder o foco — e, com uma forma inserida nesse meio
 * tempo, a remoção era recusada e o campo vazio ficava para sempre ao lado de um
 * total com desconto.
 */
describe('ControleDescontoCapa — total dinâmico e congelamento com pagamento', () => {
  beforeEach(() => {
    useVendaStore.setState({
      linhas: [linhaDe({ precoUnitario: 10_000, quantidadeEmUnidades: 1 })],
      condicaoSelecionada: null,
      pagamentos: [],
      descontoCapa: null,
    });
    useVendaStore.getState().resetarAuditoria('NOVA');
  });

  function totalAPagar(): number {
    return useVendaStore.getState().saldo().totalLiquido;
  }

  it('o total a pagar muda a cada tecla, sem precisar sair do campo', async () => {
    const usuario = userEvent.setup();
    render(createElement(ControleDescontoCapa));

    await usuario.click(screen.getByTestId('campo-valor-ajuste'));
    await usuario.keyboard('10');

    expect(totalAPagar()).toBe(9_000);
    expect(useVendaStore.getState().descontoCapa).toEqual({
      modo: 'VALOR',
      entrada: 1_000,
      valorResolvido: 1_000,
    });
  });

  it('apagar o desconto devolve o total na hora, ainda com o foco no campo', async () => {
    const usuario = userEvent.setup();
    render(createElement(ControleDescontoCapa));
    const campo = screen.getByTestId('campo-valor-ajuste');

    await usuario.click(campo);
    await usuario.keyboard('10');
    await usuario.tab();
    expect(totalAPagar()).toBe(9_000);

    await usuario.click(campo);
    await usuario.clear(campo);

    expect(campo).toHaveFocus();
    expect(useVendaStore.getState().descontoCapa).toBeNull();
    expect(totalAPagar()).toBe(10_000);
  });

  it('a remoção feita pelo próprio campo não apaga o que o operador está digitando', async () => {
    // "0,5" passa por "0" no caminho, e "0" remove o desconto: o campo não pode
    // confundir essa remoção com uma vinda de fora e se esvaziar no meio da
    // digitação.
    const usuario = userEvent.setup();
    render(createElement(ControleDescontoCapa));
    const campo = screen.getByTestId('campo-valor-ajuste');

    await usuario.click(campo);
    await usuario.keyboard('0,5');

    expect(campo).toHaveValue('0,5');
    expect(totalAPagar()).toBe(9_950);
  });

  it('valor recusado enquanto se digita não fica valendo, e some ao sair do campo', async () => {
    const usuario = userEvent.setup();
    render(createElement(ControleDescontoCapa));
    const campo = screen.getByTestId('campo-valor-ajuste');

    await usuario.click(campo);
    await usuario.keyboard('200');

    // O texto fica — o operador ainda pode corrigir —, mas a venda não carrega
    // um desconto que a regra recusa: o total é o cheio.
    expect(campo).toHaveValue('200');
    expect(useVendaStore.getState().descontoCapa).toBeNull();
    expect(totalAPagar()).toBe(10_000);

    await usuario.tab();
    expect(campo).toHaveValue('');
  });

  it('remoção vinda de fora esvazia o campo', () => {
    useVendaStore.setState({
      descontoCapa: { modo: 'VALOR', entrada: 1_000, valorResolvido: centavos(1_000) },
    });
    render(createElement(ControleDescontoCapa));
    expect(screen.getByTestId('campo-valor-ajuste')).toHaveValue('10,00');

    act(() => {
      useVendaStore.setState({ descontoCapa: null });
    });

    expect(screen.getByTestId('campo-valor-ajuste')).toHaveValue('');
  });

  it('com forma de pagamento inserida, campo e unidade ficam bloqueados', async () => {
    const usuario = userEvent.setup();
    useVendaStore.setState({
      descontoCapa: { modo: 'VALOR', entrada: 1_000, valorResolvido: centavos(1_000) },
      pagamentos: [pagamentoDe({ valorAplicado: 9_000 })],
    });
    render(createElement(ControleDescontoCapa));
    const campo = screen.getByTestId('campo-valor-ajuste');

    expect(campo).toHaveAttribute('aria-disabled', 'true');
    expect(campo).toHaveAttribute('title', AVISO_DESCONTO_COM_PAGAMENTO);
    expect(screen.getByTestId('toggle-ajuste-percentual')).toHaveAttribute(
      'aria-disabled',
      'true',
    );

    await usuario.click(campo);
    await usuario.keyboard('{Backspace}{Backspace}5');
    await usuario.click(screen.getByTestId('toggle-ajuste-percentual'));

    expect(campo).toHaveValue('10,00');
    expect(screen.getByTestId('toggle-ajuste-valor')).toHaveAttribute('aria-pressed', 'true');
    expect(useVendaStore.getState().descontoCapa).toEqual({
      modo: 'VALOR',
      entrada: 1_000,
      valorResolvido: 1_000,
    });
  });

  it('forma excluída (riscada) não congela o desconto', () => {
    useVendaStore.setState({
      pagamentos: [pagamentoDe({ valorAplicado: 9_000, status: 'EXCLUIDO' })],
    });
    render(createElement(ControleDescontoCapa));

    expect(screen.getByTestId('campo-valor-ajuste')).not.toHaveAttribute('aria-disabled');
  });
});

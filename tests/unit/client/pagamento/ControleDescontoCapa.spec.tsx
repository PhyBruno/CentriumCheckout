import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { ControleDescontoCapa } from '../../../../src/client/features/pagamento/ControleDescontoCapa';
import { centavos } from '../../../../src/client/domain/precificacao/dinheiro';
import { notificar } from '../../../../src/client/lib/notificar';
import {
  AVISO_CONDICAO_SEM_DESCONTO,
  AVISO_DESCONTO_COM_PAGAMENTO,
  avisoTetoDaCondicao,
} from '../../../../src/client/stores/slices/pagamentoSlice';
import { useVendaStore } from '../../../../src/client/stores/vendaStore';
import { condicaoDe, pagamentoDe } from '../../../support/pagamento';
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
      descontoCapa: {
        modo: 'PERCENTUAL',
        entrada: 10,
        valorResolvido: centavos(1_000),
        origem: 'MANUAL',
      },
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
      origem: 'MANUAL',
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
      origem: 'MANUAL',
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
      descontoCapa: {
        modo: 'VALOR',
        entrada: 1_000,
        valorResolvido: centavos(1_000),
        origem: 'MANUAL',
      },
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
      descontoCapa: {
        modo: 'VALOR',
        entrada: 1_000,
        valorResolvido: centavos(1_000),
        origem: 'MANUAL',
      },
      pagamentos: [pagamentoDe({ valorAplicado: 9_000 })],
    });
    render(createElement(ControleDescontoCapa));
    const campo = screen.getByTestId('campo-valor-ajuste');

    expect(campo).toHaveAttribute('aria-disabled', 'true');
    expect(campo).toHaveAttribute('title', AVISO_DESCONTO_COM_PAGAMENTO);
    expect(screen.getByTestId('toggle-ajuste-percentual')).toHaveAttribute('aria-disabled', 'true');

    await usuario.click(campo);
    await usuario.keyboard('{Backspace}{Backspace}5');
    await usuario.click(screen.getByTestId('toggle-ajuste-percentual'));

    expect(campo).toHaveValue('10,00');
    expect(screen.getByTestId('toggle-ajuste-valor')).toHaveAttribute('aria-pressed', 'true');
    expect(useVendaStore.getState().descontoCapa).toEqual({
      modo: 'VALOR',
      entrada: 1_000,
      valorResolvido: 1_000,
      origem: 'MANUAL',
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

/** 017, US3 (T040) — a capa preenchida pela condição e limitada pelo teto dela. */
describe('ControleDescontoCapa — teto da condição (017)', () => {
  beforeEach(() => {
    useVendaStore.setState({
      linhas: [linhaDe({ precoUnitario: 10_000, quantidadeEmUnidades: 1 })],
      condicaoSelecionada: null,
      pagamentos: [],
      descontoCapa: null,
    });
    useVendaStore.getState().resetarAuditoria('NOVA');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function escolher(desconto: number, descontoMaximo: number): void {
    act(() => {
      useVendaStore.getState().selecionarCondicao({
        ...condicaoDe(10, 'COND A'),
        desconto,
        descontoMaximo,
      });
    });
  }

  it('a condição preenche o campo e o teto aparece', () => {
    render(createElement(ControleDescontoCapa));

    escolher(5, 8);

    expect(screen.getByTestId('toggle-ajuste-percentual')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('campo-valor-ajuste')).toHaveValue('5');
    expect(screen.getByTestId('teto-desconto-capa')).toHaveTextContent('Máx. 8%');
  });

  it('teto zero bloqueia o campo com a explicação', () => {
    render(createElement(ControleDescontoCapa));

    escolher(0, 0);

    expect(screen.getByTestId('campo-valor-ajuste')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('campo-valor-ajuste')).toHaveAttribute(
      'title',
      AVISO_CONDICAO_SEM_DESCONTO,
    );
  });

  it('acima do teto, ao sair do campo o texto vira o teto e há um aviso só', async () => {
    const usuario = userEvent.setup();
    const aviso = vi.spyOn(notificar, 'aviso');
    render(createElement(ControleDescontoCapa));
    escolher(5, 8);

    await usuario.clear(screen.getByTestId('campo-valor-ajuste'));
    await usuario.type(screen.getByTestId('campo-valor-ajuste'), '10');
    // Durante a digitação o equivalente nunca passa do teto.
    expect(screen.getByTestId('equivalente-financeiro-desconto-capa')).toHaveTextContent('R$ 8,00');
    await usuario.tab();

    expect(screen.getByTestId('campo-valor-ajuste')).toHaveValue('8');
    expect(useVendaStore.getState().descontoCapa?.valorResolvido).toBe(800);
    expect(aviso).toHaveBeenCalledTimes(1);
    expect(aviso).toHaveBeenCalledWith(avisoTetoDaCondicao(8));
  });

  it('a entrada do ERP com duas casas é exibida inteira e sobrevive a sair do campo (D9)', async () => {
    const usuario = userEvent.setup();
    render(createElement(ControleDescontoCapa));
    escolher(3.25, 8);

    expect(screen.getByTestId('campo-valor-ajuste')).toHaveValue('3,25');
    await usuario.click(screen.getByTestId('campo-valor-ajuste'));
    await usuario.tab();

    expect(useVendaStore.getState().descontoCapa).toMatchObject({
      entrada: 3.25,
      origem: 'CONDICAO',
    });
  });

  /**
   * Achado no ERP real (2026-10-13): a capa digitada não chegava ao `Log`. A
   * digitação grava em silêncio a cada tecla, e a guarda "sair sem mexer não
   * reaplica" via o texto igual à capa vigente — então a chamada não silenciosa,
   * que é a que audita, nunca acontecia.
   */
  it.each([
    ['Tab', '{Tab}'],
    ['Enter', '{Enter}'],
  ])('a capa digitada é auditada ao sair do campo pelo %s (FR-025)', async (_rotulo, tecla) => {
    const usuario = userEvent.setup();
    render(createElement(ControleDescontoCapa));
    escolher(0, 10);

    await usuario.click(screen.getByTestId('toggle-ajuste-percentual'));
    await usuario.type(screen.getByTestId('campo-valor-ajuste'), '5');
    await usuario.keyboard(tecla);

    const eventosDeCapa = useVendaStore
      .getState()
      .eventos.filter((evento) => evento.tipo === 'DESCONTO_CAPA_APLICADO');
    expect(eventosDeCapa.map((evento) => evento.detalhes)).toEqual([
      { origem: 'MANUAL', modo: 'PERCENTUAL', entrada: 5, valor: 500 },
    ]);
  });

  it('a capa da condição não vira digitada nem é reauditada ao só passar pelo campo', async () => {
    const usuario = userEvent.setup();
    render(createElement(ControleDescontoCapa));
    escolher(5, 8);

    await usuario.click(screen.getByTestId('campo-valor-ajuste'));
    await usuario.tab();

    expect(useVendaStore.getState().descontoCapa?.origem).toBe('CONDICAO');
    expect(
      useVendaStore.getState().eventos.filter((evento) => evento.tipo === 'DESCONTO_CAPA_APLICADO'),
    ).toHaveLength(1);
  });

  it('só a digitação rejeita casas extras', async () => {
    const usuario = userEvent.setup();
    const aviso = vi.spyOn(notificar, 'aviso');
    render(createElement(ControleDescontoCapa));
    escolher(5, 8);

    await usuario.clear(screen.getByTestId('campo-valor-ajuste'));
    await usuario.type(screen.getByTestId('campo-valor-ajuste'), '3,25');
    await usuario.tab();

    expect(aviso).toHaveBeenCalledWith(
      'Percentual inválido: use apenas números, com até uma casa decimal.',
    );
  });
});

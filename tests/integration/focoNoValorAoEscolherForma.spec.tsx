import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfiguracaoPagamento } from '../../src/client/features/pagamento/ConfiguracaoPagamento';
import { reaisDeCentavos } from '../../src/client/domain/precificacao/dinheiro';
import { useVendaStore } from '../../src/client/stores/vendaStore';
import { linhaDe } from '../support/precificacao';

/**
 * Escolher a forma de pagamento por clique ou toque leva o foco ao campo "Valor
 * recebido", já com o valor faltante (pedido do usuário, 2026-10-07).
 *
 * Pela seta do teclado o foco fica no combobox, porque a seta percorre várias
 * formas; e o vale devolução abre o modal do ticket em vez de pedir valor.
 */

const FORMAS = [
  { codigo: 1, descricao: 'DINHEIRO', fpgUtiCar: '' },
  { codigo: 2, descricao: 'CHEQUE', fpgUtiCar: '' },
  { codigo: 9, descricao: 'VALE DEVOLUCAO', fpgUtiCar: 'VDV' },
];

function payloadBootstrap(): unknown {
  return {
    SessaoUsuario: {
      CondicoesDePagamento: [
        {
          CondicaoCodigo: 1,
          CondicaoDescricao: 'A VISTA',
          CondicaoPrazo: 0,
          CondicaoMinimoEntrada: 0,
          CondicaoDesconto: 0,
          CondicaoDescontoMaximo: 0,
          CondicaoFormasDePagamento: FORMAS.map((forma) => ({
            FormaCodigo: forma.codigo,
            FormaDescricao: forma.descricao,
            FormaEntrada: 'S',
            FormaMeioPagtoNFe: '01',
            FormaIntegracaoCartao: '',
            FormaTipoTransacaoTEF: '',
            FormaFpgUtiCar: forma.fpgUtiCar,
          })),
        },
      ],
      ConfiguracoesTEF: { TEFAtivo: false },
      ConfiguracoesPIX: { UtilizaCentriumPAG: false, MinimoPix: 0, TempoEspera: 10 },
    },
  };
}

function renderizar(): void {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={cliente}>
      <ConfiguracaoPagamento />
    </QueryClientProvider>,
  );
}

async function escolherCondicao(usuario: ReturnType<typeof userEvent.setup>): Promise<void> {
  const combobox = screen.getByTestId('combobox-condicao-pagamento');
  await waitFor(() => {
    expect(combobox).not.toHaveAttribute('aria-disabled', 'true');
  });
  await usuario.click(combobox);
  await usuario.click(screen.getByTestId('opcao-condicao-1'));
}

beforeEach(() => {
  useVendaStore.setState({
    linhas: [linhaDe({ precoUnitario: 10_000, quantidadeEmUnidades: 1 })],
    condicaoSelecionada: null,
    descontoCapa: null,
    pagamentos: [],
    acionamentoEmAndamento: false,
  });
  useVendaStore.getState().resetarAuditoria('RASCUNHO');
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(payloadBootstrap()),
        }) as unknown as Promise<Response>,
    ),
  );
});

describe('foco no valor recebido ao escolher a forma', () => {
  it('clique na forma leva o foco ao campo de valor, já com o faltante', async () => {
    const usuario = userEvent.setup();
    renderizar();
    await escolherCondicao(usuario);

    await usuario.click(screen.getByTestId('combobox-forma-pagamento'));
    await usuario.click(screen.getByTestId('opcao-forma-1'));

    const campo = screen.getByTestId('campo-valor-recebido');
    await waitFor(() => {
      expect(campo).toHaveFocus();
    });
    const faltante = useVendaStore.getState().saldo().saldoRestante;
    expect(campo).toHaveValue(reaisDeCentavos(faltante).toFixed(2).replace('.', ','));
  });

  it('escolher outra forma pelo clique pede o foco de novo', async () => {
    const usuario = userEvent.setup();
    renderizar();
    await escolherCondicao(usuario);

    await usuario.click(screen.getByTestId('combobox-forma-pagamento'));
    await usuario.click(screen.getByTestId('opcao-forma-1'));
    await waitFor(() => {
      expect(screen.getByTestId('campo-valor-recebido')).toHaveFocus();
    });

    await usuario.click(screen.getByTestId('combobox-forma-pagamento'));
    await usuario.click(screen.getByTestId('opcao-forma-2'));

    await waitFor(() => {
      expect(screen.getByTestId('campo-valor-recebido')).toHaveFocus();
    });
    expect(screen.getByTestId('combobox-forma-pagamento')).toHaveTextContent('CHEQUE');
  });

  it('seta do teclado não tira o foco do combobox', async () => {
    const usuario = userEvent.setup();
    renderizar();
    await escolherCondicao(usuario);

    const combobox = screen.getByTestId('combobox-forma-pagamento');
    combobox.focus();
    await usuario.keyboard('{ArrowDown}{ArrowDown}');

    expect(combobox).toHaveTextContent('CHEQUE');
    expect(combobox).toHaveFocus();
    expect(screen.getByTestId('campo-valor-recebido')).not.toHaveFocus();
  });

  it('vale devolução escolhido por clique não leva o foco ao campo de valor', async () => {
    const usuario = userEvent.setup();
    renderizar();
    await escolherCondicao(usuario);

    await usuario.click(screen.getByTestId('combobox-forma-pagamento'));
    await usuario.click(screen.getByTestId('opcao-forma-9'));

    expect(screen.getByTestId('campo-valor-recebido')).not.toHaveFocus();
  });
});

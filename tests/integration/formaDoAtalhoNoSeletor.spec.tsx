import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfiguracaoPagamento } from '../../src/client/features/pagamento/ConfiguracaoPagamento';
import { MEIO_PAGTO } from '../../src/client/domain/pagamento/formaPagamento';
import { useSessionStore } from '../../src/client/stores/sessionStore';
import { useVendaStore } from '../../src/client/stores/vendaStore';
import { condicaoDe, formaDe, pagamentoDe } from '../support/pagamento';
import { linhaDe } from '../support/precificacao';
import { registroBootstrapDe } from '../support/sessao';

/**
 * A forma lançada pelo atalho de cenário aparece no campo "Forma de pagamento"
 * (correção do usuário, 2026-10-07).
 *
 * O atalho fala só com o store: seleciona a condição e aplica a forma, sem
 * passar pelo combobox. A condição aparecia preenchida e o campo da forma ficava
 * em "Selecione a forma", com o pagamento já na lista.
 */

const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const credito = formaDe({
  codigo: 7,
  descricao: 'CARTAO CREDITO',
  meioPagtoNFe: MEIO_PAGTO.CartaoCredito,
});
const condicao = condicaoDe(3, 'A VISTA', [formaDe({ codigo: 1, descricao: 'DINHEIRO' }), credito]);

function renderizar(): void {
  render(
    <QueryClientProvider client={cliente}>
      <ConfiguracaoPagamento />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  cliente.clear();
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('rede desligada no teste')));
  useSessionStore.setState({ estado: 'pronto', registro: registroBootstrapDe() });
  useVendaStore.setState({
    linhas: [linhaDe({ precoUnitario: 10_000, quantidadeEmUnidades: 1 })],
    condicaoSelecionada: null,
    descontoCapa: null,
    pagamentos: [],
    acionamentoEmAndamento: false,
  });
  useVendaStore.getState().resetarAuditoria('RASCUNHO');
});

describe('forma lançada pelo atalho no seletor de forma', () => {
  it('mostra a forma aplicada pelo atalho, mesmo com a condição trocada no mesmo gesto', () => {
    renderizar();

    // Os mesmos passos de `acionarCenario`: guard, condição, forma.
    act(() => {
      useVendaStore.setState({ acionamentoEmAndamento: true });
    });
    act(() => {
      useVendaStore.setState({ condicaoSelecionada: condicao });
    });
    act(() => {
      useVendaStore.setState({
        pagamentos: [pagamentoDe({ formaCodigo: 7, meioPagtoNFe: MEIO_PAGTO.CartaoCredito })],
      });
    });

    expect(screen.getByTestId('combobox-forma-pagamento')).toHaveTextContent('CARTAO CREDITO');
    expect(screen.getByTestId('combobox-forma-pagamento')).not.toHaveTextContent(
      'Selecione a forma',
    );
  });

  it('pagamento que entra fora de um acionamento (documento importado) não mexe no campo', () => {
    useVendaStore.setState({ condicaoSelecionada: condicao });
    renderizar();

    act(() => {
      useVendaStore.setState({
        pagamentos: [
          pagamentoDe({
            formaCodigo: 7,
            meioPagtoNFe: MEIO_PAGTO.CartaoCredito,
            veioDeDocumento: true,
          }),
        ],
      });
    });

    expect(screen.getByTestId('combobox-forma-pagamento')).toHaveTextContent('Selecione a forma');
  });
});

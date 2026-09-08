import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProvedorFinalizacaoVenda } from '../../src/client/features/finalizacao-suspensao/AcoesFinaisVenda';
import { PainelPagamentoETotais } from '../../src/client/features/pagamento/PainelPagamentoETotais';
import { useSessionStore } from '../../src/client/stores/sessionStore';
import { useVendaStore } from '../../src/client/stores/vendaStore';
import { pagamentoDe } from '../support/pagamento';
import { linhaDe } from '../support/precificacao';
import { registroBootstrapDe } from '../support/sessao';

/**
 * "Limpar" sobre um pagamento que veio no documento retomado (AD-169).
 *
 * Este botão é a **saída oficial** de uma venda retomada já paga: a forma
 * aprovada congela a grid (I7), e o próprio aviso de bloqueio do carrinho manda
 * o operador para cá. Mas o valor já foi recebido e está gravado no documento
 * dentro do ERP — descartá-lo sem perguntar deixaria a NFCe sair sem o
 * pagamento do cliente, num gesto dado só para corrigir um item.
 *
 * O painel inteiro é renderizado de propósito, e não só o botão: `BotaoLimpar`
 * é interno ao componente, e o que se quer afirmar é o caminho que o operador
 * percorre na tela real.
 */

const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function renderizarPainel(): void {
  render(
    // O painel inclui `AcoesFinaisVenda`, que exige o provedor da máquina de
    // finalização (`FR-004` da 004). Nada aqui finaliza venda — o provedor
    // entra só para o componente montar como monta em `App.tsx`.
    <QueryClientProvider client={cliente}>
      <ProvedorFinalizacaoVenda>
        <PainelPagamentoETotais />
      </ProvedorFinalizacaoVenda>
    </QueryClientProvider>,
  );
}

/**
 * jsdom não implementa `matchMedia`. O painel passou a precisar dele com a
 * feature 013: a faixa de atalhos consulta a plataforma para não existir no
 * mobile (`FR-020`). `false` = desktop, que é o layout deste teste.
 */
function criarMatchMediaStub(query: string): MediaQueryList {
  const nada = (): void => {
    /* nada a fazer */
  };

  return {
    matches: false,
    media: query,
    onchange: null,
    addListener: nada,
    removeListener: nada,
    addEventListener: nada,
    removeEventListener: nada,
    dispatchEvent: () => false,
  };
}

beforeAll(() => {
  // Atribuição direta no `window`: sob o vitest o `window` do jsdom não é o
  // mesmo objeto que `globalThis`, então `vi.stubGlobal` não o alcança.
  window.matchMedia = criarMatchMediaStub;
});

beforeEach(() => {
  cliente.clear();
  // O painel lê o catálogo de condições/formas; nenhum teste daqui depende
  // dele, então basta a rede não sair do processo.
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('rede desligada no teste')));
  useSessionStore.setState({ estado: 'pronto', registro: registroBootstrapDe() });

  useVendaStore.setState({
    linhas: [linhaDe({ precoUnitario: 10_000, quantidadeEmUnidades: 1 })],
    condicaoSelecionada: null,
    descontoCapa: null,
    pagamentos: [],
  });
  useVendaStore.getState().resetarAuditoria('RASCUNHO');
});

describe('"Limpar" com pagamento vindo do documento', () => {
  function comPagamentoDoDocumento(): void {
    useVendaStore.setState({
      pagamentos: [
        pagamentoDe({ idPagamento: 'pag-doc', valorAplicado: 10_000, veioDeDocumento: true }),
      ],
    });
  }

  it('a venda retomada já paga nasce com o carrinho congelado', () => {
    comPagamentoDoDocumento();

    // A premissa da regra: é este `false` que manda o operador para o "Limpar".
    expect(useVendaStore.getState().podeMutarCarrinho()).toBe(false);
  });

  it('pede confirmação nomeando o valor já recebido, e cancelar não descarta nada', async () => {
    const usuario = userEvent.setup();
    comPagamentoDoDocumento();
    renderizarPainel();

    await usuario.click(screen.getByTestId('limpar-pagamento'));

    const dialogo = screen.getByTestId('confirmar-limpeza-documento');
    expect(dialogo).toHaveTextContent('Este valor já foi recebido');
    expect(dialogo).toHaveTextContent('a NFCe sai sem o valor que o cliente já pagou');

    await usuario.click(screen.getByTestId('confirmar-limpeza-documento-cancelar'));

    expect(screen.queryByTestId('confirmar-limpeza-documento')).toBeNull();
    expect(useVendaStore.getState().pagamentos).toHaveLength(1);
    expect(useVendaStore.getState().podeMutarCarrinho()).toBe(false);
  });

  it('confirmar descarta o pagamento e devolve o carrinho ao operador', async () => {
    const usuario = userEvent.setup();
    comPagamentoDoDocumento();
    renderizarPainel();

    await usuario.click(screen.getByTestId('limpar-pagamento'));
    await usuario.click(screen.getByTestId('confirmar-limpeza-documento-confirmar'));

    // É o desfecho que fecha `FR-008`: a partir daqui o operador reinsere itens
    // e o preço é recalculado normalmente.
    expect(useVendaStore.getState().pagamentos).toHaveLength(0);
    expect(useVendaStore.getState().podeMutarCarrinho()).toBe(true);
  });

  it('pagamento lançado pelo operador continua limpando sem diálogo nenhum', async () => {
    const usuario = userEvent.setup();
    useVendaStore.setState({
      pagamentos: [
        pagamentoDe({ idPagamento: 'pag-op', valorAplicado: 10_000, veioDeDocumento: false }),
      ],
    });
    renderizarPainel();

    await usuario.click(screen.getByTestId('limpar-pagamento'));

    expect(screen.queryByTestId('confirmar-limpeza-documento')).toBeNull();
    expect(useVendaStore.getState().pagamentos).toHaveLength(0);
  });
});

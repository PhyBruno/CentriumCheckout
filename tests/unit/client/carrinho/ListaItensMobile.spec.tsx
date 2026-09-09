import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { ListaItensMobile } from '../../../../src/client/features/carrinho/ListaItensMobile';
import { useEdicaoItemStore } from '../../../../src/client/stores/edicaoItemStore';
import { useSessionStore } from '../../../../src/client/stores/sessionStore';
import { useVendaStore } from '../../../../src/client/stores/vendaStore';
import { condicaoDe, pagamentoDe } from '../../../support/pagamento';
import { linhaDe, snapshotDe } from '../../../support/precificacao';

/**
 * Mesmo comportamento de `GridItens.spec.tsx`, no layout mobile — os dois
 * layouts compartilham `useEdicaoItemStore` e a mesma fonte de estado
 * (`useVendaStore`), então o fluxo precisa produzir o mesmo efeito nos dois.
 */

function registroDeBootstrap() {
  return {
    tenant: 'acme',
    codigoEmpresa: '1',
    _versionHash: 'hash-teste',
    SessaoUsuario: {
      TipoPreco: 1,
      CadMaqCod: 'PDV01',
      ListaPrecoDefault: 3,
      CenarioPagamento: '[]',
      QtdMinCharParaConsulta: 3,
      UsuarioTipoCodigoProduto: 'I',
      ClienteDefaultCodigo: 1,
      CadSerieNFCe: '1',
      CadMaqHost: '127.0.0.1:4545',
      TipoImpressao: 'E' as const,
    },
  };
}

describe('ListaItensMobile — lápis carrega o item na barra de entrada rápida', () => {
  beforeEach(() => {
    useSessionStore.setState({ estado: 'pronto', registro: registroDeBootstrap() });
    useVendaStore.getState().resetarAuditoria('NOVA');
    useEdicaoItemStore.setState({ linhaEmEdicao: null });
  });

  it("desabilita o lápis quando o produto não é editável (ProdutoPesavelEditavel = '')", () => {
    useVendaStore.setState({
      linhas: [linhaDe({ idLinha: 'linha-1', snapshot: snapshotDe({ pesavelEditavel: '' }) })],
    });
    render(<ListaItensMobile />);

    // `aria-disabled`, não `disabled` (AD-143): o botão precisa continuar
    // recebendo o clique para poder **explicar** o motivo.
    expect(screen.getByRole('button', { name: 'Editar item' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it("habilita o lápis para produto pesável ('S'/'B') e editável ('E')", () => {
    useVendaStore.setState({
      linhas: [linhaDe({ idLinha: 'linha-1', snapshot: snapshotDe({ pesavelEditavel: 'S' }) })],
    });
    render(<ListaItensMobile />);

    expect(screen.getByRole('button', { name: 'Editar item' })).toBeEnabled();
  });

  it('carrega a linha em useEdicaoItemStore ao clicar no lápis', async () => {
    const usuario = userEvent.setup();
    useVendaStore.setState({
      linhas: [linhaDe({ idLinha: 'linha-1', snapshot: snapshotDe({ pesavelEditavel: 'E' }) })],
    });
    render(<ListaItensMobile />);

    await usuario.click(screen.getByRole('button', { name: 'Editar item' }));

    expect(useEdicaoItemStore.getState().linhaEmEdicao?.idLinha).toBe('linha-1');
  });

  it('trava o lápis e a lixeira da linha carregada na barra, e mostra o contorno pulsante', () => {
    useVendaStore.setState({
      linhas: [linhaDe({ idLinha: 'linha-1', snapshot: snapshotDe({ pesavelEditavel: 'E' }) })],
    });
    useEdicaoItemStore.setState({
      linhaEmEdicao: linhaDe({
        idLinha: 'linha-1',
        snapshot: snapshotDe({ pesavelEditavel: 'E' }),
      }),
    });
    render(<ListaItensMobile />);

    expect(screen.getByRole('button', { name: 'Editar item' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByTestId('linha-carrinho')).toHaveClass('cc-pulso-edicao');
  });

  it('não oferece nenhuma ação para uma linha cancelada', () => {
    useVendaStore.setState({
      linhas: [
        linhaDe({
          idLinha: 'linha-1',
          snapshot: snapshotDe({ pesavelEditavel: 'E' }),
          cancelada: true,
        }),
      ],
    });
    render(<ListaItensMobile />);

    expect(screen.queryByRole('button', { name: 'Editar item' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument();
  });
});

/**
 * Pedido do usuário (2026-09-09), depois de operar o wizard: com pagamento
 * aplicado, o lápis e a lixeira precisam **nascer bloqueados e explicar** — e
 * não aceitar o clique para negar depois.
 *
 * A frase é a mesma que a action mostra (`motivoCarrinhoBloqueado`), lida pelos
 * dois layouts: é o que impede a grid do desktop e esta lista de divergirem
 * sobre quando a edição está liberada (`SC-001` da 007).
 */
describe('ListaItensMobile — bloqueio explicativo com pagamento aplicado', () => {
  beforeEach(() => {
    useSessionStore.setState({ estado: 'pronto', registro: registroDeBootstrap() });
    useEdicaoItemStore.setState({ linhaEmEdicao: null });
    useVendaStore.setState({
      linhas: [linhaDe({ idLinha: 'linha-1', snapshot: snapshotDe({ pesavelEditavel: 'E' }) })],
      condicaoSelecionada: null,
      descontoCapa: null,
      pagamentos: [],
    });
    useVendaStore.getState().resetarAuditoria('NOVA');
  });

  function comPagamentoAplicado(): void {
    useVendaStore.setState({
      condicaoSelecionada: condicaoDe(1, 'A VISTA'),
      pagamentos: [pagamentoDe({ idPagamento: 'pag-1', valorAplicado: 5_000 })],
    });
  }

  it('sem pagamento, os dois botões estão liberados', () => {
    render(<ListaItensMobile />);

    expect(screen.getByRole('button', { name: 'Editar item' })).not.toHaveAttribute(
      'aria-disabled',
    );
    expect(screen.getByRole('button', { name: 'Cancelar' })).not.toHaveAttribute('aria-disabled');
  });

  it('com pagamento, marca os dois como bloqueados e nomeia a saída', () => {
    comPagamentoAplicado();
    render(<ListaItensMobile />);

    const lixeira = screen.getByRole('button', { name: 'Cancelar' });
    expect(lixeira).toHaveAttribute('aria-disabled', 'true');
    // O `title` é a mesma frase que o clique notifica — e ela **nomeia a
    // saída**, senão a única leitura possível é a de que a venda travou.
    expect(lixeira.getAttribute('title')).toContain('Limpar');
    expect(screen.getByRole('button', { name: 'Editar item' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('clicar na lixeira bloqueada não cancela o item', async () => {
    const usuario = userEvent.setup();
    comPagamentoAplicado();
    render(<ListaItensMobile />);

    await usuario.click(screen.getByRole('button', { name: 'Cancelar' }));

    // A linha continua ativa: o clique virou explicação, não ação.
    expect(useVendaStore.getState().linhas[0]?.cancelada).toBe(false);
  });
});

/**
 * A lista como **conferência** (etapa 2 do wizard) e o colapso das linhas
 * antigas — os dois pedidos do usuário de 2026-09-09.
 */
describe('ListaItensMobile — conferência e colapso', () => {
  beforeEach(() => {
    useSessionStore.setState({ estado: 'pronto', registro: registroDeBootstrap() });
    useEdicaoItemStore.setState({ linhaEmEdicao: null });
    useVendaStore.setState({ condicaoSelecionada: null, descontoCapa: null, pagamentos: [] });
    useVendaStore.getState().resetarAuditoria('NOVA');
  });

  function comLinhas(quantidade: number): void {
    useVendaStore.setState({
      linhas: Array.from({ length: quantidade }, (_, indice) =>
        linhaDe({
          idLinha: `linha-${String(indice + 1)}`,
          // `snapshotDe` não parametriza a descrição, e aqui ela é o que
          // distingue "as últimas" de "as primeiras" na asserção.
          snapshot: {
            ...snapshotDe({ pesavelEditavel: 'E', codigoProduto: `SKU-${String(indice + 1)}` }),
            descricao: `PRODUTO ${String(indice + 1)}`,
          },
          precoUnitario: 1_000,
          quantidadeEmUnidades: 1,
        }),
      ),
    });
  }

  it('somenteLeitura remove lápis e lixeira, mantendo os itens à vista', () => {
    comLinhas(2);
    render(<ListaItensMobile somenteLeitura />);

    expect(screen.getAllByTestId('linha-carrinho')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Editar item' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument();
  });

  it('até 3 itens, nada colapsa', () => {
    comLinhas(3);
    render(<ListaItensMobile />);

    expect(screen.getAllByTestId('linha-carrinho')).toHaveLength(3);
    expect(screen.queryByTestId('expandir-itens-anteriores')).toBeNull();
  });

  it('acima de 3, mostra as últimas e resume as anteriores com o total delas', () => {
    comLinhas(7);
    render(<ListaItensMobile />);

    expect(screen.getAllByTestId('linha-carrinho')).toHaveLength(3);

    const resumo = screen.getByTestId('expandir-itens-anteriores');
    expect(resumo).toHaveTextContent('+4 produtos anteriores');
    // 4 linhas de R$ 10,00 — o resumo carrega o valor do que ficou para trás,
    // senão o operador teria de somar de cabeça para conferir o total.
    expect(resumo).toHaveTextContent('R$ 40,00');

    // As visíveis são as **mais recentes**: é a pergunta que o caixa faz depois
    // de bipar ("entrou?"), e as primeiras não a respondem.
    expect(screen.getByText('PRODUTO 7')).toBeInTheDocument();
    expect(screen.queryByText('PRODUTO 1')).toBeNull();
  });

  it('expandir traz todas as linhas de volta', async () => {
    const usuario = userEvent.setup();
    comLinhas(7);
    render(<ListaItensMobile />);

    await usuario.click(screen.getByTestId('expandir-itens-anteriores'));

    expect(screen.getAllByTestId('linha-carrinho')).toHaveLength(7);
    expect(screen.queryByTestId('expandir-itens-anteriores')).toBeNull();
    expect(screen.getByText('PRODUTO 1')).toBeInTheDocument();
  });

  it('o total da venda continua somando tudo, colapsado ou não', () => {
    comLinhas(7);
    render(<ListaItensMobile />);

    expect(screen.getByTestId('total-venda')).toHaveTextContent('R$ 70,00');
  });
});

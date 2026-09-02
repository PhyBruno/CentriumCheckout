import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { GridItens } from '../../../../src/client/features/carrinho/GridItens';
import { useEdicaoItemStore } from '../../../../src/client/stores/edicaoItemStore';
import { useSessionStore } from '../../../../src/client/stores/sessionStore';
import { useVendaStore } from '../../../../src/client/stores/vendaStore';
import { linhaDe, snapshotDe } from '../../../support/precificacao';

/**
 * Lápis da grid desktop (`FR-007`/T030, redirecionado pela correção do
 * usuário, 2026-09-03): em vez de editar a quantidade inline, carrega a
 * linha inteira em `useEdicaoItemStore` para a barra de entrada rápida
 * consumir — a grid não confirma nada sozinha, só dispara e reflete o estado
 * de "carregada na barra" (`emEdicaoNaBarra`).
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

describe('GridItens — lápis carrega o item na barra de entrada rápida', () => {
  beforeEach(() => {
    useSessionStore.setState({ estado: 'pronto', registro: registroDeBootstrap() });
    useVendaStore.getState().resetarAuditoria('NOVA');
    useEdicaoItemStore.setState({ linhaEmEdicao: null });
  });

  it("desabilita o lápis quando o produto não é editável (ProdutoPesavelEditavel = '')", () => {
    useVendaStore.setState({
      linhas: [linhaDe({ idLinha: 'linha-1', snapshot: snapshotDe({ pesavelEditavel: '' }) })],
    });
    render(<GridItens />);

    expect(screen.getByRole('button', { name: 'Editar item' })).toBeDisabled();
  });

  it.each(['E', 'S', 'B'] as const)(
    'habilita o lápis quando ProdutoPesavelEditavel = %s',
    (pesavelEditavel) => {
      useVendaStore.setState({
        linhas: [linhaDe({ idLinha: 'linha-1', snapshot: snapshotDe({ pesavelEditavel }) })],
      });
      render(<GridItens />);

      expect(screen.getByRole('button', { name: 'Editar item' })).toBeEnabled();
    },
  );

  it('carrega a linha em useEdicaoItemStore ao clicar no lápis', async () => {
    const usuario = userEvent.setup();
    useVendaStore.setState({
      linhas: [linhaDe({ idLinha: 'linha-1', snapshot: snapshotDe({ pesavelEditavel: 'E' }) })],
    });
    render(<GridItens />);

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
    render(<GridItens />);

    expect(screen.getByRole('button', { name: 'Editar item' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    // Sinaliza visualmente que a linha "sumiu" pra revisão, não que foi
    // cancelada (correção do usuário, 2026-09-03).
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
    render(<GridItens />);

    expect(screen.queryByRole('button', { name: 'Editar item' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument();
  });
});

describe('GridItens — faixa "Resumo parcial carrinho" (correção do usuário, 2026-09-02)', () => {
  beforeEach(() => {
    useSessionStore.setState({ estado: 'pronto', registro: registroDeBootstrap() });
    useVendaStore.getState().resetarAuditoria('NOVA');
    useVendaStore.setState({ linhas: [] });
  });

  it('mostra a faixa, os contadores e o subtotal mesmo sem item na venda', () => {
    render(<GridItens />);

    expect(screen.getByTestId('resumo-parcial-carrinho')).toBeInTheDocument();
    expect(screen.getByTestId('ultimo-item-adicionado')).toHaveTextContent(
      'Nenhum item adicionado ainda',
    );
    expect(screen.getByTestId('quantidade-itens-carrinho')).toHaveTextContent('0 itens');
    expect(screen.getByTestId('total-venda')).toHaveTextContent('R$ 0,00');
  });

  it('passa a nomear o último item inserido assim que a venda tem linha', () => {
    useVendaStore.setState({
      linhas: [linhaDe({ snapshot: snapshotDe({ codigoProduto: '001234' }) })],
    });
    render(<GridItens />);

    expect(screen.getByTestId('ultimo-item-adicionado')).toHaveTextContent(
      'Último item adicionado: PRODUTO EXEMPLO 500G',
    );
    expect(screen.getByTestId('quantidade-itens-carrinho')).toHaveTextContent('1 item');
  });
});

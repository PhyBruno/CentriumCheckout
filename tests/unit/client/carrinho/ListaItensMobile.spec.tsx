import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { ListaItensMobile } from '../../../../src/client/features/carrinho/ListaItensMobile';
import { useEdicaoItemStore } from '../../../../src/client/stores/edicaoItemStore';
import { useSessionStore } from '../../../../src/client/stores/sessionStore';
import { useVendaStore } from '../../../../src/client/stores/vendaStore';
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
    },
  };
}

describe('ListaItensMobile — lápis carrega o item na barra de entrada rápida', () => {
  beforeEach(() => {
    useSessionStore.setState({ estado: 'pronto', registro: registroDeBootstrap() });
    useVendaStore.getState().resetarAuditoria('NOVA');
    useEdicaoItemStore.setState({ linhaEmEdicao: null });
  });

  it('desabilita o lápis quando o produto não é editável (ProdutoPesavelEditavel = \'\')', () => {
    useVendaStore.setState({
      linhas: [linhaDe({ idLinha: 'linha-1', snapshot: snapshotDe({ pesavelEditavel: '' }) })],
    });
    render(<ListaItensMobile />);

    expect(screen.getByRole('button', { name: 'Editar item' })).toBeDisabled();
  });

  it('habilita o lápis para produto pesável (\'S\'/\'B\') e editável (\'E\')', () => {
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

  it('trava o lápis e a lixeira da linha carregada na barra', () => {
    useVendaStore.setState({
      linhas: [linhaDe({ idLinha: 'linha-1', snapshot: snapshotDe({ pesavelEditavel: 'E' }) })],
    });
    useEdicaoItemStore.setState({
      linhaEmEdicao: linhaDe({ idLinha: 'linha-1', snapshot: snapshotDe({ pesavelEditavel: 'E' }) }),
    });
    render(<ListaItensMobile />);

    expect(screen.getByRole('button', { name: 'Editar item' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
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

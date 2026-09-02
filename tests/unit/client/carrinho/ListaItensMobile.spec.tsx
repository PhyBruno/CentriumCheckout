import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { ListaItensMobile } from '../../../../src/client/features/carrinho/ListaItensMobile';
import { useSessionStore } from '../../../../src/client/stores/sessionStore';
import { useVendaStore } from '../../../../src/client/stores/vendaStore';
import { linhaDe } from '../../../support/precificacao';

/**
 * Mesmo comportamento de edição de quantidade de `GridItens.spec.tsx`, no
 * layout mobile (`FR-007`, T030) — os dois layouts compartilham
 * `EdicaoQuantidadeItem` e a mesma fonte de estado (`useVendaStore`), então o
 * fluxo precisa produzir o mesmo efeito nos dois.
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

describe('ListaItensMobile — editar quantidade de item já inserido', () => {
  beforeEach(() => {
    useSessionStore.setState({ estado: 'pronto', registro: registroDeBootstrap() });
    // Mesmo motivo de `GridItens.spec.tsx`: evita o aviso de `auditoriaSlice`
    // por registrar `PRODUTO_ALTERADO` antes de `VENDA_INICIADA`.
    useVendaStore.getState().resetarAuditoria('NOVA');
    useVendaStore.setState({
      linhas: [linhaDe({ idLinha: 'linha-1', quantidadeEmUnidades: 2 })],
    });
  });

  it('chama editarItem com idLinha, campo "quantidade" e o novo valor ao confirmar', async () => {
    const usuario = userEvent.setup();
    render(<ListaItensMobile />);

    await usuario.click(screen.getByRole('button', { name: 'Editar quantidade' }));
    const campo = screen.getByLabelText('Nova quantidade');
    await usuario.clear(campo);
    await usuario.type(campo, '7');
    await usuario.click(screen.getByRole('button', { name: 'Confirmar' }));

    const linha = useVendaStore.getState().linhas[0];
    expect(linha?.quantidade).toBe(7000);
    expect(screen.queryByLabelText('Nova quantidade')).not.toBeInTheDocument();
  });

  it('descarta a edição sem alterar a quantidade ao cancelar', async () => {
    const usuario = userEvent.setup();
    render(<ListaItensMobile />);

    await usuario.click(screen.getByRole('button', { name: 'Editar quantidade' }));
    const campo = screen.getByLabelText('Nova quantidade');
    await usuario.clear(campo);
    await usuario.type(campo, '9');
    await usuario.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(useVendaStore.getState().linhas[0]?.quantidade).toBe(2000);
    expect(screen.queryByLabelText('Nova quantidade')).not.toBeInTheDocument();
  });

  it('não oferece "Editar quantidade" para uma linha cancelada', () => {
    useVendaStore.setState({
      linhas: [linhaDe({ idLinha: 'linha-1', quantidadeEmUnidades: 2, cancelada: true })],
    });
    render(<ListaItensMobile />);

    expect(screen.queryByRole('button', { name: 'Editar quantidade' })).not.toBeInTheDocument();
  });
});

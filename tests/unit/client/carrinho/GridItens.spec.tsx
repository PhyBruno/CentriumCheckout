import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { GridItens } from '../../../../src/client/features/carrinho/GridItens';
import { useSessionStore } from '../../../../src/client/stores/sessionStore';
import { useVendaStore } from '../../../../src/client/stores/vendaStore';
import { linhaDe } from '../../../support/precificacao';

/**
 * Edição de quantidade de uma linha já inserida na grid desktop (`FR-007`,
 * T030) — cobre a lacuna encontrada pela revisão: até aqui `editarItem` não
 * era chamado por nenhuma UI, então uma quantidade bipada errada só podia ser
 * corrigida cancelando a linha inteira e reinserindo-a.
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

describe('GridItens — editar quantidade de item já inserido', () => {
  beforeEach(() => {
    // `editarItem` reprecifica via `repricarSku`, que lê `TipoPreco` do
    // bootstrap (`carrinhoDepsPadrao.tipoPrecoAtual`) — sem isso a action
    // lançaria `ErroSessaoSemConfiguracao`.
    useSessionStore.setState({ estado: 'pronto', registro: registroDeBootstrap() });
    // Abre a sessão de auditoria antes de popular o carrinho — sem isso,
    // `editarItem` registraria `PRODUTO_ALTERADO` com o histórico vazio e
    // disparia o aviso de `auditoriaSlice` (mesmo padrão de `montarStore()`
    // em `tests/integration/carrinhoSlice.spec.ts`).
    useVendaStore.getState().resetarAuditoria('NOVA');
    useVendaStore.setState({
      linhas: [linhaDe({ idLinha: 'linha-1', quantidadeEmUnidades: 2 })],
    });
  });

  it('troca a célula de quantidade por um campo editável ao clicar em "Editar quantidade"', async () => {
    const usuario = userEvent.setup();
    render(<GridItens />);

    expect(screen.getByText('2,000')).toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: 'Editar quantidade' }));

    expect(screen.getByLabelText('Nova quantidade')).toHaveValue('2,000');
    expect(screen.queryByText('2,000')).not.toBeInTheDocument();
  });

  it('chama editarItem com idLinha, campo "quantidade" e o novo valor ao confirmar', async () => {
    const usuario = userEvent.setup();
    render(<GridItens />);

    await usuario.click(screen.getByRole('button', { name: 'Editar quantidade' }));
    const campo = screen.getByLabelText('Nova quantidade');
    await usuario.clear(campo);
    await usuario.type(campo, '5');
    await usuario.click(screen.getByRole('button', { name: 'Confirmar' }));

    const linha = useVendaStore.getState().linhas[0];
    expect(linha?.quantidade).toBe(5000);
    // Volta a mostrar a quantidade como texto, não mais o campo de edição.
    expect(screen.queryByLabelText('Nova quantidade')).not.toBeInTheDocument();
    expect(screen.getByText('5,000')).toBeInTheDocument();
  });

  it('descarta a edição sem alterar a quantidade ao cancelar', async () => {
    const usuario = userEvent.setup();
    render(<GridItens />);

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
    render(<GridItens />);

    expect(screen.queryByRole('button', { name: 'Editar quantidade' })).not.toBeInTheDocument();
  });
});

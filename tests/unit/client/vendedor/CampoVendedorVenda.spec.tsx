import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CampoVendedorVenda } from '../../../../src/client/features/vendedor/CampoVendedorVenda';
import { rotuloDoVendedor } from '../../../../src/client/features/vendedor/useVendedor';
import { notificar } from '../../../../src/client/lib/notificar';
import { useSessionStore } from '../../../../src/client/stores/sessionStore';
import { motivoVendedorBloqueado } from '../../../../src/client/stores/slices/vendedorSlice';
import { useVendaStore } from '../../../../src/client/stores/vendaStore';
import { condicaoDe } from '../../../support/pagamento';
import { registroBootstrapDe } from '../../../support/sessao';

/**
 * Campo de vendedor da venda (T014) — a metade da feature 012 que o
 * `vendedorSlice.spec.ts` não alcança: o que o operador **lê** na tela para
 * cada estado de `vendedorAtual`.
 *
 * Aberto na revisão da 012 (2026-09-08): a feature tinha teste de slice e E2E,
 * mas nenhum teste de componente — ao contrário de cliente e produto. Os dois
 * defeitos corrigidos na mesma revisão (o `"Vendedor #N"` que não se resolvia
 * ao reselecionar, e o `codigo: 0` de documento sem vendedor) aparecem aqui do
 * lado da tela, que é onde o operador os encontraria.
 */

function renderCampo() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }): ReactNode =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return render(createElement(Wrapper, null, createElement(CampoVendedorVenda)));
}

function textoDoCampo(): string {
  return screen.getByTestId('nome-vendedor').textContent ?? '';
}

describe('rotuloDoVendedor', () => {
  it('devolve null sem vendedor — o campo decide o placeholder, não esta função', () => {
    expect(rotuloDoVendedor(null)).toBeNull();
  });

  it('cai no código quando o nome não veio junto (AD-095)', () => {
    expect(rotuloDoVendedor({ codigo: 33, nome: null, origem: 'DAV' })).toBe('Vendedor #33');
    // Nome em branco na listagem é o mesmo caso de nome ausente.
    expect(rotuloDoVendedor({ codigo: 33, nome: '', origem: 'RASCUNHO' })).toBe('Vendedor #33');
  });

  it('exibe o nome por extenso quando ele existe', () => {
    expect(rotuloDoVendedor({ codigo: 7, nome: 'Fulano', origem: 'DEFAULT' })).toBe('Fulano');
  });
});

describe('CampoVendedorVenda', () => {
  beforeEach(() => {
    useSessionStore.setState({ estado: 'pronto', registro: registroBootstrapDe() });
    useVendaStore.setState({
      linhas: [],
      vendedorAtual: null,
      condicaoSelecionada: null,
      pagamentos: [],
    });
    useVendaStore.getState().resetarAuditoria('NOVA');
  });

  it('pede a seleção manual quando a empresa não tem vendedor default (FR-006)', () => {
    renderCampo();

    expect(textoDoCampo()).toBe('Selecionar vendedor');
  });

  it('exibe o vendedor pré-selecionado do PDV sem indicar a origem (I5)', () => {
    act(() => {
      useVendaStore
        .getState()
        .inicializarVendedorPadrao(
          registroBootstrapDe({ VendedorCodigo: 7, VendedorNome: 'Fulano' }).SessaoUsuario,
        );
    });
    renderCampo();

    expect(textoDoCampo()).toBe('Fulano');
    // O campo não distingue default de escolha do operador (AD-053): nenhum
    // rótulo de origem acompanha o nome.
    expect(screen.queryByText(/padrão|default|origem/i)).toBeNull();
  });

  it('reselecionar o mesmo vendedor troca "Vendedor #N" pelo nome (quickstart, Cenário 7)', () => {
    renderCampo();

    // Importação de DAV: código sem nome (AD-095).
    act(() => {
      useVendaStore.getState().trocarVendedor({ codigo: 33, nome: null });
    });
    expect(textoDoCampo()).toBe('Vendedor #33');

    // O gesto que o Cenário 7 prevê: reabrir o modal e clicar no mesmo
    // vendedor, agora com o nome vindo de `GetListaVendedores`.
    act(() => {
      useVendaStore.getState().selecionarVendedor({ codigo: 33, nome: 'Mariana Alves' });
    });

    expect(textoDoCampo()).toBe('Mariana Alves');
  });

  it('documento sem vendedor (codigo 0) deixa o campo vazio, não "Vendedor #0"', () => {
    renderCampo();

    // Retomada de uma venda suspensa por uma empresa sem vendedor default: o
    // ERP devolve `vendedorCodigo: 0`, que é o "vazio" do `int64` não anulável.
    act(() => {
      useVendaStore.getState().trocarVendedor({ codigo: 0, nome: null }, 'RASCUNHO');
    });

    expect(textoDoCampo()).toBe('Selecionar vendedor');
    // É este `null` que a 004 lê para manter o botão "Finalizar" bloqueado
    // (`FR-006`/`SC-003`).
    expect(useVendaStore.getState().vendedorAtual).toBeNull();
  });

  it('a lupa fica livre enquanto a venda ainda pode mudar', async () => {
    const usuario = userEvent.setup();
    renderCampo();

    const lupa = screen.getByTestId('abrir-busca-vendedor');
    expect(lupa).not.toHaveAttribute('aria-disabled');

    await usuario.click(lupa);

    expect(await screen.findByTestId('modal-busca-vendedor')).toBeInTheDocument();
  });

  it('com a venda em pagamento a lupa fecha, explica o motivo ao clique e não abre a busca (2026-10-08)', async () => {
    const usuario = userEvent.setup();
    const erro = vi.spyOn(notificar, 'erro');
    // Escolher a condição já congela a venda (AD-152) — antes de qualquer
    // pagamento aprovado.
    useVendaStore.setState({ condicaoSelecionada: condicaoDe(1, 'A VISTA') });
    renderCampo();

    const lupa = screen.getByTestId('abrir-busca-vendedor');
    expect(lupa).toHaveAttribute('aria-disabled', 'true');
    expect(lupa).toHaveAttribute('tabindex', '-1');
    expect(lupa).toHaveAttribute('title', motivoVendedorBloqueado(false));

    await usuario.click(lupa);

    expect(erro).toHaveBeenCalledWith(motivoVendedorBloqueado(false));
    expect(screen.queryByTestId('modal-busca-vendedor')).toBeNull();
  });

  it('o motivo nomeia a saída — "Limpar" no cartão de pagamento', () => {
    expect(motivoVendedorBloqueado(false)).toContain('Limpar');
    expect(motivoVendedorBloqueado(true)).toBeNull();
  });
});

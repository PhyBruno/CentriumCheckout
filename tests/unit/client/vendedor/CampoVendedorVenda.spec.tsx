import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CampoVendedorVenda } from '../../../../src/client/features/vendedor/CampoVendedorVenda';
import { rotuloDoVendedor } from '../../../../src/client/features/vendedor/useVendedor';
import { useSessionStore } from '../../../../src/client/stores/sessionStore';
import { useVendaStore } from '../../../../src/client/stores/vendaStore';
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
    useVendaStore.setState({ linhas: [], vendedorAtual: null });
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

  it('mantém a lupa clicável para o operador conferir quem está na venda', () => {
    renderCampo();

    // Bloqueio pós-pagamento é decidido pelo slice (I4), não escondendo a
    // busca: consultar a lista é leitura, e continua permitida.
    expect(screen.getByTestId('abrir-busca-vendedor')).toBeEnabled();
  });
});

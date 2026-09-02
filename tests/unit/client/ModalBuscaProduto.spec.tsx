import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import type { CheckoutListaProdutos } from '../../../src/shared/schemas/produto.schema';
import { ModalBuscaProduto } from '../../../src/client/features/carrinho/ModalBuscaProduto';
import { useSessionStore } from '../../../src/client/stores/sessionStore';
import { useVendaStore } from '../../../src/client/stores/vendaStore';

/**
 * Paginação do modal de busca (T015, `CART-01`).
 *
 * Achado da revisão de código: o rodapé só *exibia* "Página X de Y", sem
 * nenhum controle de navegação, e `useBuscaProdutos` nunca recebia `pagina` —
 * o operador nunca alcançava a página 2 em diante de um resultado com mais de
 * `RegistrosPorPagina` produtos. Este arquivo cobre a correção: estado local
 * de página, botões "Anterior"/"Próxima" e reset para a página 1 a cada novo
 * termo digitado.
 *
 * `useBuscaProdutos` é mockado no nível do módulo `produtoQueries` (não com
 * MSW): o teste cobre só a orquestração de paginação do componente, não o
 * hook em si — o hook (`fetchListaProdutos`, cache, `enabled`) já tem seus
 * próprios testes de fronteira em `tests/unit/shared/produto.schema.spec.ts`
 * e `tests/integration/carrinhoSlice.spec.ts`. `importOriginal` preserva o
 * restante do módulo (`opcoesProduto`, classes de erro etc.), usado por
 * `useCarrinho.ts` dentro do mesmo componente.
 */

const mockUseBuscaProdutos =
  vi.fn<
    (
      termo: string,
      parametros: { qtdMinCharParaConsulta: number; pagina?: number },
    ) => UseQueryResult<CheckoutListaProdutos, Error>
  >();

vi.mock('../../../src/client/services/produto/produtoQueries', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../../../src/client/services/produto/produtoQueries')>();
  return {
    ...original,
    useBuscaProdutos: (
      termo: string,
      parametros: { qtdMinCharParaConsulta: number; pagina?: number },
    ) => mockUseBuscaProdutos(termo, parametros),
  };
});

function produtoDe(codigo: string): CheckoutListaProdutos['Produtos'][number] {
  return {
    CodigoProduto: codigo,
    Descricao: `Produto ${codigo}`,
    Referencia: `REF-${codigo}`,
    CodigoBarras: `789000000${codigo}`,
    UDM: 'UN',
  };
}

/**
 * Resultado sintético de `useBuscaProdutos` para a página informada.
 *
 * Só os campos que `ModalBuscaProduto` de fato lê (`isPending`, `isFetching`,
 * `isError`, `data`) são preenchidos — o restante da união discriminada de
 * `UseQueryResult` não importa para este componente, daí o cast (Regra 2 de
 * `typescript-strict`: aceitável fora da fronteira de dados do ERP, aqui é
 * apenas o formato de retorno de um hook mockado em teste).
 */
function resultadoDaBusca(opcoes: {
  paginaAtual: number;
  totalPaginas: number;
  totalRegistros?: number;
}): UseQueryResult<CheckoutListaProdutos, Error> {
  const data: CheckoutListaProdutos = {
    PaginaAtual: opcoes.paginaAtual,
    RegistrosPorPagina: 20,
    TotalRegistros: opcoes.totalRegistros ?? opcoes.totalPaginas * 20,
    TotalPaginas: opcoes.totalPaginas,
    Produtos: [produtoDe(`00${String(opcoes.paginaAtual)}`)],
  };
  return {
    isPending: false,
    isFetching: false,
    isError: false,
    data,
  } as UseQueryResult<CheckoutListaProdutos, Error>;
}

/**
 * Liga o mock à página **realmente pedida** pelo componente
 * (`parametros.pagina`), com `totalPaginas` fixo — reproduz o comportamento
 * real do ERP (a resposta ecoa a página pedida) em vez de exigir que cada
 * teste sincronize manualmente o estado local do componente com o mock a
 * cada clique.
 */
function configurarMock(totalPaginas: number): void {
  mockUseBuscaProdutos.mockImplementation((_termo, parametros) =>
    resultadoDaBusca({ paginaAtual: parametros.pagina ?? 1, totalPaginas }),
  );
}

function registroDeBootstrap() {
  return {
    tenant: 'acme',
    codigoEmpresa: '1',
    _versionHash: 'hash-teste',
    SessaoUsuario: {
      TipoPreco: 8,
      CadMaqCod: 'PDV01',
      ListaPrecoDefault: 3,
      CenarioPagamento: '[]',
      QtdMinCharParaConsulta: 3,
      UsuarioTipoCodigoProduto: 'I',
      ClienteDefaultCodigo: 1,
    },
  };
}

function envolverComQueryClient(): (props: { children: ReactNode }) => ReactNode {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }) => createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('ModalBuscaProduto — paginação (T015, CART-01)', () => {
  beforeEach(() => {
    useSessionStore.setState({ estado: 'pronto', registro: registroDeBootstrap() });
    useVendaStore.setState({ linhas: [] });
    useVendaStore.getState().resetarAuditoria('NOVA');
    mockUseBuscaProdutos.mockReset();
  });

  afterEach(() => {
    mockUseBuscaProdutos.mockReset();
  });

  function renderModal() {
    const Wrapper = envolverComQueryClient();
    return render(
      createElement(
        Wrapper,
        null,
        createElement(ModalBuscaProduto, { aberto: true, onFechar: () => {} }),
      ),
    );
  }

  it('desabilita "Anterior" na página 1', async () => {
    configurarMock(3);
    renderModal();

    await userEvent.type(screen.getByTestId('campo-busca-produto'), 'caneta');

    await waitFor(() => {
      expect(screen.getByTestId('pagina-anterior')).toBeDisabled();
    });
    expect(screen.getByTestId('pagina-proxima')).toBeEnabled();
  });

  it('desabilita "Próxima" na última página', async () => {
    configurarMock(3);
    renderModal();

    await userEvent.type(screen.getByTestId('campo-busca-produto'), 'caneta');
    // Avança até a última página (3) clicando em "Próxima" — o mock ecoa a
    // página pedida a cada chamada, como o ERP faria.
    await userEvent.click(screen.getByTestId('pagina-proxima'));
    await waitFor(() => {
      expect(screen.getByText(/Página 2 de 3/)).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId('pagina-proxima'));

    await waitFor(() => {
      expect(screen.getByText(/Página 3 de 3/)).toBeInTheDocument();
    });
    expect(screen.getByTestId('pagina-proxima')).toBeDisabled();
    expect(screen.getByTestId('pagina-anterior')).toBeEnabled();
  });

  it('clicar em "Próxima" dispara nova busca com pagina: 2', async () => {
    configurarMock(3);
    renderModal();

    await userEvent.type(screen.getByTestId('campo-busca-produto'), 'caneta');
    mockUseBuscaProdutos.mockClear();

    await userEvent.click(screen.getByTestId('pagina-proxima'));

    await waitFor(() => {
      expect(mockUseBuscaProdutos).toHaveBeenCalledWith(
        'caneta',
        expect.objectContaining({ pagina: 2 }),
      );
    });
  });

  it('trocar o termo de busca reseta a página para 1', async () => {
    configurarMock(3);
    renderModal();

    await userEvent.type(screen.getByTestId('campo-busca-produto'), 'caneta');
    await userEvent.click(screen.getByTestId('pagina-proxima'));
    await waitFor(() => {
      expect(screen.getByText(/Página 2 de 3/)).toBeInTheDocument();
    });

    mockUseBuscaProdutos.mockClear();

    // Novo termo — precisa reconsultar a partir da página 1, não da 2.
    await userEvent.clear(screen.getByTestId('campo-busca-produto'));
    await userEvent.type(screen.getByTestId('campo-busca-produto'), 'lapis');

    await waitFor(() => {
      const ultimaChamada =
        mockUseBuscaProdutos.mock.calls[mockUseBuscaProdutos.mock.calls.length - 1];
      expect(ultimaChamada?.[1]).toEqual(expect.objectContaining({ pagina: 1 }));
    });
  });
});

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

  function renderModal(
    onFechar: () => void = () => {},
    onProdutoSelecionado: (codigoProduto: string) => void = () => {},
  ) {
    const Wrapper = envolverComQueryClient();
    const props = { aberto: true, onFechar, onProdutoSelecionado };
    const utils = render(createElement(Wrapper, null, createElement(ModalBuscaProduto, props)));
    return {
      ...utils,
      rerenderComAberto(aberto: boolean) {
        utils.rerender(
          createElement(Wrapper, null, createElement(ModalBuscaProduto, { ...props, aberto })),
        );
      },
    };
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
    // O debounce (`DEBOUNCE_BUSCA_MS`) precisa passar antes do rodapé de
    // paginação existir — sem esperar, o clique abaixo lançaria "elemento não
    // encontrado".
    await waitFor(() => {
      expect(screen.getByTestId('pagina-proxima')).toBeInTheDocument();
    });
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
    // Espera o debounce disparar a busca inicial antes de limpar o mock —
    // limpar cedo demais apagaria essa chamada pendente e ela ainda chegaria
    // depois, contaminando a asserção de `pagina: 2` abaixo.
    await waitFor(() => {
      expect(screen.getByTestId('pagina-proxima')).toBeInTheDocument();
    });
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
    await waitFor(() => {
      expect(screen.getByTestId('pagina-proxima')).toBeInTheDocument();
    });
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

  it('fechar e reabrir o modal limpa o termo de busca da consulta anterior', async () => {
    configurarMock(1);
    const { rerenderComAberto } = renderModal();

    await userEvent.type(screen.getByTestId('campo-busca-produto'), 'caneta');
    expect(screen.getByTestId('campo-busca-produto')).toHaveValue('caneta');

    rerenderComAberto(false);
    rerenderComAberto(true);

    expect(screen.getByTestId('campo-busca-produto')).toHaveValue('');
  });

  it('selecionar um candidato só devolve o código e fecha — não resolve nem insere nada sozinho', async () => {
    configurarMock(1);
    const onFechar = vi.fn();
    const onProdutoSelecionado = vi.fn();
    renderModal(onFechar, onProdutoSelecionado);

    await userEvent.type(screen.getByTestId('campo-busca-produto'), 'caneta');
    await waitFor(() => {
      expect(screen.getByTestId('candidato-produto')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId('candidato-produto'));

    // O código devolvido é o do candidato sintético (`produtoDe`, página 1).
    expect(onProdutoSelecionado).toHaveBeenCalledOnce();
    expect(onProdutoSelecionado).toHaveBeenCalledWith('001');
    expect(onFechar).toHaveBeenCalledOnce();
  });

  it('Esc fecha o modal', async () => {
    configurarMock(1);
    const onFechar = vi.fn();
    renderModal(onFechar);

    // Foca explicitamente dentro do modal: o handler de Esc está no `onKeyDown`
    // do overlay e só recebe o evento por bubbling de um descendente focado —
    // depender do `autoFocus` do campo seria frágil no jsdom.
    await userEvent.click(screen.getByTestId('campo-busca-produto'));
    await userEvent.keyboard('{Escape}');

    expect(onFechar).toHaveBeenCalledOnce();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import type { CheckoutListaVendedores } from '../../../../src/shared/schemas/vendedor.schema';
import type * as VendedorQueries from '../../../../src/client/services/vendedor/vendedorQueries';
import { ModalBuscaVendedor } from '../../../../src/client/features/vendedor/ModalBuscaVendedor';
import { useSessionStore } from '../../../../src/client/stores/sessionStore';
import { registroBootstrapDe } from '../../../support/sessao';

/**
 * Modal de busca de vendedor (T013, `VEND-01`/`VEND-02`).
 *
 * Aberto na revisão da 012 (2026-09-08): o componente mais extenso da feature
 * não tinha teste unitário nenhum — piso de caracteres, estado vazio,
 * paginação e o clique definitivo só existiam no E2E, que não isola o
 * componente nem cobre o caso de bootstrap ausente.
 *
 * `useBuscaVendedores` é mockado no nível do módulo `vendedorQueries`, mesmo
 * padrão de `ModalBuscaProduto.spec.tsx`: aqui se testa a orquestração do
 * componente, não o hook — a fronteira de dados do ERP tem os próprios testes
 * de schema.
 */

const mockUseBuscaVendedores =
  vi.fn<
    (
      termo: string,
      parametros: { qtdMinCharParaConsulta: number; pagina?: number },
    ) => UseQueryResult<CheckoutListaVendedores, Error>
  >();

vi.mock('../../../../src/client/services/vendedor/vendedorQueries', async (importOriginal) => {
  const original = await importOriginal<typeof VendedorQueries>();
  return {
    ...original,
    useBuscaVendedores: (
      termo: string,
      parametros: { qtdMinCharParaConsulta: number; pagina?: number },
    ) => mockUseBuscaVendedores(termo, parametros),
  };
});

function vendedorDe(codigo: number): CheckoutListaVendedores['Vendedores'][number] {
  return {
    VendedorCodigo: codigo,
    VendedorNome: `Vendedor ${String(codigo)}`,
    VendedorCGC: `000.000.000-${String(codigo).padStart(2, '0')}`,
    VendedorFone: '(00) 0000-0000',
  };
}

/**
 * Resultado sintético de `useBuscaVendedores`. Só os campos que o componente lê
 * (`isPending`, `isFetching`, `isError`, `data`) são preenchidos — o resto da
 * união discriminada de `UseQueryResult` não importa aqui, daí o cast (Regra 2
 * de `typescript-strict`: fora da fronteira de dados do ERP).
 */
function resultadoDaBusca(opcoes: {
  readonly vendedores?: readonly number[];
  readonly pagina?: number;
  readonly totalPaginas?: number;
  readonly carregando?: boolean;
  readonly erro?: boolean;
}): UseQueryResult<CheckoutListaVendedores, Error> {
  if (opcoes.carregando === true) {
    return { isPending: true, isFetching: true, isError: false, data: undefined } as UseQueryResult<
      CheckoutListaVendedores,
      Error
    >;
  }
  if (opcoes.erro === true) {
    return { isPending: false, isFetching: false, isError: true, data: undefined } as UseQueryResult<
      CheckoutListaVendedores,
      Error
    >;
  }
  const vendedores = (opcoes.vendedores ?? []).map(vendedorDe);
  return {
    isPending: false,
    isFetching: false,
    isError: false,
    data: {
      PaginaAtual: opcoes.pagina ?? 1,
      RegistrosPorPagina: 20,
      TotalRegistros: vendedores.length,
      TotalPaginas: opcoes.totalPaginas ?? 1,
      Vendedores: vendedores,
    },
  } as UseQueryResult<CheckoutListaVendedores, Error>;
}

function renderModal(onVendedorSelecionado = vi.fn(), onFechar = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }): ReactNode =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  const utils = render(
    createElement(
      Wrapper,
      null,
      createElement(ModalBuscaVendedor, { aberto: true, onFechar, onVendedorSelecionado }),
    ),
  );
  return { ...utils, onVendedorSelecionado, onFechar };
}

describe('ModalBuscaVendedor', () => {
  beforeEach(() => {
    useSessionStore.setState({ estado: 'pronto', registro: registroBootstrapDe() });
    mockUseBuscaVendedores.mockReturnValue(resultadoDaBusca({ vendedores: [] }));
  });

  afterEach(() => {
    mockUseBuscaVendedores.mockReset();
  });

  it('exige o piso de caracteres do ERP antes de buscar (AD-024)', () => {
    renderModal();

    // `QtdMinCharParaConsulta` do bootstrap é 3 — o número nunca é hardcoded no
    // componente.
    expect(screen.getByTestId('busca-vendedor-abaixo-do-minimo')).toHaveTextContent(
      'Digite ao menos 3 caracteres para buscar.',
    );
  });

  it('sem bootstrap, não busca e diz que espera a configuração do PDV', () => {
    useSessionStore.setState({ estado: 'carregando', registro: null });
    renderModal();

    // Piso inalcançável: melhor não buscar do que buscar com um mínimo
    // inventado. Uma query desligada nunca sai de `isPending`, e sem esta
    // guarda o modal ficaria preso no esqueleto.
    expect(screen.getByTestId('busca-vendedor-abaixo-do-minimo')).toHaveTextContent(
      'Aguardando a configuração do ponto de venda.',
    );
    const [, parametros] = mockUseBuscaVendedores.mock.calls[0] ?? [];
    expect(parametros?.qtdMinCharParaConsulta).toBe(Number.POSITIVE_INFINITY);
  });

  it('não expõe filtro, coluna de status nem função do vendedor (AD-103)', async () => {
    mockUseBuscaVendedores.mockReturnValue(resultadoDaBusca({ vendedores: [21] }));
    renderModal();
    await userEvent.type(screen.getByTestId('campo-busca-vendedor'), 'ven');

    await waitFor(() => {
      expect(screen.getByTestId('resultados-busca-vendedor')).toBeInTheDocument();
    });
    // `GetListaVendedores` não tem status nem cargo: desenhá-los seria inventar
    // o estado do cadastro.
    expect(screen.queryByText(/ativo/i)).toBeNull();
    expect(screen.queryByText(/status/i)).toBeNull();
  });

  it('o clique numa linha é definitivo: devolve o vendedor e fecha (research D1)', async () => {
    mockUseBuscaVendedores.mockReturnValue(resultadoDaBusca({ vendedores: [21, 22] }));
    const { onVendedorSelecionado, onFechar } = renderModal();
    await userEvent.type(screen.getByTestId('campo-busca-vendedor'), 'ven');

    // A segunda linha, pelo atributo que a identifica — `findByTestId` com
    // índice pediria um non-null assertion, que o ESLint deste projeto proíbe.
    const linha = await screen.findByText('Vendedor 22');
    await userEvent.click(linha);

    // O item da lista já traz tudo que a venda consome — não há segunda
    // chamada nem confirmação separada.
    expect(onVendedorSelecionado).toHaveBeenCalledWith({ codigo: 22, nome: 'Vendedor 22' });
    expect(onFechar).toHaveBeenCalledOnce();
  });

  it('lista vazia não bloqueia o fechamento (FR-010, FR-011)', async () => {
    mockUseBuscaVendedores.mockReturnValue(resultadoDaBusca({ vendedores: [] }));
    const { onVendedorSelecionado, onFechar } = renderModal();
    await userEvent.type(screen.getByTestId('campo-busca-vendedor'), 'zzz');

    expect(await screen.findByTestId('busca-vendedor-sem-resultados')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));

    expect(onFechar).toHaveBeenCalledOnce();
    // Fechar sem escolher mantém o vendedor da venda: o modal é só um seletor.
    expect(onVendedorSelecionado).not.toHaveBeenCalled();
  });

  it('a paginação pede a página seguinte e volta à primeira a cada novo termo', async () => {
    mockUseBuscaVendedores.mockReturnValue(
      resultadoDaBusca({ vendedores: [21], pagina: 1, totalPaginas: 3 }),
    );
    renderModal();
    await userEvent.type(screen.getByTestId('campo-busca-vendedor'), 'ven');

    await waitFor(() => {
      expect(screen.getByTestId('paginacao-busca-vendedor')).toBeInTheDocument();
    });
    expect(screen.getByTestId('vendedor-pagina-anterior')).toBeDisabled();

    await userEvent.click(screen.getByTestId('vendedor-pagina-proxima'));
    await waitFor(() => {
      expect(mockUseBuscaVendedores.mock.calls.at(-1)?.[1].pagina).toBe(2);
    });

    // Termo novo é resultado novo: continuar na página 2 mostraria a segunda
    // página de uma busca que o operador já abandonou.
    await userEvent.type(screen.getByTestId('campo-busca-vendedor'), 'x');
    await waitFor(() => {
      expect(mockUseBuscaVendedores.mock.calls.at(-1)?.[1].pagina).toBe(1);
    });
  });

  it('falha de rede vira mensagem, não lista vazia', async () => {
    mockUseBuscaVendedores.mockReturnValue(resultadoDaBusca({ erro: true }));
    renderModal();
    await userEvent.type(screen.getByTestId('campo-busca-vendedor'), 'ven');

    expect(
      await screen.findByText('Não foi possível buscar vendedores. Tente novamente.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('busca-vendedor-sem-resultados')).toBeNull();
  });
});

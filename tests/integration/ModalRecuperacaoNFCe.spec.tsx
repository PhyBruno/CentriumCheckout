import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ModalRecuperacaoNFCe } from '../../src/client/features/recuperacao/ModalRecuperacaoNFCe';
import { useSessionStore } from '../../src/client/stores/sessionStore';
import { abrirSessaoDeVenda, useVendaStore } from '../../src/client/stores/vendaStore';
import { clienteCheckoutDe } from '../support/cliente';
import { snapshotDe, unidades } from '../support/precificacao';
import { registroBootstrapDe } from '../support/sessao';
import { CODIGO_CLIENTE_DAV, SKU_DAV } from '../support/dav';
import { NUMERO_NOTA, rascunhoDaLista, respostaCarregarNFCe } from '../support/recuperacao';

/**
 * Janela de recuperação de NFCe — T005 (listagem e paginação), T006 (busca) e
 * T016 (a linha retomada fica congelada até uma reinserção manual).
 *
 * A rede é trocada no `fetch` global, e não injetada por prop: o modal chama
 * `useListaNFCes` com as deps padrão, exatamente como em produção, então o
 * teste exercita o caminho inteiro — query, proxy `/api/erp/*` e validação Zod
 * de fronteira. Injetar um `erpClient` aqui pularia justamente a parte que mais
 * quebra quando o contrato do ERP muda.
 *
 * O `erp-mock` das suítes E2E cobre o mesmo par de endpoints; o que este
 * arquivo acrescenta é o que o Playwright não alcança sem custo: os estados
 * intermediários da janela (esqueleto durante o carregamento) e o efeito da
 * retomada sobre o `vendaStore` real.
 */

const CAMINHO_LISTA = '/api/erp/ApiCentriumOAuth/GetListaNFCes';
const CAMINHO_CARREGAR = '/api/erp/ApiCentriumOAuth/CarregarNFCe';
const CAMINHO_CLIENTE = '/api/erp/ApiCentriumOAuth/GetCliente';

/** Segundo rascunho, para a busca ter o que descartar e a paginação, o que somar. */
const OUTRA_NOTA = 90211;

function rascunhoVarejo(): Record<string, unknown> {
  return rascunhoDaLista({
    NumeroNota: OUTRA_NOTA,
    Cliente: 'CLIENTE VAREJO',
    Vendedor: 'BRUNO SANTOS',
    Operador: 'CAIXA 01',
    Total: 2840.5,
  });
}

/** O esqueleto do Boneyard mede a caixa; jsdom não traz `ResizeObserver`. */
class ResizeObserverStub implements ResizeObserver {
  observe(): void {
    /* sem medição: o componente cai em `window.innerWidth` */
  }
  unobserve(): void {
    /* nada a fazer */
  }
  disconnect(): void {
    /* nada a fazer */
  }
}

/** jsdom também não implementa `matchMedia`, usado na detecção de tema escuro. */
function criarMatchMediaStub(query: string): MediaQueryList {
  const nada = (): void => {
    /* nada a fazer */
  };

  return {
    matches: false,
    media: query,
    onchange: null,
    addListener: nada,
    removeListener: nada,
    addEventListener: nada,
    removeEventListener: nada,
    dispatchEvent: () => false,
  };
}

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

interface Rota {
  readonly urls: string[];
  /** Resolve a próxima resposta de `GetListaNFCes`; trocável no meio do teste. */
  liberarLista?: () => void;
}

/**
 * Roteador de `fetch` que reproduz o filtro do ERP: `Txtbusca` casa **só** nome
 * de cliente e de vendedor, nunca o número da nota (`research.md` D1). É essa
 * limitação que T006 afirma, então reproduzi-la aqui é o ponto do teste.
 */
function instalarFetch(
  opcoes: { readonly rascunhos?: readonly Record<string, unknown>[]; readonly tamanhoPagina?: number } = {},
): Rota {
  const rota: Rota = { urls: [] };
  const todos = opcoes.rascunhos ?? [rascunhoDaLista(), rascunhoVarejo()];
  const porPagina = opcoes.tamanhoPagina ?? 20;

  // Atribuído **nos dois** alvos: sob o vitest o `window` do jsdom não é o
  // mesmo objeto que `globalThis`, e `criarErpClient` captura o `fetch` que
  // estiver no escopo do módulo. Cobrir só um deixaria a chamada real passar.
  const roteador = (entrada: string | URL): Promise<Response> => {
    const url = typeof entrada === 'string' ? entrada : entrada.toString();
    rota.urls.push(url);

    if (url.startsWith(CAMINHO_LISTA)) {
      const parametros = new URLSearchParams(url.split('?')[1] ?? '');
      const termo = (parametros.get('Txtbusca') ?? '').toUpperCase();
      const pagina = Number(parametros.get('Pagina') ?? '1');

      const filtrados = todos.filter((rascunho) => {
        if (termo === '') {
          return true;
        }
        const alvo = `${String(rascunho['Cliente'])} ${String(rascunho['Vendedor'])}`.toUpperCase();
        return alvo.includes(termo);
      });

      const totalPaginas = Math.max(1, Math.ceil(filtrados.length / porPagina));
      const inicio = (pagina - 1) * porPagina;

      return Promise.resolve(
        respostaJson({
          PaginaAtual: pagina,
          RegistrosPorPagina: porPagina,
          TotalRegistros: filtrados.length,
          TotalPaginas: totalPaginas,
          Rascunho: filtrados.slice(inicio, inicio + porPagina),
        }),
      );
    }

    if (url.startsWith(CAMINHO_CARREGAR)) {
      return Promise.resolve(respostaJson(respostaCarregarNFCe()));
    }

    if (url.startsWith(CAMINHO_CLIENTE)) {
      return Promise.resolve(
        respostaJson(
          clienteCheckoutDe({ CodCliente: CODIGO_CLIENTE_DAV, ClienteNome: 'CLIENTE CONVENIADO' }),
        ),
      );
    }

    // `GetProduto` da resolução best-effort de descrição (AD-096): pode falhar
    // sem derrubar nada, e é justamente o que este 404 exercita.
    return Promise.resolve(respostaJson({}, 404));
  };

  vi.stubGlobal('fetch', roteador);
  window.fetch = roteador as typeof window.fetch;

  return rota;
}

function renderizar(): { readonly fechado: boolean[] } {
  const fechado: boolean[] = [];
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

  render(
    createElement(ModalRecuperacaoNFCe, {
      aberto: true,
      onFechar: () => fechado.push(true),
    }),
    {
      wrapper: ({ children }: { children: ReactNode }): ReactElement =>
        createElement(QueryClientProvider, { client: queryClient }, children),
    },
  );

  return { fechado };
}

beforeAll(() => {
  // Atribuição direta no `window`, e não `vi.stubGlobal`: sob o vitest o
  // `window` do jsdom não é o mesmo objeto que `globalThis`, e é o `window` que
  // o Boneyard enxerga (mesma nota de `LoadingSkeleton.spec.tsx`).
  window.ResizeObserver = ResizeObserverStub;
  window.matchMedia = criarMatchMediaStub;
});

beforeEach(() => {
  useSessionStore.setState({ registro: registroBootstrapDe() });
  // Venda "recém-aberta": é a única em que a importação é permitida (o cliente
  // default pré-selecionado não conta como escolha do operador, AD-032).
  abrirSessaoDeVenda('NOVA', 0);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/* ------------------------------------------------------------------ *
 * T005 — listagem e paginação
 * ------------------------------------------------------------------ */

describe('T005 — a janela lista os rascunhos suspensos', () => {
  it('mostra o esqueleto enquanto a listagem não chega, e a tabela depois', async () => {
    instalarFetch();
    renderizar();

    // Antes da resposta não há tabela: o ramo do esqueleto é o que está no ar.
    expect(screen.queryByTestId('resultados-nfce')).toBeNull();

    await waitFor(() => {
      expect(screen.getByTestId('resultados-nfce')).toBeInTheDocument();
    });

    expect(screen.getAllByTestId('linha-nfce')).toHaveLength(2);
    expect(screen.getByTestId('contagem-nfce')).toHaveTextContent('2');
  });

  it('exibe cliente, vendedor, operador e total de cada rascunho', async () => {
    instalarFetch();
    renderizar();

    const linhas = await screen.findAllByTestId('linha-nfce');
    const linha = linhas[0] as HTMLElement;

    expect(linha).toHaveTextContent('CLIENTE TESTE 01');
    // O nome do vendedor vem do contrato desta listagem — diferente de
    // `ListaDAVs`, que só devolve o código (AD-095).
    expect(linha).toHaveTextContent('MARIANA ALVES');
    expect(linha).toHaveTextContent('CAIXA 03');
    expect(linha).toHaveTextContent('R$ 18,50');
    // `Emissao` é ISO 8601 e é exibida quebrada por texto, nunca via `Date`.
    expect(linha).toHaveTextContent('01/09/2026');
    expect(linha).toHaveTextContent('14:32');
  });

  it('pagina: a primeira página desabilita "Anterior" e "Próxima" pede a página 2', async () => {
    const rota = instalarFetch({ tamanhoPagina: 1 });
    const usuario = userEvent.setup();
    renderizar();

    await screen.findByTestId('resultados-nfce');
    expect(screen.getAllByTestId('linha-nfce')).toHaveLength(1);
    expect(screen.getByTestId('nfce-pagina-anterior')).toBeDisabled();

    await usuario.click(screen.getByTestId('nfce-pagina-proxima'));

    await waitFor(() => {
      expect(rota.urls.some((url) => url.includes('Pagina=2'))).toBe(true);
    });
    await waitFor(() => {
      expect(screen.getByTestId('linha-nfce')).toHaveTextContent('CLIENTE VAREJO');
    });
    expect(screen.getByTestId('nfce-pagina-anterior')).toBeEnabled();
  });

  /** D2/AD-024 — o teto é responsabilidade do Checkout, não do servidor. */
  it('nunca pede mais de 50 registros por página', async () => {
    const rota = instalarFetch();
    renderizar();

    await screen.findByTestId('resultados-nfce');

    const consulta = rota.urls.find((url) => url.startsWith(CAMINHO_LISTA));
    expect(consulta).toContain('Tamanhopagina=20');
    expect(rota.urls.some((url) => /Tamanhopagina=(5[1-9]|[6-9]\d|\d{3,})/.test(url))).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * T006 — busca
 * ------------------------------------------------------------------ */

describe('T006 — busca por nome de cliente ou de vendedor', () => {
  it('filtra por nome parcial do cliente', async () => {
    instalarFetch();
    const usuario = userEvent.setup();
    renderizar();

    await screen.findByTestId('resultados-nfce');
    expect(screen.getAllByTestId('linha-nfce')).toHaveLength(2);

    await usuario.type(screen.getByTestId('campo-busca-nfce'), 'VAREJO');

    await waitFor(() => {
      expect(screen.getAllByTestId('linha-nfce')).toHaveLength(1);
    });
    expect(screen.getByTestId('linha-nfce')).toHaveTextContent('CLIENTE VAREJO');
  });

  it('filtra por nome parcial do vendedor', async () => {
    instalarFetch();
    const usuario = userEvent.setup();
    renderizar();

    await screen.findByTestId('resultados-nfce');

    await usuario.type(screen.getByTestId('campo-busca-nfce'), 'MARIANA');

    await waitFor(() => {
      expect(screen.getAllByTestId('linha-nfce')).toHaveLength(1);
    });
    expect(screen.getByTestId('linha-nfce')).toHaveTextContent('CLIENTE TESTE 01');
  });

  /**
   * Comportamento **esperado**, não defeito: o `DataProvider` do ERP filtra só
   * nome de cliente e de vendedor (`research.md` D1). O teste existe para que
   * uma "correção" futura não transforme a limitação num bug silencioso.
   */
  it('busca pelo número da nota não devolve resultado', async () => {
    instalarFetch();
    const usuario = userEvent.setup();
    renderizar();

    await screen.findByTestId('resultados-nfce');

    await usuario.type(screen.getByTestId('campo-busca-nfce'), String(NUMERO_NOTA));

    await waitFor(() => {
      expect(screen.getByTestId('nfce-sem-resultados')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('linha-nfce')).toBeNull();
  });

  it('trocar a busca solta a seleção — o botão de carregar volta a ficar fechado', async () => {
    instalarFetch();
    const usuario = userEvent.setup();
    renderizar();

    await screen.findByTestId('resultados-nfce');
    await usuario.click(screen.getAllByTestId('linha-nfce')[0] as HTMLElement);
    expect(screen.getByTestId('confirmar-recuperacao-nfce')).toBeEnabled();

    await usuario.type(screen.getByTestId('campo-busca-nfce'), 'VAREJO');

    await waitFor(() => {
      expect(screen.getByTestId('confirmar-recuperacao-nfce')).toBeDisabled();
    });
  });
});

/* ------------------------------------------------------------------ *
 * T016 — a linha retomada fica congelada até a reinserção manual
 * ------------------------------------------------------------------ */

describe('T016 — reinserir manualmente um SKU já presente numa linha congelada', () => {
  async function retomarPrimeiro(): Promise<void> {
    const usuario = userEvent.setup();
    renderizar();

    await screen.findByTestId('resultados-nfce');
    await usuario.click(
      screen.getByTestId('linha-nfce').closest('button') ?? screen.getByTestId('linha-nfce'),
    );
    await usuario.click(screen.getByTestId('confirmar-recuperacao-nfce'));

    await waitFor(() => {
      expect(useVendaStore.getState().linhas).toHaveLength(1);
    });
  }

  it('a linha do rascunho entra congelada, com o preço do documento', async () => {
    instalarFetch({ rascunhos: [rascunhoDaLista()] });
    await retomarPrimeiro();

    const linha = useVendaStore.getState().linhas[0];
    expect(linha?.origem).toBe('RASCUNHO');
    expect(linha?.precoCongelado).toBe(true);
    // R$ 10,00 é o preço do documento; o catálogo desta base cobra outro.
    expect(linha?.precoUnitario).toBe(1000);
    expect(useVendaStore.getState().identidadeVenda).toEqual({
      origem: 'RASCUNHO',
      numeroNota: NUMERO_NOTA,
    });
  });

  /**
   * `FR-008`: a partir do carrinho retomado, reinserir o mesmo SKU dispara o
   * recálculo normal **para o item novo** — o mecanismo é da feature 003
   * (invariante I3/AD-067), e esta feature só garante que a linha do rascunho
   * ficou corretamente congelada até aqui.
   *
   * A linha congelada fica **fora** do agregado por SKU, então a inserção não a
   * absorve nem a reprecifica: nascem duas linhas do mesmo produto, uma com o
   * preço do documento e outra com o de catálogo.
   */
  it('a reinserção cria linha nova a preço de catálogo e não toca na congelada', async () => {
    instalarFetch({ rascunhos: [rascunhoDaLista()] });
    await retomarPrimeiro();

    const congeladaAntes = useVendaStore.getState().linhas[0];

    // `precosFaixa`, e não `precoBase`: o bootstrap desta suíte tem
    // `TipoPreco = 8`, então o preço sai da faixa. Precisa diferir dos R$ 10,00
    // do documento, senão a asserção não distinguiria "reprecificou" de
    // "copiou o preço congelado".
    useVendaStore.getState().inserirItem({
      origem: 'MANUAL',
      snapshot: snapshotDe({ codigoProduto: SKU_DAV, precosFaixa: [1500, 1400, 0, 0, 0] }),
      quantidade: unidades(1),
    });

    const linhas = useVendaStore.getState().linhas;
    expect(linhas).toHaveLength(2);

    const congeladaDepois = linhas.find((linha) => linha.idLinha === congeladaAntes?.idLinha);
    expect(congeladaDepois).toEqual(congeladaAntes);

    const manual = linhas.find((linha) => linha.idLinha !== congeladaAntes?.idLinha);
    expect(manual?.origem).toBe('MANUAL');
    expect(manual?.precoCongelado).toBe(false);
    expect(manual?.precoUnitario).toBe(1500);
  });
});

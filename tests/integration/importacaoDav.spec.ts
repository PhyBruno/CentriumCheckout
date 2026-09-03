import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ClienteCheckout } from '../../src/shared/schemas/cliente.schema';
import {
  importarVendaExistente,
  useListaDavs,
  type ImportacaoVendaDeps,
} from '../../src/client/services/dav/davQueries';
import type { ErpClient, ResultadoChamadaErp } from '../../src/client/services/erpClient';
import type { CarrinhoDeps } from '../../src/client/stores/slices/carrinhoSlice';
import type { ClienteDeps } from '../../src/client/stores/slices/clienteSlice';
import { criarVendaStore } from '../../src/client/stores/vendaStore';
import { clienteCheckoutDe } from '../support/cliente';
import {
  CODIGO_CLIENTE_DAV,
  CODIGO_VENDEDOR_DAV,
  NUMERO_DAV,
  NUMERO_NOTA,
  SKU_DAV,
  formaDePagamentoDoDav,
  produtoDoDav,
  respostaGetDav,
  respostaListaDavs,
} from '../support/dav';
import { snapshotDe, unidades } from '../support/precificacao';

/**
 * Orquestração da importação de DAV (T009, T019–T022).
 *
 * Os testes exercitam `importarVendaExistente` contra um `vendaStore` real
 * montado no teste — não contra a store global e não contra o hook: o serviço
 * declara portas (`ImportacaoVendaDeps`) e é exatamente essa fronteira que
 * permite substituir as features 008/012 por espiões sem montar nada delas.
 */

const CLIENTE_DEFAULT = 1;

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function erpClientDe(rotas: Record<string, unknown>, capturadas: string[] = []): ErpClient {
  return {
    chamar: (caminho: string): Promise<ResultadoChamadaErp> => {
      capturadas.push(caminho);
      const chave = Object.keys(rotas).find((rota) => caminho.startsWith(rota));
      if (chave === undefined) {
        return Promise.resolve({ estado: 'ok', resposta: respostaJson({}, 404) });
      }
      return Promise.resolve({ estado: 'ok', resposta: respostaJson(rotas[chave]) });
    },
  };
}

function montarStore() {
  let sequencia = 0;
  const depsCarrinho: CarrinhoDeps = {
    podeMutarCarrinho: () => true,
    tipoPrecoAtual: () => 8,
    clienteAtual: () => {
      const cliente = store.getState().clienteAtual;
      return cliente === null
        ? null
        : {
            codigo: cliente.codigoCliente,
            listaPreco: cliente.listaPreco,
            descontoConvenio: cliente.descontoConvenio ?? 0,
          };
    },
    gerarIdLinha: () => {
      sequencia += 1;
      return `linha-${String(sequencia)}`;
    },
  };
  const depsCliente: ClienteDeps = {
    podeMutarCarrinho: depsCarrinho.podeMutarCarrinho,
    buscarSnapshotProduto: (codigoProduto) => Promise.resolve(snapshotDe({ codigoProduto })),
  };

  const store = criarVendaStore(depsCarrinho, depsCliente);
  store.getState().resetarAuditoria('NOVA');
  return store;
}

interface Espioes {
  readonly trocarVendedor: ReturnType<typeof vi.fn>;
  readonly importarFormasDePagamento: ReturnType<typeof vi.fn>;
  readonly buscarDescricaoProduto: ReturnType<typeof vi.fn>;
  readonly resolverCliente: ReturnType<typeof vi.fn>;
}

function depsDe(
  store: ReturnType<typeof montarStore>,
  sobrescritas: Partial<ImportacaoVendaDeps> = {},
  documento: unknown = respostaGetDav(),
): { deps: ImportacaoVendaDeps; espioes: Espioes } {
  const espioes: Espioes = {
    trocarVendedor: vi.fn(),
    importarFormasDePagamento: vi.fn(),
    buscarDescricaoProduto: vi.fn(() => Promise.resolve('ARROZ TIPO 1 5KG')),
    resolverCliente: vi.fn((codigo: number) =>
      Promise.resolve(clienteCheckoutDe({ CodCliente: codigo, ClienteNome: 'CLIENTE DO DAV' })),
    ),
  };

  const venda = store.getState();
  const deps: ImportacaoVendaDeps = {
    definirIdentidadeVenda: venda.definirIdentidadeVenda,
    importarLinhasCongeladas: venda.importarLinhasCongeladas,
    editarSnapshotDescricao: venda.editarSnapshotDescricao,
    resolverCliente: espioes.resolverCliente as (codigo: number) => Promise<ClienteCheckout>,
    selecionarCliente: (cliente) => venda.selecionarCliente(cliente, 'DAV'),
    trocarVendedor: espioes.trocarVendedor,
    importarFormasDePagamento: espioes.importarFormasDePagamento,
    registrarEventoAuditoria: venda.registrarEventoAuditoria,
    buscarDescricaoProduto: espioes.buscarDescricaoProduto as (
      codigoProduto: string,
    ) => Promise<string>,
    erpClient: erpClientDe({ '/ApiCentriumOAuth/GetDav': documento }),
    ...sobrescritas,
  };

  return { deps, espioes };
}

function tiposDeEvento(store: ReturnType<typeof montarStore>): string[] {
  return store.getState().eventos.map((evento) => evento.tipo);
}

/* ------------------------------------------------------------------ *
 * T009 — parâmetros da listagem
 * ------------------------------------------------------------------ */

function envolverEmQueryClient(): { wrapper: (props: { children: ReactNode }) => ReactNode } {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return {
    wrapper: ({ children }) => createElement(QueryClientProvider, { client: queryClient }, children),
  };
}

describe('useListaDavs — parâmetros enviados (T009)', () => {
  it('reflete busca e período exatamente como aplicados pelo operador', async () => {
    const capturadas: string[] = [];
    const erpClient = erpClientDe(
      { '/ApiCentriumOAuth/ListaDAVs': respostaListaDavs() },
      capturadas,
    );

    const { result } = renderHook(
      () =>
        useListaDavs(
          {
            txtBusca: '  CLIENTE TESTE  ',
            dataInicial: '2026-06-01',
            dataFinal: '2026-06-11',
            pagina: 2,
          },
          true,
          { erpClient },
        ),
      envolverEmQueryClient(),
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const url = capturadas[0] ?? '';
    const query = new URLSearchParams(url.slice(url.indexOf('?') + 1));
    expect(query.get('Txtbusca')).toBe('CLIENTE TESTE');
    expect(query.get('Datainicial')).toBe('2026-06-01');
    expect(query.get('Datafinal')).toBe('2026-06-11');
    expect(query.get('Pagina')).toBe('2');
  });

  it('limita `Tamanhopagina` no próprio request, mesmo pedindo mais (AD-024)', async () => {
    const capturadas: string[] = [];
    const erpClient = erpClientDe(
      { '/ApiCentriumOAuth/ListaDAVs': respostaListaDavs() },
      capturadas,
    );

    const { result } = renderHook(
      () => useListaDavs({ tamanhoPagina: 500, pagina: 1 }, true, { erpClient }),
      envolverEmQueryClient(),
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const url = capturadas[0] ?? '';
    const query = new URLSearchParams(url.slice(url.indexOf('?') + 1));
    expect(query.get('Tamanhopagina')).toBe('50');
  });

  it('omite os filtros de data em branco em vez de enviá-los vazios', async () => {
    const capturadas: string[] = [];
    const erpClient = erpClientDe(
      { '/ApiCentriumOAuth/ListaDAVs': respostaListaDavs() },
      capturadas,
    );

    const { result } = renderHook(
      () => useListaDavs({ txtBusca: '', dataInicial: '', dataFinal: '' }, true, { erpClient }),
      envolverEmQueryClient(),
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const url = capturadas[0] ?? '';
    expect(url).not.toContain('Datainicial');
    expect(url).not.toContain('Datafinal');
    expect(url).not.toContain('Txtbusca');
  });

  it('não chama o ERP enquanto a janela está fechada', () => {
    const capturadas: string[] = [];
    const erpClient = erpClientDe(
      { '/ApiCentriumOAuth/ListaDAVs': respostaListaDavs() },
      capturadas,
    );

    renderHook(() => useListaDavs({}, false, { erpClient }), envolverEmQueryClient());

    expect(capturadas).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * T019 — sobrescrita de cliente e vendedor (FR-007)
 * ------------------------------------------------------------------ */

describe('importarVendaExistente — cliente e vendedor (T019, FR-007)', () => {
  it('sobrescreve cliente e vendedor mesmo com um default já selecionado', async () => {
    const store = montarStore();
    // Estado anterior: cliente default já pré-selecionado pelo início da venda.
    store.getState().inicializarClientePadrao({
      ClienteDefaultCodigo: CLIENTE_DEFAULT,
      ListaPrecoDefault: 3,
    } as never);
    expect(store.getState().clienteAtual?.codigoCliente).toBe(CLIENTE_DEFAULT);

    const { deps, espioes } = depsDe(store);
    await importarVendaExistente(NUMERO_DAV, { clienteNome: 'CLIENTE DO DAV' }, deps);

    expect(espioes.resolverCliente).toHaveBeenCalledWith(CODIGO_CLIENTE_DAV);
    expect(store.getState().clienteAtual?.codigoCliente).toBe(CODIGO_CLIENTE_DAV);
    expect(store.getState().clienteAtual?.origem).toBe('DAV');
    expect(espioes.trocarVendedor).toHaveBeenCalledWith({
      codigo: CODIGO_VENDEDOR_DAV,
      // Sem nome disponível no contrato (AD-095).
      nome: null,
    });
  });

  it('grava a identidade da venda com o NumeroNota do documento (D8, AD-107)', async () => {
    const store = montarStore();
    const { deps } = depsDe(store);

    await importarVendaExistente(NUMERO_DAV, { clienteNome: 'CLIENTE DO DAV' }, deps);

    // É este campo que `montarRetratoVenda` reenvia como `NumeroNota` em
    // `FaturarNFCe` — o único elo com o DAV de origem.
    expect(store.getState().identidadeVenda).toEqual({ origem: 'DAV', numeroNota: NUMERO_NOTA });
  });

  it('repassa as formas de pagamento do documento sem reclassificar (D6)', async () => {
    const store = montarStore();
    const { deps, espioes } = depsDe(store);

    await importarVendaExistente(NUMERO_DAV, { clienteNome: 'CLIENTE DO DAV' }, deps);

    expect(espioes.importarFormasDePagamento).toHaveBeenCalledWith([
      {
        formaCodigo: 1,
        formaMeioPagtoNFe: '01',
        valor: 1850,
        tef: null,
        pixGuid: null,
        ticketDevolucao: null,
      },
    ]);
  });
});

/* ------------------------------------------------------------------ *
 * T020 — linhas congeladas ficam fora da precificação
 * ------------------------------------------------------------------ */

describe('importarLinhasCongeladas — sem reprecificação nem evento (T020)', () => {
  it('não emite PRODUTO_INSERIDO pelas linhas importadas', async () => {
    const store = montarStore();
    const { deps } = depsDe(store);

    await importarVendaExistente(NUMERO_DAV, { clienteNome: 'CLIENTE DO DAV' }, deps);

    expect(tiposDeEvento(store)).not.toContain('PRODUTO_INSERIDO');
  });

  it('mantém o preço do documento mesmo cruzando a faixa do mesmo SKU', async () => {
    const store = montarStore();
    // Linha manual do mesmo SKU, 3 unidades: sozinha fica na faixa 1 (1000).
    store.getState().inserirItem({
      snapshot: snapshotDe({ codigoProduto: SKU_DAV }),
      quantidade: unidades(3),
      origem: 'MANUAL',
    });
    expect(store.getState().linhas[0]?.precoUnitario).toBe(1000);

    // Documento com 3 unidades do mesmo SKU a um preço próprio (777).
    const { deps } = depsDe(
      store,
      {},
      respostaGetDav({ produtos: [produtoDoDav({ quantidade: 3, precoUnitario: 7.77 })] }),
    );
    await importarVendaExistente(NUMERO_DAV, { clienteNome: 'CLIENTE DO DAV' }, deps);

    const linhas = store.getState().linhas;
    // A linha manual **não** é empurrada para a faixa 2: a congelada fica fora
    // do agregado por SKU (invariante I3, AD-067).
    expect(linhas[0]?.precoUnitario).toBe(1000);
    // E a congelada mantém exatamente o preço do documento.
    expect(linhas[1]?.precoUnitario).toBe(777);
    expect(linhas[1]?.precoCongelado).toBe(true);
    expect(linhas[1]?.origem).toBe('DAV');
  });

  it('recusa a importação com pagamento aprovado, sem tocar no carrinho', async () => {
    let sequencia = 0;
    const store = criarVendaStore({
      podeMutarCarrinho: () => false,
      tipoPrecoAtual: () => 8,
      clienteAtual: () => null,
      gerarIdLinha: () => {
        sequencia += 1;
        return `linha-${String(sequencia)}`;
      },
    });
    store.getState().resetarAuditoria('NOVA');

    store.getState().importarLinhasCongeladas([
      {
        codigoProduto: SKU_DAV,
        descricao: null,
        quantidade: unidades(1),
        precoUnitario: 1000 as never,
        descontoLinha: 0 as never,
        udm: 'UN',
      },
    ]);

    expect(store.getState().linhas).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * T021 — evento de auditoria
 * ------------------------------------------------------------------ */

describe('DAV_IMPORTADO (T021, AD-114)', () => {
  it('é emitido exatamente uma vez, com as contagens corretas', async () => {
    const store = montarStore();
    const { deps } = depsDe(
      store,
      {},
      respostaGetDav({
        produtos: [produtoDoDav(), produtoDoDav({ sequencial: 2, codigoProduto: '005678' })],
        FormasDePagamento: [
          formaDePagamentoDoDav(),
          formaDePagamentoDoDav({ FormaCodigo: 3, TEFidentificacao: 55 }),
        ],
      }),
    );

    await importarVendaExistente(NUMERO_DAV, { clienteNome: 'CLIENTE DO DAV' }, deps);

    const eventos = store.getState().eventos.filter((evento) => evento.tipo === 'DAV_IMPORTADO');
    expect(eventos).toHaveLength(1);
    expect(eventos[0]?.detalhes).toEqual({
      numeroDav: NUMERO_DAV,
      numeroNota: NUMERO_NOTA,
      quantidadeLinhas: 2,
      quantidadeFormasDePagamento: 2,
    });
  });
});

/* ------------------------------------------------------------------ *
 * T022 — descrição best-effort e tratamento de erro
 * ------------------------------------------------------------------ */

describe('resolução de descrição best-effort (T022, AD-096)', () => {
  it('preenche a descrição de cada SKU distinto sem tocar no preço', async () => {
    const store = montarStore();
    const { deps, espioes } = depsDe(store);

    await importarVendaExistente(NUMERO_DAV, { clienteNome: 'CLIENTE DO DAV' }, deps);

    await waitFor(() => {
      expect(store.getState().linhas[0]?.snapshot.descricao).toBe('ARROZ TIPO 1 5KG');
    });
    expect(espioes.buscarDescricaoProduto).toHaveBeenCalledTimes(1);
    // Preço intocado pela resolução de descrição (`FR-006`).
    expect(store.getState().linhas[0]?.precoUnitario).toBe(1000);
  });

  it('falha isolada de um SKU não bloqueia os demais nem a importação', async () => {
    const store = montarStore();
    const buscarDescricaoProduto = vi.fn((codigo: string) =>
      codigo === SKU_DAV
        ? Promise.reject(new Error('GetProduto indisponível'))
        : Promise.resolve('FEIJAO CARIOCA 1KG'),
    );

    const { deps } = depsDe(
      store,
      { buscarDescricaoProduto: buscarDescricaoProduto as (c: string) => Promise<string> },
      respostaGetDav({
        produtos: [produtoDoDav(), produtoDoDav({ sequencial: 2, codigoProduto: '005678' })],
      }),
    );

    await importarVendaExistente(NUMERO_DAV, { clienteNome: 'CLIENTE DO DAV' }, deps);

    await waitFor(() => {
      expect(store.getState().linhas[1]?.snapshot.descricao).toBe('FEIJAO CARIOCA 1KG');
    });
    // A linha cujo `GetProduto` falhou mantém o código como descrição.
    expect(store.getState().linhas[0]?.snapshot.descricao).toBe(SKU_DAV);
    expect(store.getState().linhas).toHaveLength(2);
  });
});

describe('erro de importação (D7, FR-010)', () => {
  it('DAV já faturado: propaga o erro e deixa o carrinho intacto', async () => {
    const store = montarStore();
    store.getState().inserirItem({
      snapshot: snapshotDe({ codigoProduto: '005678' }),
      quantidade: unidades(1),
      origem: 'MANUAL',
    });
    const antes = store.getState().linhas;

    const { deps } = depsDe(store, {
      // 404 do proxy: o ERP recusou o documento (já faturado por outro
      // operador). Sem lock no Checkout — só a reação ao erro (AD-052).
      erpClient: erpClientDe({}),
    });

    await expect(
      importarVendaExistente(NUMERO_DAV, { clienteNome: 'CLIENTE DO DAV' }, deps),
    ).rejects.toThrow();

    expect(store.getState().linhas).toEqual(antes);
    expect(store.getState().identidadeVenda).toEqual({ origem: 'NOVA', numeroNota: 0 });
    expect(tiposDeEvento(store)).not.toContain('DAV_IMPORTADO');
  });

  it('cliente do documento irresolvível aborta antes de popular o carrinho', async () => {
    const store = montarStore();
    const { deps, espioes } = depsDe(store, {
      resolverCliente: () => Promise.reject(new Error('cliente inexistente')),
    });

    await expect(
      importarVendaExistente(NUMERO_DAV, { clienteNome: 'CLIENTE DO DAV' }, deps),
    ).rejects.toThrow();

    // Nenhuma mutação: nem linha, nem identidade, nem vendedor, nem pagamento.
    expect(store.getState().linhas).toEqual([]);
    expect(store.getState().identidadeVenda.numeroNota).toBe(0);
    expect(espioes.trocarVendedor).not.toHaveBeenCalled();
    expect(espioes.importarFormasDePagamento).not.toHaveBeenCalled();
  });
});

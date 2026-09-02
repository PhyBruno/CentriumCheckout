import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { centavos } from '../../src/client/domain/precificacao/dinheiro';
import { totalVenda } from '../../src/client/domain/precificacao/linha';
import { milesimosDeUnidades } from '../../src/client/domain/precificacao/quantidade';
import { useInsercaoDeProduto } from '../../src/client/features/carrinho/useCarrinho';
import { useSessionStore } from '../../src/client/stores/sessionStore';
import type { CarrinhoDeps, InserirItemInput } from '../../src/client/stores/slices/carrinhoSlice';
import { criarVendaStore, useVendaStore } from '../../src/client/stores/vendaStore';
import { respostaGetProduto, snapshotDe, unidades } from '../support/precificacao';

/**
 * Invariantes de estado do carrinho (`quickstart.md`, Camada 2).
 *
 * Cobre T013, T024, T031, T033, T034 e T039.
 */

const SKU = '001234';

function depsDe(sobrescritas: Partial<CarrinhoDeps> = {}): CarrinhoDeps {
  let sequencia = 0;
  return {
    podeMutarCarrinho: () => true,
    tipoPrecoAtual: () => 8,
    clienteAtual: () => null,
    gerarIdLinha: () => {
      sequencia += 1;
      return `linha-${String(sequencia)}`;
    },
    ...sobrescritas,
  };
}

function montarStore(sobrescritas: Partial<CarrinhoDeps> = {}) {
  const store = criarVendaStore(depsDe(sobrescritas));
  store.getState().resetarAuditoria('NOVA');
  return store;
}

const produto = snapshotDe({ codigoProduto: SKU });

describe('carrinhoSlice — cenário de aceitação central (T031)', () => {
  it('cruza a faixa, recalcula todas as linhas e volta à faixa inferior no cancelamento', () => {
    const store = montarStore();

    // 1. Insere 3 unidades → faixa 1, preço 1000.
    store.getState().inserirItem({ snapshot: produto, quantidade: unidades(3), origem: 'MANUAL' });
    expect(store.getState().linhas[0]?.precoUnitario).toBe(1000);

    // 2. Insere mais 3 numa segunda linha → agregado 6, cruza a faixa: **as
    //    duas** linhas passam a 900 (SC-001).
    store.getState().inserirItem({ snapshot: produto, quantidade: unidades(3), origem: 'MANUAL' });
    expect(store.getState().linhas.map((linha) => linha.precoUnitario)).toEqual([900, 900]);
    expect(totalVenda(store.getState().linhas)).toBe(5400);

    // 3. Cancela a segunda → agregado volta a 3, a remanescente volta a 1000.
    store.getState().cancelarItem('linha-2');
    const linhas = store.getState().linhas;
    expect(linhas).toHaveLength(2);
    expect(linhas[0]?.precoUnitario).toBe(1000);
    expect(linhas[1]?.cancelada).toBe(true);
    // 4. O total não inclui a linha cancelada (SC-003).
    expect(totalVenda(linhas)).toBe(3000);
  });
});

describe('carrinhoSlice — item cancelado permanece rastreável (T033, FR-009)', () => {
  it('preserva a linha no array e a exclui da quantidade agregada e dos totais', () => {
    const store = montarStore();
    store.getState().inserirItem({ snapshot: produto, quantidade: unidades(1), origem: 'MANUAL' });

    store.getState().cancelarItem('linha-1');

    const linhas = store.getState().linhas;
    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.cancelada).toBe(true);
    expect(totalVenda(linhas)).toBe(0);
  });

  it('cancelar duas vezes a mesma linha é no-op', () => {
    const store = montarStore();
    store.getState().inserirItem({ snapshot: produto, quantidade: unidades(1), origem: 'MANUAL' });

    store.getState().cancelarItem('linha-1');
    store.getState().cancelarItem('linha-1');

    expect(
      store.getState().eventos.filter((evento) => evento.tipo === 'PRODUTO_CANCELADO'),
    ).toHaveLength(1);
  });
});

describe('carrinhoSlice — cancelamento sem supervisor (T034, FR-012, AD-065)', () => {
  it('cancela consultando apenas podeMutarCarrinho, sem nenhuma outra autorização', () => {
    const consultas: string[] = [];
    const store = montarStore({
      podeMutarCarrinho: () => {
        consultas.push('podeMutarCarrinho');
        return true;
      },
    });
    store.getState().inserirItem({ snapshot: produto, quantidade: unidades(1), origem: 'MANUAL' });
    consultas.length = 0;

    store.getState().cancelarItem('linha-1');

    expect(consultas).toEqual(['podeMutarCarrinho']);
    expect(store.getState().linhas[0]?.cancelada).toBe(true);
  });
});

describe('carrinhoSlice — bloqueio pós-pagamento (T039, FR-010, AD-030)', () => {
  it('editarItem e cancelarItem viram no-op com o predicado injetado em false', () => {
    // Insere com o carrinho liberado e só então bloqueia, como acontece quando
    // um pagamento é aprovado no meio da venda.
    let liberado = true;
    const store = montarStore({ podeMutarCarrinho: () => liberado });
    store.getState().inserirItem({ snapshot: produto, quantidade: unidades(3), origem: 'MANUAL' });
    const antes = store.getState().linhas;

    liberado = false;
    store.getState().editarItem('linha-1', 'quantidade', milesimosDeUnidades(10));
    store.getState().cancelarItem('linha-1');

    expect(store.getState().linhas).toBe(antes);
    expect(store.getState().linhas[0]?.quantidade).toBe(3000);
    expect(store.getState().linhas[0]?.cancelada).toBe(false);
  });

  it('avisa o operador em vez de falhar em silêncio', () => {
    const avisar = vi.fn();
    const store = montarStore({ podeMutarCarrinho: () => false, avisar });

    store.getState().inserirItem({ snapshot: produto, quantidade: unidades(1), origem: 'MANUAL' });

    expect(store.getState().linhas).toHaveLength(0);
    expect(avisar).toHaveBeenCalledOnce();
  });
});

describe('carrinhoSlice — linha congelada (FR-017, AD-067, D3)', () => {
  it('mantém o preço e fica fora do agregado que decide a faixa das demais', () => {
    const store = montarStore();

    store.getState().inserirItem({
      snapshot: produto,
      quantidade: unidades(10),
      origem: 'DAV',
      precoUnitario: centavos(500),
    });
    store.getState().inserirItem({ snapshot: produto, quantidade: unidades(3), origem: 'MANUAL' });

    const linhas = store.getState().linhas;
    expect(linhas[0]?.precoCongelado).toBe(true);
    expect(linhas[0]?.precoUnitario).toBe(500);
    // As 10 unidades congeladas cruzariam o limiar 5 se contassem no agregado.
    expect(linhas[1]?.precoUnitario).toBe(1000);
  });

  it('descongela por edição explícita e passa a participar do recálculo (I6)', () => {
    const store = montarStore();
    store.getState().inserirItem({
      snapshot: produto,
      quantidade: unidades(10),
      origem: 'DAV',
      precoUnitario: centavos(500),
    });

    store.getState().editarItem('linha-1', 'quantidade', milesimosDeUnidades(6));

    const linha = store.getState().linhas[0];
    expect(linha?.precoCongelado).toBe(false);
    expect(linha?.precoUnitario).toBe(900);
  });
});

describe('carrinhoSlice — precoUnitario obrigatório para origem congelada (FR-017, AD-067)', () => {
  it('recusa em tempo de compilação inserir origem DAV sem precoUnitario', () => {
    const store = montarStore();

    expect(() => {
      // @ts-expect-error — `InserirItemInput` exige `precoUnitario` quando
      // `origem` é `'DAV'`; sem essa checagem em tipo, o preço vivo de hoje
      // entraria em silêncio no lugar do preço congelado do documento.
      store.getState().inserirItem({ snapshot: produto, quantidade: unidades(1), origem: 'DAV' });
    }).toThrow(/precoUnitario/);
  });

  it('recusa em tempo de compilação inserir origem RASCUNHO sem precoUnitario', () => {
    const store = montarStore();

    expect(() => {
      // @ts-expect-error — mesma invariante para `'RASCUNHO'`.
      store.getState().inserirItem({
        snapshot: produto,
        quantidade: unidades(1),
        origem: 'RASCUNHO',
      });
    }).toThrow(/precoUnitario/);
  });

  it('recusa em runtime mesmo quando o caller não é totalmente tipado (ex.: payload do ERP)', () => {
    const store = montarStore();

    // Simula uma entrada vinda de fora do domínio TS — ex.: um objeto
    // resultante do parse de um payload de importação de DAV (feature 006)
    // ou de retomada de rascunho (feature 004) — onde o compilador não pode
    // garantir a invariante e só a checagem em runtime a protege.
    const payloadNaoTipado: unknown = {
      snapshot: produto,
      quantidade: unidades(1),
      origem: 'DAV',
    };

    expect(() => {
      store.getState().inserirItem(payloadNaoTipado as InserirItemInput);
    }).toThrow('precoUnitario');
    expect(store.getState().linhas).toHaveLength(0);
  });

  it('aceita normalmente quando precoUnitario é informado para origem congelada', () => {
    const store = montarStore();

    expect(() => {
      store.getState().inserirItem({
        snapshot: produto,
        quantidade: unidades(1),
        origem: 'DAV',
        precoUnitario: centavos(500),
      });
    }).not.toThrow();
    expect(store.getState().linhas).toHaveLength(1);
  });
});

describe('carrinhoSlice — desconto de convênio e troca de cliente (T028/T029, FR-018)', () => {
  it('aplica o desconto de convênio do cliente atual sobre o total da linha', () => {
    const store = montarStore({
      clienteAtual: () => ({ codigo: 7, listaPreco: null, descontoConvenio: 10 }),
    });

    store.getState().inserirItem({ snapshot: produto, quantidade: unidades(6), origem: 'MANUAL' });

    // Faixa 2 (900) × 6 = 5400; 10% = 540.
    expect(store.getState().linhas[0]?.descontoConvenio).toBe(540);
  });

  it('reprecifica todas as linhas ativas quando o cliente da venda muda', () => {
    let cliente: { codigo: number; listaPreco: number | null; descontoConvenio: number } | null =
      null;
    const store = montarStore({ clienteAtual: () => cliente });
    store.getState().inserirItem({ snapshot: produto, quantidade: unidades(6), origem: 'MANUAL' });
    expect(store.getState().linhas[0]?.descontoConvenio).toBe(0);

    cliente = { codigo: 7, listaPreco: null, descontoConvenio: 10 };
    store.getState().reprecificarPorTrocaDeCliente();

    expect(store.getState().linhas[0]?.descontoConvenio).toBe(540);
  });

  it('zera só o desconto de convênio ao trocar para um cliente sem convênio (AD-108, bug confirmado na revisão)', () => {
    let cliente: { codigo: number; listaPreco: number | null; descontoConvenio: number } = {
      codigo: 7,
      listaPreco: null,
      descontoConvenio: 10,
    };
    const store = montarStore({ clienteAtual: () => cliente });
    store.getState().inserirItem({ snapshot: produto, quantidade: unidades(6), origem: 'MANUAL' });
    expect(store.getState().linhas[0]?.descontoConvenio).toBe(540);

    // Cliente default (AD-108): sem convênio.
    cliente = { codigo: 1, listaPreco: null, descontoConvenio: 0 };
    store.getState().reprecificarPorTrocaDeCliente();

    expect(store.getState().linhas[0]?.descontoConvenio).toBe(0);
  });

  it("preserva o desconto manual de um produto 'E' quando o cliente ativo passa a ter convênio", () => {
    let cliente: { codigo: number; listaPreco: number | null; descontoConvenio: number } | null =
      null;
    const store = montarStore({ clienteAtual: () => cliente });
    // Produto 'E' revisado pelo operador: desconto manual de 100 centavos.
    store.getState().inserirItem({
      snapshot: produto,
      quantidade: unidades(6),
      origem: 'MANUAL',
      descontoManual: centavos(100),
    });
    expect(store.getState().linhas[0]?.descontoManual).toBe(100);
    expect(store.getState().linhas[0]?.descontoConvenio).toBe(0);

    cliente = { codigo: 7, listaPreco: null, descontoConvenio: 10 };
    store.getState().reprecificarPorTrocaDeCliente();

    // O desconto manual sobrevive intacto; o de convênio entra à parte.
    expect(store.getState().linhas[0]?.descontoManual).toBe(100);
    expect(store.getState().linhas[0]?.descontoConvenio).toBe(540);
  });
});

describe('carrinhoSlice — auditoria (AD-061, D11)', () => {
  it('emite um evento por ação do operador e nenhum por reprecificação automática', () => {
    const store = montarStore();

    store.getState().inserirItem({ snapshot: produto, quantidade: unidades(3), origem: 'MANUAL' });
    // Esta segunda inserção reprecifica a primeira linha; a reprecificação não
    // pode gerar um `PRODUTO_ALTERADO` que o operador não causou.
    store.getState().inserirItem({ snapshot: produto, quantidade: unidades(3), origem: 'MANUAL' });
    store.getState().cancelarItem('linha-2');

    const tipos = store.getState().eventos.map((evento) => evento.tipo);
    expect(tipos).toEqual([
      'VENDA_INICIADA',
      'PRODUTO_INSERIDO',
      'PRODUTO_INSERIDO',
      'PRODUTO_CANCELADO',
    ]);
  });

  it('registra o preço já reprecificado no evento de inserção', () => {
    const store = montarStore();

    store.getState().inserirItem({ snapshot: produto, quantidade: unidades(6), origem: 'MANUAL' });

    const evento = store.getState().eventos.at(-1);
    expect(evento?.tipo).toBe('PRODUTO_INSERIDO');
    expect(evento?.detalhes).toMatchObject({
      codigoProduto: SKU,
      quantidade: 6000,
      precoUnitario: 900,
      desconto: 0,
    });
  });

  it('reprecificarPorTrocaDeCliente não emite evento próprio', () => {
    const store = montarStore({
      clienteAtual: () => ({ codigo: 7, listaPreco: null, descontoConvenio: 10 }),
    });
    store.getState().inserirItem({ snapshot: produto, quantidade: unidades(6), origem: 'MANUAL' });
    const antes = store.getState().eventos.length;

    store.getState().reprecificarPorTrocaDeCliente();

    expect(store.getState().eventos).toHaveLength(antes);
  });
});

describe('carrinhoSlice — limparCarrinho', () => {
  it('esvazia as linhas, canceladas inclusive', () => {
    const store = montarStore();
    store.getState().inserirItem({ snapshot: produto, quantidade: unidades(1), origem: 'MANUAL' });
    store.getState().cancelarItem('linha-1');

    store.getState().limparCarrinho();

    expect(store.getState().linhas).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ *
 * Caminho de rede: a linha vem sempre de GetProduto (T013, T024)
 * ------------------------------------------------------------------ */

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
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }) => createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('inserção pela rede — GetProduto é sempre quem resolve a linha', () => {
  beforeEach(() => {
    useSessionStore.setState({ estado: 'pronto', registro: registroDeBootstrap() });
    useVendaStore.setState({ linhas: [] });
    useVendaStore.getState().resetarAuditoria('NOVA');
  });

  it('a seleção no modal de busca dispara GetProduto, nunca monta da lista (T013, AD-091)', async () => {
    const urls: string[] = [];
    const fetchFalso = vi.fn((url: string) => {
      urls.push(url);
      return Promise.resolve(
        new Response(JSON.stringify({ Produto: respostaGetProduto() }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });
    vi.stubGlobal('fetch', fetchFalso);

    // Caminho real desde a Fase 8 (`EntradaRapidaProduto.selecionarDaBusca`):
    // o modal só devolve o código, quem resolve é `revisarPorCodigo` (com
    // `origemForcada: 'BUSCA'`) seguido de `confirmarPrevia` — nunca um
    // atalho de inserção direta a partir do resultado da busca.
    const { result } = renderHook(() => useInsercaoDeProduto(), {
      wrapper: envolverComQueryClient(),
    });
    const revisao = await result.current.revisarPorCodigo(SKU, 'BUSCA');
    if (revisao.situacao !== 'revisao') {
      throw new Error('esperava revisão bem-sucedida');
    }
    result.current.confirmarPrevia(revisao, revisao.quantidade);

    await waitFor(() => {
      expect(useVendaStore.getState().linhas).toHaveLength(1);
    });
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('/api/erp/ApiCentriumOAuth/GetProduto');
    expect(urls[0]).toContain(`Codigoproduto=${SKU}`);
    // `Tipocodproduto` é sempre o da sessão, nunca inferido por chamada (AD-033).
    expect(urls[0]).toContain('Tipocodproduto=I');
    expect(useVendaStore.getState().linhas[0]?.origem).toBe('BUSCA');
  });

  it('reinserir o mesmo SKU não gera nova chamada a GetProduto (T024, CART-03)', async () => {
    const fetchFalso = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ Produto: respostaGetProduto() }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchFalso);

    const { result } = renderHook(() => useInsercaoDeProduto(), {
      wrapper: envolverComQueryClient(),
    });
    await result.current.inserirPorCodigo(SKU);
    await result.current.inserirPorCodigo(SKU);

    await waitFor(() => {
      expect(useVendaStore.getState().linhas).toHaveLength(2);
    });
    expect(fetchFalso).toHaveBeenCalledTimes(1);
  });

  it('produto não encontrado não insere linha nenhuma', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('', { status: 404 }))),
    );

    const { result } = renderHook(() => useInsercaoDeProduto(), {
      wrapper: envolverComQueryClient(),
    });
    const resultado = await result.current.inserirPorCodigo('000000');

    expect(resultado.situacao).toBe('recusado');
    expect(useVendaStore.getState().linhas).toHaveLength(0);
  });

  it('produto pesável sem PrecoVenda bloqueia a inserção (FR-013)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              Produto: respostaGetProduto({ PrecoVenda: 0, ProdutoPesavelEditavel: 'S' }),
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        ),
      ),
    );

    const { result } = renderHook(() => useInsercaoDeProduto(), {
      wrapper: envolverComQueryClient(),
    });
    // EAN-13 sintético de balança: prefixo 2, código reduzido 001234, R$ 15,00.
    const resultado = await result.current.inserirPorCodigo('2001234015004');

    expect(resultado.situacao).toBe('recusado');
    expect(useVendaStore.getState().linhas).toHaveLength(0);
  });

  it('produto editável não entra na venda ao confirmar a entrada (FR-014)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ Produto: respostaGetProduto({ ProdutoPesavelEditavel: 'E' }) }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        ),
      ),
    );

    const { result } = renderHook(() => useInsercaoDeProduto(), {
      wrapper: envolverComQueryClient(),
    });
    const resultado = await result.current.inserirPorCodigo(SKU);

    expect(resultado.situacao).toBe('edicao');
    expect(useVendaStore.getState().linhas).toHaveLength(0);
  });

  it('"codigo*3" insere com quantidade 3 e o código simples com quantidade 1', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ Produto: respostaGetProduto() }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      ),
    );

    const { result } = renderHook(() => useInsercaoDeProduto(), {
      wrapper: envolverComQueryClient(),
    });
    await result.current.inserirPorCodigo(`${SKU}*3`);
    await result.current.inserirPorCodigo(SKU);

    await waitFor(() => {
      expect(useVendaStore.getState().linhas).toHaveLength(2);
    });
    expect(useVendaStore.getState().linhas.map((linha) => linha.quantidade)).toEqual([3000, 1000]);
  });
});

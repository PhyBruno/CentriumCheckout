import { describe, expect, it, vi } from 'vitest';
import type { SnapshotPrecoProduto } from '../../src/client/domain/precificacao/linha';
import type { CarrinhoDeps } from '../../src/client/stores/slices/carrinhoSlice';
import type { ClienteDeps } from '../../src/client/stores/slices/clienteSlice';
import type { VendedorDeps } from '../../src/client/stores/slices/vendedorSlice';
import {
  criarVendaStore,
  identidadeVendaDepsPadrao,
  pagamentoDepsPadrao,
} from '../../src/client/stores/vendaStore';
import { registroBootstrapDe } from '../support/sessao';
import { snapshotDe, unidades } from '../support/precificacao';

/**
 * Invariantes de estado do vendedor da venda (`quickstart.md`, Cenários 1-7).
 *
 * Cobre T004, T005, T006, T007, T008 e T009.
 *
 * A composição é a **real** (`criarVendaStore`), com duplos só nas portas
 * injetadas: é ela que garante que `registrarEventoAuditoria` seja o mesmo
 * dispatcher da produção e que `podeMutarCarrinho()` chegue ao slice pelo mesmo
 * caminho de carrinho e cliente (AD-043).
 */

interface Montagem {
  readonly store: ReturnType<typeof criarVendaStore>;
  readonly avisar: ReturnType<typeof vi.fn>;
  readonly buscarSnapshotProduto: ReturnType<typeof vi.fn>;
}

function montarStore(podeMutarCarrinho = true): Montagem {
  let sequencia = 0;
  const avisar = vi.fn((_mensagem: string) => undefined);

  // Nenhum teste desta suíte troca de cliente; a porta existe só para a
  // composição real ficar completa — e reprovar alto se alguma coisa a chamar.
  const buscarSnapshotProduto = vi.fn((): Promise<SnapshotPrecoProduto> =>
    Promise.reject(new Error('busca de produto não é exercitada nesta suíte')),
  );

  const depsCarrinho: CarrinhoDeps = {
    podeMutarCarrinho: () => podeMutarCarrinho,
    tipoPrecoAtual: () => 1,
    clienteAtual: () => null,
    gerarIdLinha: () => {
      sequencia += 1;
      return `linha-${String(sequencia)}`;
    },
    avisar,
  };

  const depsCliente: ClienteDeps = {
    podeMutarCarrinho: depsCarrinho.podeMutarCarrinho,
    buscarSnapshotProduto,
  };

  const depsVendedor: VendedorDeps = {
    podeMutarCarrinho: depsCarrinho.podeMutarCarrinho,
    avisar,
  };

  const store = criarVendaStore(
    depsCarrinho,
    depsCliente,
    identidadeVendaDepsPadrao(depsCarrinho),
    pagamentoDepsPadrao,
    depsVendedor,
  );
  store.getState().resetarAuditoria('NOVA');
  return { store, avisar, buscarSnapshotProduto };
}

function tiposDeEvento(store: Montagem['store']): string[] {
  return store.getState().eventos.map((evento) => evento.tipo);
}

/** Só os eventos que a feature 012 produz — `VENDA_INICIADA` é da 001. */
function eventosDeVendedor(store: Montagem['store']) {
  return store.getState().eventos.filter((evento) => evento.tipo.startsWith('VENDEDOR_'));
}

/** Uma linha ativa no carrinho, para os cenários de "carrinho já populado". */
function popularCarrinho(store: Montagem['store']): void {
  store.getState().inserirItem({
    snapshot: snapshotDe(),
    quantidade: unidades(1),
    origem: 'MANUAL',
  });
  expect(store.getState().linhas).toHaveLength(1);
}

describe('inicializarVendedorPadrao (T004, T005)', () => {
  it('produz o snapshot do quickstart sem evento e sem chamada de rede', () => {
    const { store } = montarStore();

    store.getState().inicializarVendedorPadrao(
      registroBootstrapDe({
        VendedorCodigo: 7,
        VendedorNome: 'Fulano',
      }).SessaoUsuario,
    );

    expect(store.getState().vendedorAtual).toEqual({
      codigo: 7,
      nome: 'Fulano',
      origem: 'DEFAULT',
    });
    // A pré-seleção automática não é ação do operador (I3, `research.md` D3/D6).
    expect(tiposDeEvento(store)).toEqual(['VENDA_INICIADA']);
    // `GetListaVendedores` não é chamado: os dois campos vêm do bootstrap. A
    // ausência de qualquer porta de rede no `VendedorDeps` é o que torna isso
    // verdadeiro por construção — não há como o slice buscar nada.
    expect(store.getState().houveEscolhaExplicitaDeVendedor).toBe(false);
  });

  it('deixa vendedorAtual em null quando não há default configurado (FR-006)', () => {
    const { store } = montarStore();

    store
      .getState()
      .inicializarVendedorPadrao(registroBootstrapDe({ VendedorCodigo: 0 }).SessaoUsuario);

    expect(store.getState().vendedorAtual).toBeNull();
  });

  it('deixa vendedorAtual em null quando o bootstrap nem traz o campo', () => {
    const { store } = montarStore();

    // `VendedorCodigo` é `optional()` no schema: a empresa sem vendedor
    // configurado simplesmente não publica o campo (`bootstrap.schema.ts`).
    store.getState().inicializarVendedorPadrao(registroBootstrapDe().SessaoUsuario);

    expect(store.getState().vendedorAtual).toBeNull();
  });

  it('nunca deriva o vendedor do operador logado (FR-008, SC-001, I6)', () => {
    const { store } = montarStore();

    store.getState().inicializarVendedorPadrao(
      registroBootstrapDe({
        VendedorCodigo: 7,
        VendedorNome: 'Fulano',
        UsuarioCodigo: 99,
      }).SessaoUsuario,
    );

    // Confirmado por teste, e não só pelo design do tipo: `VendedorVenda` não
    // tem nenhum caminho a partir de `UsuarioCodigo`, e os dois campos são
    // genuinamente distintos no contrato (AD-056, Fato F1).
    expect(store.getState().vendedorAtual?.codigo).toBe(7);
    expect(store.getState().vendedorAtual?.codigo).not.toBe(99);
  });
});

describe('selecionarVendedor (T006, T007)', () => {
  it('dispara VENDEDOR_SELECIONADO na primeira escolha explícita da sessão', () => {
    const { store } = montarStore();
    store
      .getState()
      .inicializarVendedorPadrao(
        registroBootstrapDe({ VendedorCodigo: 7, VendedorNome: 'Fulano' }).SessaoUsuario,
      );

    store.getState().selecionarVendedor({ codigo: 10, nome: 'Ciclana' });

    expect(store.getState().vendedorAtual).toEqual({
      codigo: 10,
      nome: 'Ciclana',
      origem: 'BUSCA',
    });
    expect(eventosDeVendedor(store)).toHaveLength(1);
    expect(eventosDeVendedor(store)[0]).toMatchObject({
      tipo: 'VENDEDOR_SELECIONADO',
      detalhes: { codigoVendedor: 10, nome: 'Ciclana' },
    });
  });

  it('dispara VENDEDOR_TROCADO na substituição, com o carrinho já populado e sem reprecificar', () => {
    const { store, buscarSnapshotProduto } = montarStore();
    store
      .getState()
      .inicializarVendedorPadrao(
        registroBootstrapDe({ VendedorCodigo: 7, VendedorNome: 'Fulano' }).SessaoUsuario,
      );
    popularCarrinho(store);

    const antes = store.getState().linhas;
    store.getState().selecionarVendedor({ codigo: 10, nome: 'Ciclana' });
    store.getState().selecionarVendedor({ codigo: 11, nome: 'Beltrana' });

    expect(store.getState().vendedorAtual?.codigo).toBe(11);
    expect(eventosDeVendedor(store).map((evento) => evento.tipo)).toEqual([
      'VENDEDOR_SELECIONADO',
      'VENDEDOR_TROCADO',
    ]);
    expect(eventosDeVendedor(store)[1]).toMatchObject({
      tipo: 'VENDEDOR_TROCADO',
      detalhes: { codigoVendedorAnterior: 10, codigoVendedorNovo: 11 },
    });

    // `FR-012`: a troca com carrinho populado é permitida e **não** reprecifica
    // — preço de venda não depende de vendedor em nenhum `TipoPreco` documentado
    // (AD-059/AD-060), ao contrário da troca de cliente (`TipoPreco = 9`).
    expect(buscarSnapshotProduto).not.toHaveBeenCalled();
    expect(store.getState().linhas).toEqual(antes);
  });

  it('não registra evento ao reescolher o vendedor que já está na venda', () => {
    const { store } = montarStore();

    store.getState().selecionarVendedor({ codigo: 10, nome: 'Ciclana' });
    store.getState().selecionarVendedor({ codigo: 10, nome: 'Ciclana' });

    // Registrar `VENDEDOR_TROCADO` com anterior === novo mandaria ao ERP, no
    // `Log` de `FaturarNFCe`, uma troca que não aconteceu.
    expect(eventosDeVendedor(store).map((evento) => evento.tipo)).toEqual(['VENDEDOR_SELECIONADO']);
  });
});

describe('bloqueio pós-pagamento (T008)', () => {
  it('selecionarVendedor é no-op com podeMutarCarrinho() falso (FR-013, VEND-09)', () => {
    const { store, avisar } = montarStore(false);
    store
      .getState()
      .inicializarVendedorPadrao(
        registroBootstrapDe({ VendedorCodigo: 7, VendedorNome: 'Fulano' }).SessaoUsuario,
      );

    store.getState().selecionarVendedor({ codigo: 10, nome: 'Ciclana' });

    expect(store.getState().vendedorAtual).toEqual({
      codigo: 7,
      nome: 'Fulano',
      origem: 'DEFAULT',
    });
    expect(eventosDeVendedor(store)).toEqual([]);
    // No-op **com aviso**, nunca exceção (I4): o operador precisa saber por que
    // a lista fechou sem mudar nada.
    expect(avisar).toHaveBeenCalledOnce();
  });
});

describe('trocarVendedor (T009)', () => {
  it('sobrescreve incondicionalmente, sem evento e sem mexer na escolha explícita', () => {
    const { store } = montarStore(false);
    store
      .getState()
      .inicializarVendedorPadrao(
        registroBootstrapDe({ VendedorCodigo: 7, VendedorNome: 'Fulano' }).SessaoUsuario,
      );

    // Mesmo com `podeMutarCarrinho()` falso: neste momento a venda inteira está
    // sendo substituída pelo documento carregado, não é uma troca no meio da
    // digitação (`contracts/vendedor-domain-api.md`).
    store.getState().trocarVendedor({ codigo: 33, nome: null }, 'RASCUNHO');

    expect(store.getState().vendedorAtual).toEqual({
      codigo: 33,
      nome: null,
      origem: 'RASCUNHO',
    });
    expect(eventosDeVendedor(store)).toEqual([]);
    expect(store.getState().houveEscolhaExplicitaDeVendedor).toBe(false);
  });

  it('aplica o default DAV quando chamado com dois argumentos', () => {
    const { store } = montarStore();

    // Compatibilidade com a chamada que a feature 006 já reservou em
    // `specs/006-importacao-dav/contracts/importacao-domain-api.md`.
    store.getState().trocarVendedor({ codigo: 33, nome: null });

    expect(store.getState().vendedorAtual?.origem).toBe('DAV');
  });

  it('a próxima escolha do operador ainda conta como primeira seleção', () => {
    const { store } = montarStore();

    store.getState().trocarVendedor({ codigo: 33, nome: null }, 'RASCUNHO');
    store.getState().selecionarVendedor({ codigo: 10, nome: 'Ciclana' });

    // I3: a sobrescrita programática não é escolha desta sessão, então o
    // primeiro gesto do operador continua sendo `VENDEDOR_SELECIONADO`.
    expect(eventosDeVendedor(store).map((evento) => evento.tipo)).toEqual(['VENDEDOR_SELECIONADO']);
  });
});

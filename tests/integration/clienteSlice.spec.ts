import { beforeEach, describe, expect, it, vi } from 'vitest';
import { centavos } from '../../src/client/domain/precificacao/dinheiro';
import type { SnapshotPrecoProduto } from '../../src/client/domain/precificacao/linha';
import type { CarrinhoDeps } from '../../src/client/stores/slices/carrinhoSlice';
import type { ClienteDeps } from '../../src/client/stores/slices/clienteSlice';
import { criarVendaStore } from '../../src/client/stores/vendaStore';
import { clienteCheckoutDe } from '../support/cliente';
import { registroBootstrapDe } from '../support/sessao';
import { snapshotDe, unidades } from '../support/precificacao';

/**
 * Invariantes de estado do cliente da venda (`quickstart.md`, Camada 2).
 *
 * Cobre T009, T010, T011, T012, T013 e T021.
 */

const SKU_A = '001234';
const SKU_B = '005678';
const SKU_CONGELADO = '009999';

interface Montagem {
  readonly store: ReturnType<typeof criarVendaStore>;
  readonly buscarSnapshotProduto: ReturnType<typeof vi.fn>;
}

function montarStore(
  sobrescritasCliente: Partial<ClienteDeps> = {},
  sobrescritasCarrinho: Partial<CarrinhoDeps> = {},
): Montagem {
  let sequencia = 0;

  // Devolve o mesmo SKU com preço novo — é o que o ERP faria sob outra lista de
  // preço (`TipoPreco = 9`).
  const buscarSnapshotProduto = vi.fn(
    async (codigoProduto: string): Promise<SnapshotPrecoProduto> =>
      snapshotDe({ codigoProduto, precoBase: 800, precosFaixa: [800, 700, 0, 0, 0] }),
  );

  const depsCarrinho: CarrinhoDeps = {
    podeMutarCarrinho: () => true,
    tipoPrecoAtual: () => 1,
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
    ...sobrescritasCarrinho,
  };

  const depsCliente: ClienteDeps = {
    podeMutarCarrinho: depsCarrinho.podeMutarCarrinho,
    buscarSnapshotProduto,
    ...sobrescritasCliente,
  };

  const store = criarVendaStore(depsCarrinho, depsCliente);
  store.getState().resetarAuditoria('NOVA');
  return { store, buscarSnapshotProduto };
}

function tiposDeEvento(store: Montagem['store']): string[] {
  return store.getState().eventos.map((evento) => evento.tipo);
}

/** Só os eventos que a feature 005 produz — `VENDA_INICIADA` é da 001. */
function eventosDeCliente(store: Montagem['store']) {
  return store.getState().eventos.filter((evento) => evento.tipo.startsWith('CLIENTE_'));
}

describe('inicializarClientePadrao (T009)', () => {
  it('produz o snapshot do quickstart sem evento e sem chamada de rede', () => {
    const { store, buscarSnapshotProduto } = montarStore();

    store.getState().inicializarClientePadrao(
      registroBootstrapDe({
        ClienteDefaultCodigo: 42,
        ClienteDefaultNome: 'Fulano',
        ListaPrecoDefault: 3,
      }).SessaoUsuario,
    );

    expect(store.getState().clienteAtual).toEqual({
      codigoCliente: 42,
      nome: 'Fulano',
      documento: null,
      celular: null,
      listaPreco: 3,
      descontoConvenio: 0,
      codigoConvenio: null,
      origem: 'DEFAULT',
    });
    // A pré-seleção automática não é ação do operador (I3, `research.md` D9).
    expect(tiposDeEvento(store)).toEqual(['VENDA_INICIADA']);
    expect(buscarSnapshotProduto).not.toHaveBeenCalled();
    // `houveEscolhaExplicita` continua falso: a próxima escolha do operador
    // ainda é uma *seleção*, não uma troca.
    expect(store.getState().houveEscolhaExplicita).toBe(false);
  });

  it('deixa clienteAtual em null quando não há default configurado (FR-005)', () => {
    const { store } = montarStore();

    store
      .getState()
      .inicializarClientePadrao(registroBootstrapDe({ ClienteDefaultCodigo: 0 }).SessaoUsuario);

    expect(store.getState().clienteAtual).toBeNull();
  });
});

describe('selecionarCliente (T010, T011)', () => {
  it('dispara CLIENTE_SELECIONADO na primeira escolha explícita', async () => {
    const { store } = montarStore();

    await store
      .getState()
      .selecionarCliente(
        clienteCheckoutDe({ CodCliente: 1255, nome: 'FULANO' }),
        'BUSCA_DOCUMENTO',
      );

    expect(eventosDeCliente(store)).toEqual([
      expect.objectContaining({
        tipo: 'CLIENTE_SELECIONADO',
        detalhes: { codigoCliente: 1255, nome: 'FULANO' },
      }),
    ]);
    expect(store.getState().clienteAtual?.origem).toBe('BUSCA_DOCUMENTO');
  });

  it('dispara CLIENTE_SELECIONADO mesmo por cima do default pré-selecionado (D9)', async () => {
    const { store } = montarStore();
    store
      .getState()
      .inicializarClientePadrao(
        registroBootstrapDe({ ClienteDefaultCodigo: 42, ClienteDefaultNome: 'Padrão' })
          .SessaoUsuario,
      );

    await store
      .getState()
      .selecionarCliente(clienteCheckoutDe({ CodCliente: 1255 }), 'BUSCA_LIVRE');

    expect(eventosDeCliente(store).map((evento) => evento.tipo)).toEqual(['CLIENTE_SELECIONADO']);
  });

  it('dispara CLIENTE_TROCADO na substituição de uma escolha explícita', async () => {
    const { store } = montarStore();

    await store
      .getState()
      .selecionarCliente(clienteCheckoutDe({ CodCliente: 10 }), 'BUSCA_DOCUMENTO');
    await store.getState().selecionarCliente(clienteCheckoutDe({ CodCliente: 20 }), 'BUSCA_LIVRE');

    expect(eventosDeCliente(store).map((evento) => evento.tipo)).toEqual([
      'CLIENTE_SELECIONADO',
      'CLIENTE_TROCADO',
    ]);
    expect(eventosDeCliente(store)[1]?.detalhes).toEqual({
      codigoClienteAnterior: 10,
      codigoClienteNovo: 20,
    });
  });
});

describe('bloqueio pós-pagamento (T012)', () => {
  it('é no-op sem evento quando podeMutarCarrinho() é falso', async () => {
    const avisar = vi.fn();
    const { store, buscarSnapshotProduto } = montarStore(
      { podeMutarCarrinho: () => false, avisar },
      { podeMutarCarrinho: () => false },
    );
    store
      .getState()
      .inicializarClientePadrao(
        registroBootstrapDe({ ClienteDefaultCodigo: 42, ClienteDefaultNome: 'Padrão' })
          .SessaoUsuario,
      );

    await store
      .getState()
      .selecionarCliente(clienteCheckoutDe({ CodCliente: 1255 }), 'BUSCA_LIVRE');

    expect(store.getState().clienteAtual?.codigoCliente).toBe(42);
    expect(eventosDeCliente(store)).toEqual([]);
    expect(buscarSnapshotProduto).not.toHaveBeenCalled();
    expect(avisar).toHaveBeenCalledOnce();
  });
});

describe('re-fetch de preço por SKU na troca de cliente (T013)', () => {
  function comCarrinhoPopulado(): Montagem {
    const montagem = montarStore();
    const inserir = montagem.store.getState().inserirItem;

    inserir({
      snapshot: snapshotDe({ codigoProduto: SKU_A }),
      quantidade: unidades(2),
      origem: 'MANUAL',
    });
    inserir({
      snapshot: snapshotDe({ codigoProduto: SKU_A }),
      quantidade: unidades(1),
      origem: 'MANUAL',
    });
    inserir({
      snapshot: snapshotDe({ codigoProduto: SKU_B }),
      quantidade: unidades(1),
      origem: 'BUSCA',
    });
    inserir({
      snapshot: snapshotDe({ codigoProduto: SKU_CONGELADO }),
      quantidade: unidades(1),
      origem: 'DAV',
      precoUnitario: centavos(1234),
    });

    return montagem;
  }

  it('chama GetProduto uma vez por SKU ativo distinto, nunca pelo congelado', async () => {
    const { store, buscarSnapshotProduto } = comCarrinhoPopulado();

    await store.getState().selecionarCliente(clienteCheckoutDe({ CodCliente: 77 }), 'BUSCA_LIVRE');

    expect(buscarSnapshotProduto).toHaveBeenCalledTimes(2);
    const skusConsultados = buscarSnapshotProduto.mock.calls.map(([sku]) => sku).sort();
    expect(skusConsultados).toEqual([SKU_A, SKU_B].sort());
    expect(skusConsultados).not.toContain(SKU_CONGELADO);
  });

  it('aplica o preço novo às linhas ativas e preserva o preço congelado', async () => {
    const { store } = comCarrinhoPopulado();

    await store.getState().selecionarCliente(clienteCheckoutDe({ CodCliente: 77 }), 'BUSCA_LIVRE');

    const porSku = (sku: string) =>
      store.getState().linhas.filter((linha) => linha.snapshot.codigoProduto === sku);

    expect(porSku(SKU_A).map((linha) => linha.precoUnitario)).toEqual([800, 800]);
    expect(porSku(SKU_B).map((linha) => linha.precoUnitario)).toEqual([800]);
    // Linha congelada (DAV) mantém o preço do documento de origem (AD-067).
    expect(porSku(SKU_CONGELADO).map((linha) => linha.precoUnitario)).toEqual([1234]);
  });

  it('recalcula o desconto de convênio do cliente novo sobre as linhas ativas', async () => {
    const { store } = comCarrinhoPopulado();

    // `DescontoConvenio: 10` → 10% sobre o total bruto de cada linha ativa.
    await store.getState().selecionarCliente(clienteCheckoutDe({ CodCliente: 77 }), 'BUSCA_LIVRE');

    const linhaA = store.getState().linhas[0];
    expect(linhaA?.precoUnitario).toBe(800);
    expect(linhaA?.descontoConvenio).toBe(160);
  });

  it('avisa o operador quando o re-fetch falha, sem desfazer a troca', async () => {
    const avisar = vi.fn();
    const montagem = montarStore({
      buscarSnapshotProduto: vi.fn(async () => {
        throw new Error('rede');
      }),
      avisar,
    });
    montagem.store.getState().inserirItem({
      snapshot: snapshotDe({ codigoProduto: SKU_A }),
      quantidade: unidades(1),
      origem: 'MANUAL',
    });

    await montagem.store
      .getState()
      .selecionarCliente(clienteCheckoutDe({ CodCliente: 77 }), 'BUSCA_LIVRE');

    expect(montagem.store.getState().clienteAtual?.codigoCliente).toBe(77);
    expect(avisar).toHaveBeenCalledOnce();
  });
});

describe('cadastrarESelecionarCliente (T021)', () => {
  const dados = {
    nome: 'NOVO CLIENTE',
    cpf: '11122233344',
    email: 'novo@example.test',
    celular: '55 47 90000-0000',
    cep: '89000000',
    endereco: 'Rua Exemplo',
    bairro: 'Centro',
    numero: '100',
    cidade: 'SINOP',
    uf: 'MT',
  };

  it('dispara CLIENTE_CRIADO (nunca TROCADO) e marca a origem do cadastro', async () => {
    const { store } = montarStore();
    await store
      .getState()
      .selecionarCliente(clienteCheckoutDe({ CodCliente: 10 }), 'BUSCA_DOCUMENTO');

    const criar = vi.fn(async () => clienteCheckoutDe({ CodCliente: 9001, nome: 'NOVO CLIENTE' }));
    await store.getState().cadastrarESelecionarCliente(dados, criar);

    expect(eventosDeCliente(store).map((evento) => evento.tipo)).toEqual([
      'CLIENTE_SELECIONADO',
      'CLIENTE_CRIADO',
    ]);
    expect(store.getState().clienteAtual?.origem).toBe('CADASTRO_SIMPLIFICADO');
    expect(store.getState().clienteAtual?.codigoCliente).toBe(9001);
  });

  it('propaga o erro do ERP sem tocar no estado da venda (SC-003)', async () => {
    const { store } = montarStore();
    store
      .getState()
      .inicializarClientePadrao(
        registroBootstrapDe({ ClienteDefaultCodigo: 42, ClienteDefaultNome: 'Padrão' })
          .SessaoUsuario,
      );

    const criar = vi.fn(async () => {
      throw new Error('ERP recusou o cadastro');
    });

    await expect(store.getState().cadastrarESelecionarCliente(dados, criar)).rejects.toThrow(
      'ERP recusou o cadastro',
    );

    expect(store.getState().clienteAtual?.codigoCliente).toBe(42);
    expect(eventosDeCliente(store)).toEqual([]);
  });
});

beforeEach(() => {
  vi.restoreAllMocks();
});

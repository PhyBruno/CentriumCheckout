import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClienteCheckout } from '../../src/shared/schemas/cliente.schema';
import {
  importarVendaExistente,
  type ImportacaoVendaDeps,
} from '../../src/client/services/importacao/importarVendaExistente';
import {
  fetchListaNFCes,
  fonteRascunho,
} from '../../src/client/services/recuperacao/recuperacaoQueries';
import type { ErpClient, ResultadoChamadaErp } from '../../src/client/services/erpClient';
import type { CarrinhoDeps } from '../../src/client/stores/slices/carrinhoSlice';
import type { ClienteDeps } from '../../src/client/stores/slices/clienteSlice';
import { criarVendaStore } from '../../src/client/stores/vendaStore';
import { clienteCheckoutDe } from '../support/cliente';
import { snapshotDe } from '../support/precificacao';
import { CODIGO_CLIENTE_DAV, CODIGO_VENDEDOR_DAV, SKU_DAV } from '../support/dav';
import {
  NUMERO_NOTA,
  SERIE_NFCE,
  SKU_SEGUNDO_ITEM,
  rascunhoDaLista,
  respostaCarregarNFCe,
  respostaListaNFCes,
  respostaRascunhoCompleto,
} from '../support/recuperacao';

/**
 * Retomada de rascunho de NFCe (feature 011) sobre a orquestração compartilhada
 * (AD-166).
 *
 * O caminho comum às duas features — atomicidade, reverificação pós-rede,
 * ordem dos efeitos — já é coberto por `importacaoDav.spec.ts`. O que este
 * arquivo prova é o que **muda** com a origem `'RASCUNHO'`: o rótulo que chega
 * às linhas e à identidade, a série que vai a `CarregarNFCe` (D4), o evento de
 * auditoria próprio e a ausência de qualquer lock entre operadores (J7/AD-052).
 */

const CAMINHO_CARREGAR = '/ApiCentriumOAuth/CarregarNFCe';
const CAMINHO_LISTA = '/ApiCentriumOAuth/GetListaNFCes';

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

interface Contexto {
  readonly deps: ImportacaoVendaDeps;
  readonly capturadas: string[];
  readonly trocarVendedor: ReturnType<typeof vi.fn>;
  readonly importarFormasDePagamento: ReturnType<typeof vi.fn>;
}

function depsDe(
  store: ReturnType<typeof montarStore>,
  documento: unknown = respostaCarregarNFCe(),
  sobrescritas: Partial<ImportacaoVendaDeps> = {},
): Contexto {
  const capturadas: string[] = [];
  const trocarVendedor = vi.fn();
  const importarFormasDePagamento = vi.fn();
  const venda = store.getState();

  const deps: ImportacaoVendaDeps = {
    estadoDaVenda: () => ({
      numeroNota: store.getState().identidadeVenda.numeroNota,
      podeMutar: true,
      linhasNaVenda: store.getState().linhas.length,
      clienteIdentificado: store.getState().houveEscolhaExplicita,
    }),
    definirIdentidadeVenda: venda.definirIdentidadeVenda,
    importarLinhasCongeladas: venda.importarLinhasCongeladas,
    editarSnapshotDescricao: venda.editarSnapshotDescricao,
    resolverCliente: (codigo: number): Promise<ClienteCheckout> =>
      Promise.resolve(
        clienteCheckoutDe({ CodCliente: codigo, ClienteNome: 'CLIENTE DO RASCUNHO' }),
      ),
    // A origem `'RASCUNHO'` é o que o hook da feature fixa (AD-166) — aqui ela
    // é reproduzida para o teste exercitar o mesmo caminho da UI.
    selecionarCliente: (cliente) => venda.selecionarCliente(cliente, 'RASCUNHO'),
    trocarVendedor,
    importarFormasDePagamento,
    registrarEventoAuditoria: venda.registrarEventoAuditoria,
    buscarDescricaoProduto: () => Promise.resolve('ARROZ TIPO 1 5KG'),
    erpClient: erpClientDe({ [CAMINHO_CARREGAR]: documento }, capturadas),
    ...sobrescritas,
  };

  return { deps, capturadas, trocarVendedor, importarFormasDePagamento };
}

function fonte() {
  const linha = rascunhoDaLista();
  return fonteRascunho({
    numeroNota: linha.NumeroNota as number,
    cliente: linha.Cliente as string,
    serie: SERIE_NFCE,
  });
}

function tiposDeEvento(store: ReturnType<typeof montarStore>): string[] {
  return store.getState().eventos.map((evento) => evento.tipo);
}

let store: ReturnType<typeof montarStore>;

beforeEach(() => {
  store = montarStore();
});

describe('GetListaNFCes — parâmetros (research.md D1/D2)', () => {
  /**
   * D2/AD-024: o cap de 50 do servidor é **anulado** quando `Tamanhopagina`
   * chega preenchido, e ele é obrigatório para paginar. O teto passa a ser
   * responsabilidade do Checkout — sem o `Math.min`, um valor alto chegaria ao
   * ERP sem contenção nenhuma.
   */
  it('nunca envia Tamanhopagina acima de 50, mesmo se um valor maior for pedido', async () => {
    const capturadas: string[] = [];
    const erpClient = erpClientDe({ [CAMINHO_LISTA]: respostaListaNFCes() }, capturadas);

    await fetchListaNFCes({ tamanhoPagina: 500 }, { erpClient });

    expect(capturadas[0]).toContain('Tamanhopagina=50');
  });

  /** Termo vazio é consulta legítima — não vira `Txtbusca=` vazio na query. */
  it('omite Txtbusca quando o operador não digitou nada', async () => {
    const capturadas: string[] = [];
    const erpClient = erpClientDe({ [CAMINHO_LISTA]: respostaListaNFCes() }, capturadas);

    await fetchListaNFCes({ txtBusca: '   ' }, { erpClient });

    expect(capturadas[0]).not.toContain('Txtbusca');
  });
});

describe('CarregarNFCe — parâmetros (research.md D4)', () => {
  it('envia sempre a série da sessão, nunca uma vinda da listagem', async () => {
    const { deps, capturadas } = depsDe(store);

    await importarVendaExistente(fonte(), deps);

    const chamada = capturadas.find((url) => url.startsWith(CAMINHO_CARREGAR));
    expect(chamada).toContain(`Numeronota=${String(NUMERO_NOTA)}`);
    expect(chamada).toContain(`Serienota=${SERIE_NFCE}`);
  });
});

describe('hidratação do carrinho (J1/J2)', () => {
  it('cria linhas congeladas de origem RASCUNHO', async () => {
    const { deps } = depsDe(store);

    await importarVendaExistente(fonte(), deps);

    const linhas = store.getState().linhas;
    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.origem).toBe('RASCUNHO');
    expect(linhas[0]?.precoCongelado).toBe(true);
    expect(linhas[0]?.snapshot.codigoProduto).toBe(SKU_DAV);
  });

  /**
   * J2 — nenhuma reprecificação durante a hidratação. O preço do rascunho
   * (R$ 10,00) sobrevive mesmo com o catálogo do teste devolvendo outro valor
   * por `buscarSnapshotProduto`: se `repricarSku` rodasse, a linha assumiria o
   * preço de hoje e a NFCe retomada divergiria da suspensa.
   */
  it('preserva o preço do rascunho sem passar por reprecificação', async () => {
    const { deps } = depsDe(store);

    await importarVendaExistente(fonte(), deps);

    expect(store.getState().linhas[0]?.precoUnitario).toBe(1000);
    expect(store.getState().linhas[0]?.descontoManual).toBe(150);
  });
});

describe('identidade da venda (J3)', () => {
  it('assume o NumeroNota do rascunho e a origem RASCUNHO, nunca 0', async () => {
    const { deps } = depsDe(store);
    expect(store.getState().identidadeVenda.numeroNota).toBe(0);

    await importarVendaExistente(fonte(), deps);

    expect(store.getState().identidadeVenda).toEqual({
      origem: 'RASCUNHO',
      numeroNota: NUMERO_NOTA,
    });
  });
});

describe('cliente e vendedor', () => {
  it('aplica o cliente do rascunho com origem RASCUNHO', async () => {
    const { deps } = depsDe(store);

    await importarVendaExistente(fonte(), deps);

    expect(store.getState().clienteAtual?.codigoCliente).toBe(CODIGO_CLIENTE_DAV);
    expect(store.getState().clienteAtual?.origem).toBe('RASCUNHO');
  });

  it('pré-seleciona o vendedor do rascunho (stub da 012)', async () => {
    const { deps, trocarVendedor } = depsDe(store);

    await importarVendaExistente(fonte(), deps);

    expect(trocarVendedor).toHaveBeenCalledWith({
      codigo: CODIGO_VENDEDOR_DAV,
      // O contrato do documento não devolve o nome (AD-095) — `null`, nunca uma
      // string vazia que a UI exibiria como vendedor sem nome.
      nome: null,
    });
  });
});

describe('auditoria (J6 e AD-166)', () => {
  /**
   * A tasks.md original (J5/J6) mandava `resetarAuditoria` + `VENDA_INICIADA`.
   * AD-166 decidiu o contrário, seguindo a 006: a pré-condição já garante que a
   * venda não foi efetivamente iniciada, então não há histórico de operador a
   * zerar — e emitir `VENDA_INICIADA` afirmaria um início de sessão que
   * aconteceu antes, em `abrirSessaoDeVenda`.
   */
  it('emite NFCE_RECUPERADA e preserva a trilha anterior', async () => {
    const { deps } = depsDe(store);
    const antes = tiposDeEvento(store);

    await importarVendaExistente(fonte(), deps);

    const depois = tiposDeEvento(store);
    expect(depois.slice(0, antes.length)).toEqual(antes);
    expect(depois.filter((tipo) => tipo === 'NFCE_RECUPERADA')).toHaveLength(1);
  });

  it('não emite PRODUTO_INSERIDO nem VENDA_INICIADA pela hidratação', async () => {
    const { deps } = depsDe(store);
    const vendaIniciadasAntes = tiposDeEvento(store).filter(
      (tipo) => tipo === 'VENDA_INICIADA',
    ).length;

    await importarVendaExistente(fonte(), deps);

    expect(tiposDeEvento(store)).not.toContain('PRODUTO_INSERIDO');
    expect(tiposDeEvento(store).filter((tipo) => tipo === 'VENDA_INICIADA')).toHaveLength(
      vendaIniciadasAntes,
    );
  });

  it('registra número, série e volumes no evento', async () => {
    const { deps } = depsDe(store);

    await importarVendaExistente(fonte(), deps);

    const evento = store.getState().eventos.find((item) => item.tipo === 'NFCE_RECUPERADA');
    expect(evento?.detalhes).toEqual({
      numeroNota: NUMERO_NOTA,
      serie: SERIE_NFCE,
      quantidadeLinhas: 1,
      quantidadeFormasDePagamento: 1,
    });
  });
});

describe('concorrência entre operadores (J7, AD-052)', () => {
  it('não faz nenhuma chamada de lock ao retomar', async () => {
    const { deps, capturadas } = depsDe(store);

    await importarVendaExistente(fonte(), deps);

    // Só o carregamento do documento sai daqui: cliente e produto entram por
    // portas injetadas. Nenhuma rota de bloqueio/reserva é chamada — dois
    // operadores podem abrir o mesmo rascunho, e quem faturar primeiro ganha.
    expect(capturadas).toHaveLength(1);
    expect(capturadas[0]).toContain(CAMINHO_CARREGAR);
  });
});

describe('rascunho indisponível', () => {
  /**
   * `404` de `CarregarNFCe`: já faturado por outro operador entre a listagem e
   * a seleção, ou fora da janela de tempo do servidor. Erro de negócio — e a
   * venda precisa ficar exatamente como estava.
   */
  it('não muta nada quando o ERP responde 404', async () => {
    const { deps } = depsDe(store, undefined, {
      erpClient: {
        chamar: () => Promise.resolve({ estado: 'ok', resposta: respostaJson({}, 404) }),
      },
    });

    await expect(importarVendaExistente(fonte(), deps)).rejects.toThrow();

    expect(store.getState().linhas).toEqual([]);
    expect(store.getState().identidadeVenda.numeroNota).toBe(0);
    expect(tiposDeEvento(store)).not.toContain('NFCE_RECUPERADA');
  });

  it('não muta nada quando o documento vem fora do contrato', async () => {
    const { deps } = depsDe(store, { OutCheckoutFaturarNFCe: { NumeroNota: NUMERO_NOTA } });

    await expect(importarVendaExistente(fonte(), deps)).rejects.toThrow();

    expect(store.getState().linhas).toEqual([]);
    expect(tiposDeEvento(store)).not.toContain('NFCE_RECUPERADA');
  });
});

describe('pré-condição — venda já iniciada (pedido do usuário, 2026-09-04)', () => {
  it('recusa a retomada quando já há item lançado', async () => {
    const { deps } = depsDe(store, respostaCarregarNFCe(), {
      estadoDaVenda: () => ({
        numeroNota: 0,
        podeMutar: true,
        linhasNaVenda: 1,
        clienteIdentificado: false,
      }),
    });

    await expect(importarVendaExistente(fonte(), deps)).rejects.toMatchObject({
      name: 'ErroImportacaoRecusada',
      motivo: 'carrinho-populado',
    });
  });

  it('recusa quando a condição de pagamento já congelou a venda', async () => {
    const { deps } = depsDe(store, respostaCarregarNFCe(), {
      estadoDaVenda: () => ({
        numeroNota: 0,
        // `podeMutar` é `false` a partir da condição escolhida ou da primeira
        // forma aprovada — os dois últimos dos quatro critérios do usuário.
        podeMutar: false,
        linhasNaVenda: 0,
        clienteIdentificado: false,
      }),
    });

    await expect(importarVendaExistente(fonte(), deps)).rejects.toMatchObject({
      name: 'ErroImportacaoRecusada',
      motivo: 'venda-bloqueada',
    });
  });

  it('recusa quando um cliente já foi identificado pelo operador', async () => {
    const { deps } = depsDe(store, respostaCarregarNFCe(), {
      estadoDaVenda: () => ({
        numeroNota: 0,
        podeMutar: true,
        linhasNaVenda: 0,
        clienteIdentificado: true,
      }),
    });

    await expect(importarVendaExistente(fonte(), deps)).rejects.toMatchObject({
      name: 'ErroImportacaoRecusada',
      motivo: 'cliente-identificado',
    });
  });
});

/* ------------------------------------------------------------------ *
 * T026 — os cenários do `quickstart.md`
 * ------------------------------------------------------------------ */

/**
 * Cenários 2, 5 e 6 do `quickstart.md`, executados sobre o documento que ele
 * descreve: **2 itens** com preço divergente do catálogo e **1 forma em
 * dinheiro**. Os cenários 1 e 3 vivem em `ModalRecuperacaoNFCe.spec.tsx`
 * (listagem/busca e reinserção) e o 4 em `tests/e2e/recuperacao-nfce.spec.ts`
 * (finalização com o `NumeroNota` do rascunho).
 *
 * Diferente dos testes acima, aqui `importarFormasDePagamento` é a **action
 * real** do slice, não um espião: o passo 4 do Cenário 2 afirma que a forma
 * chega à venda aprovada, e um espião provaria só que a porta foi chamada. Foi
 * exatamente essa diferença que escondeu, até 2026-09-04, o fato de a fixture
 * mandar `'01'` (código numérico da NFe) num campo que o ERP preenche com
 * nomes — a forma era descartada em silêncio.
 */
describe('T026 — quickstart Cenário 2: retomada completa', () => {
  function depsComPagamentoReal(): Contexto {
    const contexto = depsDe(store, respostaRascunhoCompleto());
    return {
      ...contexto,
      deps: {
        ...contexto.deps,
        importarFormasDePagamento: store.getState().importarFormasDePagamento,
      },
    };
  }

  it('traz os dois itens congelados, com o preço exato do rascunho', async () => {
    const { deps } = depsComPagamentoReal();

    await importarVendaExistente(fonte(), deps);

    const linhas = store.getState().linhas;
    expect(linhas).toHaveLength(2);
    expect(linhas.map((linha) => linha.snapshot.codigoProduto)).toEqual([
      SKU_DAV,
      SKU_SEGUNDO_ITEM,
    ]);
    // Preços do documento (R$ 10,00 e R$ 25,00), não os do catálogo.
    expect(linhas.map((linha) => linha.precoUnitario)).toEqual([1000, 2500]);
    expect(linhas.every((linha) => linha.precoCongelado)).toBe(true);
    expect(linhas.every((linha) => linha.origem === 'RASCUNHO')).toBe(true);
  });

  /**
   * Passo 4 — a forma volta **aplicada e aprovada**. O veredito do ERP está
   * implícito no rascunho existir: aquela venda já foi cobrada antes de ser
   * suspensa, e o Checkout não reavalia (Constitution III).
   */
  it('devolve a forma em dinheiro já aplicada, com status APROVADO', async () => {
    const { deps } = depsComPagamentoReal();

    await importarVendaExistente(fonte(), deps);

    const pagamentos = store.getState().pagamentos;
    expect(pagamentos).toHaveLength(1);
    expect(pagamentos[0]?.meioPagtoNFe).toBe('Dinheiro');
    expect(pagamentos[0]?.status).toBe('APROVADO');
    expect(pagamentos[0]?.valorAplicado).toBe(9350);
    // `valorRecebido = valor` em dinheiro: o troco do documento original não é
    // reconstruído, porque o contrato não o devolve (`research.md` D8).
    expect(pagamentos[0]?.valorRecebido).toBe(9350);
  });

  it('aplica cliente, vendedor e a identidade original da venda', async () => {
    const { deps, trocarVendedor } = depsComPagamentoReal();

    await importarVendaExistente(fonte(), deps);

    expect(store.getState().clienteAtual?.codigoCliente).toBe(CODIGO_CLIENTE_DAV);
    expect(store.getState().clienteAtual?.origem).toBe('RASCUNHO');
    expect(trocarVendedor).toHaveBeenCalledWith({ codigo: CODIGO_VENDEDOR_DAV, nome: null });
    expect(store.getState().identidadeVenda).toEqual({
      origem: 'RASCUNHO',
      numeroNota: NUMERO_NOTA,
    });
  });
});

describe('T026 — quickstart Cenário 5: auditoria da retomada', () => {
  /**
   * **O cenário como escrito está superado.** Ele pedia `VENDA_INICIADA({
   * origem: 'RASCUNHO' })` como primeiro evento (J5/J6). AD-166 decidiu o
   * contrário, seguindo AD-137: a trilha existente é preservada e a retomada
   * acrescenta `NFCE_RECUPERADA`. O que o cenário queria garantir — que a
   * hidratação não se disfarce de sequência de ações do operador — continua
   * valendo, e é o que este teste afirma.
   */
  it('não emite evento de produto nem de pagamento pela hidratação', async () => {
    const { deps } = depsDe(store, respostaRascunhoCompleto());
    const antes = tiposDeEvento(store);

    await importarVendaExistente(fonte(), deps);

    const depois = tiposDeEvento(store);
    expect(depois.slice(0, antes.length)).toEqual(antes);
    // Dois itens e uma forma entraram na venda sem gerar um evento sequer: a
    // hidratação é um instantâneo, não uma sequência de ações do operador.
    expect(depois).not.toContain('PRODUTO_INSERIDO');
    expect(depois).not.toContain('FORMA_PAGAMENTO_APLICADA');
    expect(depois.slice(antes.length)).toContain('NFCE_RECUPERADA');
  });

  /**
   * **Divergência real de J6, encontrada ao rodar o T026 (2026-09-04).**
   *
   * J6 diz "nenhum evento além de `VENDA_INICIADA`". Na prática a hidratação
   * emite também `CLIENTE_SELECIONADO`, porque a orquestração chama a action
   * real do slice de cliente — e essa action registra o evento sem saber que
   * está sendo chamada por uma importação. O mesmo vale para a feature 006
   * desde 2026-09-03: não é regressão da 011, é o comportamento embarcado.
   *
   * Não foi "corrigido" suprimindo o evento: o cliente da venda **de fato**
   * mudou, e apagar isso da trilha seria pior do que registrá-lo. O que falta é
   * o evento carregar a origem — hoje ele leva só `{ codigoCliente, nome }`, e
   * um leitor não distingue este caso de uma escolha manual do operador. O
   * `NFCE_RECUPERADA` logo em seguida explica a sequência, o que torna a
   * ambiguidade tolerável. Registrado como pendência (item 45).
   *
   * O teste fixa o comportamento observado para que uma mudança futura — em
   * qualquer direção — seja deliberada.
   */
  it('emite CLIENTE_SELECIONADO junto, sem a origem (J6 não é cumprido à letra)', async () => {
    const { deps } = depsDe(store, respostaRascunhoCompleto());
    const antes = tiposDeEvento(store);

    await importarVendaExistente(fonte(), deps);

    expect(tiposDeEvento(store).slice(antes.length)).toEqual([
      'CLIENTE_SELECIONADO',
      'NFCE_RECUPERADA',
    ]);
  });

  it('não reabre a sessão de venda: nenhum VENDA_INICIADA novo', async () => {
    const { deps } = depsDe(store, respostaRascunhoCompleto());
    const iniciadasAntes = tiposDeEvento(store).filter((tipo) => tipo === 'VENDA_INICIADA').length;

    await importarVendaExistente(fonte(), deps);

    expect(tiposDeEvento(store).filter((tipo) => tipo === 'VENDA_INICIADA')).toHaveLength(
      iniciadasAntes,
    );
  });
});

describe('T026 — quickstart Cenário 6: sem lock entre operadores', () => {
  /**
   * Duas retomadas **concorrentes** do mesmo `NumeroNota`, cada uma com o seu
   * store (dois operadores). Nenhuma das duas emite chamada de bloqueio, e a
   * segunda não é impedida pela primeira: quem faturar primeiro ganha, e o ERP
   * recusa a outra na hora do faturamento (`NFCE-05`, AD-052).
   */
  it('duas retomadas simultâneas do mesmo rascunho, sem nenhuma chamada de lock', async () => {
    const primeiro = montarStore();
    const segundo = montarStore();
    const ctxPrimeiro = depsDe(primeiro, respostaRascunhoCompleto());
    const ctxSegundo = depsDe(segundo, respostaRascunhoCompleto());

    await Promise.all([
      importarVendaExistente(fonte(), ctxPrimeiro.deps),
      importarVendaExistente(fonte(), ctxSegundo.deps),
    ]);

    // Uma chamada por operador, e é `CarregarNFCe` — nada de reservar/liberar.
    expect(ctxPrimeiro.capturadas).toHaveLength(1);
    expect(ctxSegundo.capturadas).toHaveLength(1);
    expect(ctxPrimeiro.capturadas[0]).toContain(CAMINHO_CARREGAR);
    expect(ctxSegundo.capturadas[0]).toContain(CAMINHO_CARREGAR);

    // As duas vendas ficam com a mesma identidade — é justamente o que a
    // ausência de lock permite, e o que o ERP resolve no faturamento.
    expect(primeiro.getState().identidadeVenda.numeroNota).toBe(NUMERO_NOTA);
    expect(segundo.getState().identidadeVenda.numeroNota).toBe(NUMERO_NOTA);
  });
});

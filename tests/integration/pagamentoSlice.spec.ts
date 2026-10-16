import { describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { centavos, type Centavos } from '../../src/client/domain/precificacao/dinheiro';
import type { SnapshotPrecoProduto } from '../../src/client/domain/precificacao/linha';
import type { LinhaRateavel } from '../../src/client/domain/pagamento/descontoCapa';
import type {
  CondicaoPagamento,
  FormaPagamento,
} from '../../src/client/domain/pagamento/formaPagamento';
import {
  formaDisponivel,
  type CapacidadesPagamento,
  type IntegracaoPagamento,
} from '../../src/client/domain/pagamento/roteamentoIntegracao';
import type { ResultadoTicket } from '../../src/client/domain/pagamento/valeDevolucao';
import type { FormaPagamentoImportada } from '../../src/client/domain/importacaoVenda/mapearVendaExistente';
import { criarAuditoriaSlice } from '../../src/client/stores/slices/auditoriaSlice';
import {
  criarCarrinhoSlice,
  type CarrinhoDeps,
} from '../../src/client/stores/slices/carrinhoSlice';
import { criarClienteSlice, type ClienteDeps } from '../../src/client/stores/slices/clienteSlice';
import {
  criarIdentidadeVendaSlice,
  type IdentidadeVendaDeps,
} from '../../src/client/stores/slices/identidadeVendaSlice';
import {
  criarVendedorSlice,
  type VendedorDeps,
} from '../../src/client/stores/slices/vendedorSlice';
import {
  AVISO_CONDICAO_COM_PAGAMENTO,
  AVISO_CONDICAO_SEM_DESCONTO,
  avisoTetoDaCondicao,
  AVISO_DESCONTO_COM_PAGAMENTO,
  AVISO_DESCONTO_ZERA_A_VENDA,
  AVISO_DESCONTO_ZERA_ITEM,
  AVISO_SALDO_JA_COBERTO,
  AVISO_VENDA_SEM_VALOR,
  AVISO_DINHEIRO_DUPLICADO,
  AVISO_FORMA_FORA_DA_CONDICAO,
  AVISO_TEF_IRREVERSIVEL,
  AVISO_VALE_FORMA_ERRADA,
  AVISO_VALE_INDISPONIVEL,
  AVISO_VALE_JA_APLICADO,
  AVISO_VALOR_ACIMA_DO_SALDO,
  criarPagamentoSlice,
  type ContextoIntegracao,
  type FormaCandidata,
  type OrigemAcionamento,
  type PagamentoDeps,
  type PagamentoSlice,
  type Veredito,
} from '../../src/client/stores/slices/pagamentoSlice';
import type { VendaState } from '../../src/client/stores/vendaStore';
import { criarValidacaoVendaSlice } from '../../src/client/stores/slices/validacaoVendaSlice';
import { MEIO_PAGTO } from '../../src/client/domain/pagamento/formaPagamento';
import { formaDe, validacaoDepsInertes } from '../support/pagamento';

/**
 * Invariantes de estado do pagamento (`quickstart.md`, Cenários 3, 5, 6 e 8).
 *
 * Cobre T014, T015, T016, T017, T018, T021, T022, T023, T024, T025, T026, T027,
 * T032, T033 e T038.
 *
 * O store é montado com os slices **reais** (auditoria + carrinho + identidade +
 * cliente + pagamento), como em `tests/integration/carrinhoSlice.spec.ts`: usar
 * o `criarAuditoriaSlice` de verdade é o que torna a ordem dos eventos do
 * Cenário 8 uma afirmação sobre o comportamento real, e não sobre um duplo. Só
 * as `PagamentoDeps` são duplos — é justamente a fronteira que o slice existe
 * para não atravessar.
 */

const TOTAL_PADRAO = 10_000; // R$ 100,00 em centavos

/* ------------------------------------------------------------------ *
 * Fixtures sintéticas de catálogo
 * ------------------------------------------------------------------ */

const DINHEIRO = formaDe({
  codigo: 1,
  descricao: 'DINHEIRO',
  entrada: 'S',
  meioPagtoNFe: MEIO_PAGTO.Dinheiro,
});

const CARTAO = formaDe({
  codigo: 2,
  descricao: 'CARTAO CREDITO',
  entrada: 'N',
  meioPagtoNFe: MEIO_PAGTO.CartaoCredito,
  integracaoCartao: '1',
  tipoTransacaoTEF: 'CREDITO',
  // Cartão comum: `fpgUtiCar` vazio. Antes era `'VDV'`, porque sob AD-048 esse
  // valor significava "aceita vale"; hoje ele significa "**é** o vale
  // devolução", e um cartão de crédito não é.
  fpgUtiCar: '',
});

const PIX = formaDe({ codigo: 3, descricao: 'PIX', entrada: 'S', meioPagtoNFe: MEIO_PAGTO.Pix });

const PIX_ESTATICO = formaDe({
  codigo: 4,
  descricao: 'PIX ESTATICO',
  entrada: 'S',
  meioPagtoNFe: MEIO_PAGTO.PixEstatico,
});

/** Outro cartão comum — `fpgUtiCar` preenchido, mas não com `'VDV'`. */
const CARTAO_SEM_VALE = formaDe({
  codigo: 5,
  descricao: 'CARTAO DEBITO',
  entrada: 'N',
  meioPagtoNFe: MEIO_PAGTO.CartaoDebito,
  integracaoCartao: '1',
  fpgUtiCar: 'OUTRO',
});

/**
 * A forma de vale devolução: `FpgUtiCar = 'VDV'`. `meioPagtoNFe` é `'Outros'`
 * porque o vale não tem meio próprio na tabela da NFCe — e é o que faz
 * `resolverIntegracao` devolver `NENHUMA`, aprovando o pagamento na hora.
 */
const VALE = formaDe({
  codigo: 6,
  descricao: 'VALE DEVOLUCAO',
  entrada: 'N',
  meioPagtoNFe: MEIO_PAGTO.Outros,
  fpgUtiCar: 'VDV',
});

/**
 * Teto padrão de 100% (017): desde AD-279 o teto da condição limita a capa e o
 * teto `0` a bloqueia, então uma fixture com teto zero tornaria todo caso de
 * capa desta suíte uma recusa por `CONDICAO_SEM_DESCONTO`. 100% não limita nada
 * abaixo do próprio subtotal — que já é recusado por `ZERA_A_VENDA`.
 */
function condicaoDe(
  codigo: number,
  descricao: string,
  formas: readonly FormaPagamento[] = [DINHEIRO, CARTAO, PIX, PIX_ESTATICO, CARTAO_SEM_VALE, VALE],
  limites: { readonly desconto?: number; readonly descontoMaximo?: number } = {},
): CondicaoPagamento {
  return {
    codigo,
    descricao,
    prazo: 0,
    minimoEntrada: centavos(0),
    desconto: limites.desconto ?? 0,
    descontoMaximo: limites.descontoMaximo ?? 100,
    formas,
  };
}

const A_VISTA = condicaoDe(1, 'A VISTA');
const A_PRAZO = condicaoDe(2, 'A PRAZO');

/* ------------------------------------------------------------------ *
 * Montagem do store
 * ------------------------------------------------------------------ */

interface Opcoes {
  readonly subtotal?: number;
  readonly capacidades?: CapacidadesPagamento;
  readonly linhas?: readonly LinhaRateavel[];
  /** Chave `DESCONTO_CAPA_NO_ERP` (017). Padrão desligada. */
  readonly descontoCapaNoErp?: boolean;
}

function montarStore(opcoes: Opcoes = {}) {
  const subtotal = centavos(opcoes.subtotal ?? TOTAL_PADRAO);
  const capacidades = opcoes.capacidades ?? { tefAtivo: false, pixAtivo: false };
  const linhas = opcoes.linhas ?? [];

  const validarInsercao = vi.fn(
    async (_candidata: FormaCandidata, _origem: OrigemAcionamento): Promise<Veredito> => ({
      aceita: true,
    }),
  );
  const validarTicket = vi.fn(async (_codigo: string): Promise<ResultadoTicket> => ({
    valido: false,
    mensagem: 'Ticket não configurado neste teste.',
  }));
  const iniciarIntegracao = vi.fn((_i: IntegracaoPagamento, _ctx: ContextoIntegracao) => undefined);
  const invalidarVeredito = vi.fn(() => undefined);
  const avisar = vi.fn((_mensagem: string) => undefined);

  let sequencia = 0;
  const depsPagamento: PagamentoDeps = {
    subtotalCarrinho: () => subtotal,
    linhasRateaveis: () => linhas,
    capacidades: () => capacidades,
    descontoCapaNoErp: () => opcoes.descontoCapaNoErp ?? false,
    validarTicket,
    iniciarIntegracao,
    validarInsercao,
    invalidarVeredito,
    avisar,
    gerarIdPagamento: () => {
      sequencia += 1;
      return `pag-${String(sequencia)}`;
    },
  };

  // Slices vizinhos com duplos inertes: nenhum teste desta suíte os exercita, e
  // é a composição real que garante que `registrarEventoAuditoria` seja o mesmo
  // dispatcher que a venda usa em produção.
  const depsCarrinho: CarrinhoDeps = {
    podeMutarCarrinho: () => true,
    tipoPrecoAtual: () => 1,
    clienteAtual: () => null,
  };
  const depsCliente: ClienteDeps = {
    podeMutarCarrinho: () => true,
    buscarSnapshotProduto: (): Promise<SnapshotPrecoProduto> =>
      Promise.reject(new Error('busca de produto não é exercitada nesta suíte')),
  };
  const depsIdentidade: IdentidadeVendaDeps = { podeMutarCarrinho: () => true };
  const depsVendedor: VendedorDeps = { podeMutarCarrinho: () => true };

  const store = create<VendaState & PagamentoSlice>()(
    immer((...args) => ({
      ...criarAuditoriaSlice(...args),
      ...criarCarrinhoSlice(depsCarrinho)(...args),
      ...criarIdentidadeVendaSlice(depsIdentidade)(...args),
      ...criarClienteSlice(depsCliente)(...args),
      ...criarPagamentoSlice(depsPagamento)(...args),
      // O gate da 014 entra inerte: esta suíte exercita `validarInsercao` pelo
      // duplo injetado em `PagamentoDeps`, não pelo slice real.
      ...criarValidacaoVendaSlice(validacaoDepsInertes)(...args),
      ...criarVendedorSlice(depsVendedor)(...args),
    })),
  );

  store.getState().resetarAuditoria('NOVA');
  store.getState().selecionarCondicao(A_VISTA);

  return {
    store,
    validarInsercao,
    validarTicket,
    iniciarIntegracao,
    invalidarVeredito,
    avisar,
  };
}

/** Tipos dos eventos na ordem de posição do array — a ordem autoritativa. */
function tiposDeEvento(store: ReturnType<typeof montarStore>['store']): readonly string[] {
  return store.getState().eventos.map((evento) => evento.tipo);
}

/** Detalhes de cada `FORMA_PAGAMENTO_REMOVIDA`, na ordem do `Log` (feature 018). */
function detalhesDasRemocoes(store: ReturnType<typeof montarStore>['store']): readonly object[] {
  return store
    .getState()
    .eventos.filter((evento) => evento.tipo === 'FORMA_PAGAMENTO_REMOVIDA')
    .map((evento) => evento.detalhes);
}

/** O rateio da capa no payload — `RATEADA` é o único modo com a chave desligada (017). */
function rateioDoPayload(
  store: ReturnType<typeof montarStore>['store'],
): ReadonlyMap<string, Centavos> {
  const { descontoCapa } = store.getState().montarPagamentosParaPayload();
  if (descontoCapa.tipo !== 'RATEADA') {
    throw new Error(`capa fora do rateio: ${descontoCapa.tipo}`);
  }
  return descontoCapa.rateio;
}

function emReais(valor: number): number {
  return valor / 100;
}

/* ------------------------------------------------------------------ *
 * T014 — condição escalar, troca esvazia, gate barra antes de mutar
 * ------------------------------------------------------------------ */

describe('pagamentoSlice — condição de pagamento e gate de inserção (T014)', () => {
  it('mantém no máximo uma condição selecionada por venda (I1)', () => {
    const { store } = montarStore();

    store.getState().selecionarCondicao(A_PRAZO);

    expect(store.getState().condicaoSelecionada?.codigo).toBe(A_PRAZO.codigo);
    expect(
      tiposDeEvento(store).filter((tipo) => tipo === 'CONDICAO_PAGAMENTO_APLICADA'),
    ).toHaveLength(2);
  });

  it('reselecionar a mesma condição não esvazia a lista nem duplica o evento', async () => {
    const { store } = montarStore();
    await store.getState().aplicarPagamento({ forma: DINHEIRO, valorInformado: centavos(10_000) });

    store.getState().selecionarCondicao(A_VISTA);

    expect(store.getState().pagamentos).toHaveLength(1);
    expect(
      tiposDeEvento(store).filter((tipo) => tipo === 'CONDICAO_PAGAMENTO_APLICADA'),
    ).toHaveLength(1);
  });

  /**
   * I9 reescrita pelo usuário em 2026-09-04: **uma condição por venda**.
   *
   * Antes esta porta trocava a condição e **apagava** os pagamentos no mesmo
   * `set` — o operador via a lista sumir sem explicação e sem gesto que a
   * trouxesse de volta. Agora a troca é recusada com aviso, e nada muta.
   */
  it('trocar a condição com forma aplicada é recusado, sem apagar nada (I9)', async () => {
    const { store, avisar } = montarStore();
    await store.getState().aplicarPagamento({ forma: DINHEIRO, valorInformado: centavos(10_000) });
    expect(store.getState().pagamentos).toHaveLength(1);

    store.getState().selecionarCondicao(A_PRAZO);

    expect(store.getState().condicaoSelecionada?.codigo).toBe(A_VISTA.codigo);
    expect(store.getState().pagamentos).toHaveLength(1);
    expect(avisar).toHaveBeenCalledWith(AVISO_CONDICAO_COM_PAGAMENTO);
    // Nenhum evento de condição além do da montagem: a recusa não é uma
    // aplicação de condição.
    expect(
      tiposDeEvento(store).filter((tipo) => tipo === 'CONDICAO_PAGAMENTO_APLICADA'),
    ).toHaveLength(1);
  });

  it('sem pagamento aplicado, trocar a condição continua livre', () => {
    const { store } = montarStore();

    store.getState().selecionarCondicao(A_PRAZO);

    expect(store.getState().condicaoSelecionada?.codigo).toBe(A_PRAZO.codigo);
  });

  it('"Limpar" é a saída: descartarPagamento libera a troca de condição', async () => {
    const { store } = montarStore();
    await store.getState().aplicarPagamento({ forma: DINHEIRO, valorInformado: centavos(10_000) });

    store.getState().descartarPagamento();
    store.getState().selecionarCondicao(A_PRAZO);

    expect(store.getState().condicaoSelecionada?.codigo).toBe(A_PRAZO.codigo);
    // Feature 018: o "Limpar" risca a forma, não a apaga (FR-002).
    expect(store.getState().pagamentos.map((pagamento) => pagamento.status)).toEqual(['EXCLUIDO']);
  });

  it('veredito desfavorável não muta o estado nem alcança iniciarIntegracao (I11, FR-019)', async () => {
    const { store, validarInsercao, iniciarIntegracao, avisar } = montarStore({
      capacidades: { tefAtivo: true, pixAtivo: true },
    });
    validarInsercao.mockResolvedValue({
      aceita: false,
      motivo: 'Cliente sem limite de crediário.',
    });

    await store.getState().aplicarPagamento({ forma: CARTAO, valorInformado: centavos(7_000) });

    expect(store.getState().pagamentos).toEqual([]);
    expect(iniciarIntegracao).not.toHaveBeenCalled();
    expect(avisar).toHaveBeenCalledWith('Cliente sem limite de crediário.');
  });

  it('indisponibilidade do ERP tem o mesmo desfecho de uma recusa', async () => {
    const { store, validarInsercao, iniciarIntegracao } = montarStore({
      capacidades: { tefAtivo: true, pixAtivo: true },
    });
    validarInsercao.mockRejectedValue(new Error('ERP indisponível'));

    await store.getState().aplicarPagamento({ forma: CARTAO, valorInformado: centavos(7_000) });

    expect(store.getState().pagamentos).toEqual([]);
    expect(iniciarIntegracao).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ *
 * AD-171 — a forma riscada não conta como pagamento aplicado
 * ------------------------------------------------------------------ */

/**
 * Desde AD-163 `removerPagamento` marca `EXCLUIDO` em vez de tirar do array, e
 * as guardas que perguntavam `pagamentos.length > 0` passaram a responder
 * "quantas formas esta venda já viu", não "há pagamento aqui". Efeito: excluída
 * a única forma, condição e desconto de capa ficavam congelados para sempre,
 * numa venda sem pagamento ativo e sem gesto que os destravasse.
 */
describe('pagamentoSlice — guardas ignoram forma excluída (AD-171)', () => {
  it('libera a troca de condição depois de a única forma ser excluída', async () => {
    const { store, avisar } = montarStore();

    await store.getState().aplicarPagamento({ forma: DINHEIRO, valorInformado: centavos(10_000) });
    store.getState().selecionarCondicao(A_PRAZO);
    expect(store.getState().condicaoSelecionada?.codigo).toBe(A_VISTA.codigo);

    store.getState().removerPagamento('pag-1');
    avisar.mockClear();
    store.getState().selecionarCondicao(A_PRAZO);

    expect(store.getState().condicaoSelecionada?.codigo).toBe(A_PRAZO.codigo);
    expect(avisar).not.toHaveBeenCalled();
    // A forma riscada permanece, por rastreabilidade — trocar a condição não a
    // apaga (é isso que AD-163 protege).
    expect(store.getState().pagamentos[0]?.status).toBe('EXCLUIDO');
  });

  it('libera o desconto de capa depois de a única forma ser excluída', async () => {
    const { store } = montarStore();

    await store.getState().aplicarPagamento({ forma: DINHEIRO, valorInformado: centavos(10_000) });
    expect(store.getState().aplicarDescontoCapa('VALOR', 5)).toBe(false);

    store.getState().removerPagamento('pag-1');

    expect(store.getState().aplicarDescontoCapa('VALOR', 5)).toBe(true);
    store.getState().removerDescontoCapa();
    expect(store.getState().descontoCapa).toBeNull();
  });

  /**
   * A condição de um documento importado **não** congela o carrinho: ela é
   * replay de um DAV/rascunho, não a declaração do operador que I7 descreve.
   * Congelar por causa dela quebraria o `FR-008` das features 006 e 011.
   */
  it('a condição importada não congela o carrinho; a escolhida pelo operador congela', () => {
    const { store } = montarStore();
    store.getState().descartarPagamento();
    expect(store.getState().podeMutarCarrinho()).toBe(true);

    store.getState().importarCondicaoPagamento(A_VISTA);

    expect(store.getState().condicaoSelecionada?.codigo).toBe(A_VISTA.codigo);
    expect(store.getState().podeMutarCarrinho()).toBe(true);

    // O operador escolhe outra: agora é a declaração de I7, e a venda congela.
    store.getState().selecionarCondicao(A_PRAZO);

    expect(store.getState().podeMutarCarrinho()).toBe(false);
  });

  /** A forma aprovada do documento congela, como em qualquer venda cobrada. */
  it('a forma aprovada do documento congela mesmo com condição importada', () => {
    const { store } = montarStore();
    store.getState().descartarPagamento();

    store.getState().importarCondicaoPagamento(A_VISTA);
    store.getState().importarFormasDePagamento([
      {
        formaCodigo: 1,
        formaMeioPagtoNFe: MEIO_PAGTO.Dinheiro,
        valor: centavos(10_000),
        tef: null,
        pixGuid: null,
        ticketDevolucao: null,
      },
    ]);

    expect(store.getState().pagamentos[0]?.status).toBe('APROVADO');
    expect(store.getState().podeMutarCarrinho()).toBe(false);
  });

  /**
   * A forma excluída já emitiu o seu `FORMA_PAGAMENTO_REMOVIDA` quando foi
   * riscada. Reemiti-lo no descarte mandaria ao ERP, no `Log` de `FaturarNFCe`,
   * a mesma forma removida duas vezes.
   */
  it('não reemite FORMA_PAGAMENTO_REMOVIDA para a forma já excluída', async () => {
    const { store } = montarStore();

    await store.getState().aplicarPagamento({ forma: DINHEIRO, valorInformado: centavos(10_000) });
    store.getState().removerPagamento('pag-1');
    store.getState().descartarPagamento();

    const removidas = store
      .getState()
      .eventos.filter((evento) => evento.tipo === 'FORMA_PAGAMENTO_REMOVIDA');
    expect(removidas).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ *
 * T015 — bloqueio do carrinho reversível vs. irreversível
 * ------------------------------------------------------------------ */

describe('pagamentoSlice — bloqueio do carrinho (T015, I6/I7, Cenário 6)', () => {
  it('a condição escolhida já bloqueia o carrinho, antes de qualquer forma (pedido do usuário, 2026-09-04)', () => {
    // `montarStore` seleciona A_VISTA na montagem — é o estado em que a tela
    // fica assim que o operador escolhe a condição, sem nenhum pagamento.
    const { store } = montarStore();

    expect(store.getState().pagamentos).toEqual([]);
    expect(store.getState().podeMutarCarrinho()).toBe(false);
  });

  it('dinheiro sem integração bloqueia o carrinho; removê-lo não basta, é o descarte que devolve a mutabilidade', async () => {
    const { store } = montarStore();

    await store.getState().aplicarPagamento({ forma: DINHEIRO, valorInformado: centavos(10_000) });
    expect(store.getState().podeMutarCarrinho()).toBe(false);

    store.getState().removerPagamento('pag-1');

    // A forma fica riscada na lista (AD-16x), não some do array — mas a
    // condição continua escolhida, e desde 2026-09-04 é ela, sozinha, que
    // congela a venda.
    expect(store.getState().pagamentos).toHaveLength(1);
    expect(store.getState().pagamentos[0]?.status).toBe('EXCLUIDO');
    expect(store.getState().podeMutarCarrinho()).toBe(false);

    store.getState().descartarPagamento();

    expect(store.getState().condicaoSelecionada).toBeNull();
    expect(store.getState().podeMutarCarrinho()).toBe(true);
  });

  it('cartão aprovado por TEF é irreversível e mantém o carrinho bloqueado', async () => {
    const { store, avisar } = montarStore({ capacidades: { tefAtivo: true, pixAtivo: false } });

    await store.getState().aplicarPagamento({ forma: CARTAO, valorInformado: centavos(10_000) });
    store.getState().confirmarPagamentoIntegrado('pag-1', {
      dadosTEF: {
        pagId: 'pay_exemplo_0001',
        bandeira: 'EXEMPLO',
        nsu: '000000',
        autorizacao: '000000',
        tipoIntegracao: '1',
      },
    });
    expect(store.getState().podeMutarCarrinho()).toBe(false);

    store.getState().removerPagamento('pag-1');

    expect(avisar).toHaveBeenCalledWith(AVISO_TEF_IRREVERSIVEL);
    expect(store.getState().pagamentos).toHaveLength(1);
    expect(store.getState().podeMutarCarrinho()).toBe(false);
  });

  it('descartarPagamento recusa quando há TEF aprovado — I6 vale para o bloco como para a forma', async () => {
    const { store, avisar } = montarStore({ capacidades: { tefAtivo: true, pixAtivo: false } });

    await store.getState().aplicarPagamento({ forma: CARTAO, valorInformado: centavos(10_000) });
    store.getState().confirmarPagamentoIntegrado('pag-1', { pixGuid: 'guid-exemplo' });

    store.getState().descartarPagamento();

    expect(avisar).toHaveBeenCalledWith(AVISO_TEF_IRREVERSIVEL);
    expect(store.getState().condicaoSelecionada).not.toBeNull();
    expect(store.getState().pagamentos).toHaveLength(1);
  });

  /**
   * AD-161 (itens 2 e 3 do usuário, 2026-09-04). A regra anterior tratava PIX e
   * TEF como o mesmo caso; o usuário separou os dois. O que este teste trava é o
   * recorte: PIX **é riscado** (não desaparece do array — pedido do usuário,
   * 2026-09-04) e o evento de auditoria continua sendo emitido — a confirmação
   * que a UI exibe decide se `removerPagamento` é chamada, nunca se o log é
   * escrito.
   */
  it('PIX aprovado fica excluído (riscado) na venda e preserva o log — só o TEF é irreversível (AD-161)', async () => {
    const { store, avisar } = montarStore({ capacidades: { tefAtivo: false, pixAtivo: true } });

    await store.getState().aplicarPagamento({ forma: PIX, valorInformado: centavos(10_000) });
    store.getState().confirmarPagamentoIntegrado('pag-1', { pixGuid: 'guid-exemplo' });
    expect(store.getState().pagamentos[0]?.status).toBe('APROVADO');

    store.getState().removerPagamento('pag-1');

    expect(avisar).not.toHaveBeenCalledWith(AVISO_TEF_IRREVERSIVEL);
    // Fica na lista, riscado — não sai do array. `calcularSaldo` e
    // `montarPagamentosParaPayload` já ignoram tudo que não é `APROVADO`.
    expect(store.getState().pagamentos).toHaveLength(1);
    expect(store.getState().pagamentos[0]?.status).toBe('EXCLUIDO');
    expect(store.getState().saldo().totalAplicado).toBe(0);
    expect(
      store.getState().eventos.some((evento) => evento.tipo === 'FORMA_PAGAMENTO_REMOVIDA'),
    ).toBe(true);
    // Feature 018 (FR-013): a cobrança PIX aprovada leva o identificador ao `Log`.
    expect(detalhesDasRemocoes(store)).toEqual([
      expect.objectContaining({ motivo: 'OPERADOR', valor: 10_000, pixGuid: 'guid-exemplo' }),
    ]);
  });

  // Feature 018, FR-010/FR-011: o evento deixa de levar só o nome da forma.
  it('removerPagamento de dinheiro registra valor recebido e motivo OPERADOR, sem identificador', async () => {
    const { store } = montarStore();

    await store.getState().aplicarPagamento({ forma: DINHEIRO, valorInformado: centavos(5_000) });
    store.getState().removerPagamento('pag-1');

    const [detalhes] = detalhesDasRemocoes(store);
    expect(detalhes).toMatchObject({ valor: 5_000, motivo: 'OPERADOR' });
    expect(detalhes).not.toHaveProperty('tefPagId');
    expect(detalhes).not.toHaveProperty('pixGuid');
  });

  it('descartarPagamento aceita venda com PIX aprovado (AD-161)', async () => {
    const { store, avisar } = montarStore({ capacidades: { tefAtivo: false, pixAtivo: true } });

    await store.getState().aplicarPagamento({ forma: PIX, valorInformado: centavos(10_000) });
    store.getState().confirmarPagamentoIntegrado('pag-1', { pixGuid: 'guid-exemplo' });

    store.getState().descartarPagamento();

    expect(avisar).not.toHaveBeenCalledWith(AVISO_TEF_IRREVERSIVEL);
    expect(store.getState().condicaoSelecionada).toBeNull();
    expect(store.getState().pagamentos.map((pagamento) => pagamento.status)).toEqual(['EXCLUIDO']);
  });

  it('descartarPagamento limpa condição, formas, desconto e vales, e audita cada forma removida', async () => {
    // Sem `linhas`: com a lista de rateio vazia, só a regra "não zera a venda"
    // fala, e 10,00 sobre um subtotal de 100,00 passa.
    const { store, invalidarVeredito } = montarStore();

    store.getState().aplicarDescontoCapa('VALOR', 1_000);
    await store.getState().aplicarPagamento({ forma: DINHEIRO, valorInformado: centavos(1_000) });

    store.getState().descartarPagamento();

    expect(store.getState().condicaoSelecionada).toBeNull();
    // Feature 018: a forma continua na lista, riscada, e fora do saldo.
    expect(store.getState().pagamentos.map((pagamento) => pagamento.status)).toEqual(['EXCLUIDO']);
    expect(store.getState().saldo().totalAplicado).toBe(0);
    expect(store.getState().descontoCapa).toBeNull();
    expect(store.getState().valesDevolucao).toEqual([]);
    expect(tiposDeEvento(store)).toContain('FORMA_PAGAMENTO_REMOVIDA');
    // `FR-021`/I11: o veredito da 014 valia para a venda daquele instante.
    expect(invalidarVeredito).toHaveBeenCalled();
  });

  /* ---------------------------------------------------------------- *
   * Feature 018, US2 — "Limpar" preserva o histórico das formas
   * ---------------------------------------------------------------- */

  it('"Limpar" mantém as formas já riscadas e risca só as vivas, com um evento LIMPAR por forma que era viva (FR-002 a FR-004)', async () => {
    const { store } = montarStore();

    await store.getState().aplicarPagamento({ forma: DINHEIRO, valorInformado: centavos(4_000) });
    store.getState().removerPagamento('pag-1');
    await store.getState().aplicarPagamento({ forma: DINHEIRO, valorInformado: centavos(6_000) });

    store.getState().descartarPagamento();

    const { pagamentos } = store.getState();
    expect(pagamentos.map((pagamento) => pagamento.status)).toEqual(['EXCLUIDO', 'EXCLUIDO']);
    expect(pagamentos.map((pagamento) => pagamento.idPagamento)).toEqual(['pag-1', 'pag-2']);
    expect(detalhesDasRemocoes(store)).toEqual([
      expect.objectContaining({ valor: 4_000, motivo: 'OPERADOR' }),
      // Só a que **era** viva ganha o `LIMPAR`; a já riscada não reemite.
      expect.objectContaining({ valor: 6_000, motivo: 'LIMPAR' }),
    ]);
    expect(store.getState().podeMutarCarrinho()).toBe(true);
  });

  it('"Limpar" com só formas riscadas e sem condição nem capa é no-op, sem evento (FR-006)', async () => {
    const { store, invalidarVeredito } = montarStore();
    await store.getState().aplicarPagamento({ forma: DINHEIRO, valorInformado: centavos(10_000) });
    store.getState().removerPagamento('pag-1');
    store.getState().descartarPagamento();
    const eventosAntes = store.getState().eventos.length;
    invalidarVeredito.mockClear();

    store.getState().descartarPagamento();

    expect(store.getState().eventos).toHaveLength(eventosAntes);
    expect(store.getState().pagamentos).toHaveLength(1);
    expect(invalidarVeredito).not.toHaveBeenCalled();
  });

  it('"Limpar" com TEF estornado e condição zera a condição e mantém o TEF riscado (FR-003)', async () => {
    const { store } = montarStore({ capacidades: { tefAtivo: true, pixAtivo: false } });
    await store.getState().aplicarPagamento({ forma: CARTAO, valorInformado: centavos(10_000) });
    store.getState().confirmarPagamentoIntegrado('pag-1', {
      dadosTEF: {
        pagId: 'pay_exemplo_0001',
        bandeira: 'EXEMPLO',
        nsu: '000000',
        autorizacao: '000000',
        tipoIntegracao: '1',
      },
    });
    store.getState().confirmarEstornoTef('pag-1');

    store.getState().descartarPagamento();

    expect(store.getState().condicaoSelecionada).toBeNull();
    expect(store.getState().pagamentos.map((pagamento) => pagamento.status)).toEqual(['EXCLUIDO']);
    // O estorno já tinha o seu evento; o "Limpar" não o repete.
    expect(detalhesDasRemocoes(store)).toHaveLength(1);
  });

  it('PIX pendente riscado pelo "Limpar" não volta a valer quando a aprovação chega depois', async () => {
    const { store } = montarStore({ capacidades: { tefAtivo: false, pixAtivo: true } });
    await store.getState().aplicarPagamento({ forma: PIX, valorInformado: centavos(10_000) });
    expect(store.getState().pagamentos[0]?.status).toBe('PENDENTE_INTEGRACAO');

    store.getState().descartarPagamento();
    store.getState().confirmarPagamentoIntegrado('pag-1', { pixGuid: 'guid-tardio' });

    expect(store.getState().pagamentos[0]?.status).toBe('EXCLUIDO');
    expect(store.getState().saldo().totalAplicado).toBe(0);
  });

  it('depois do "Limpar", nova condição e nova forma entram normalmente ao lado das riscadas (FR-008)', async () => {
    const { store } = montarStore();
    await store.getState().aplicarPagamento({ forma: DINHEIRO, valorInformado: centavos(10_000) });
    store.getState().descartarPagamento();

    store.getState().selecionarCondicao(A_PRAZO);
    await store.getState().aplicarPagamento({ forma: DINHEIRO, valorInformado: centavos(10_000) });

    expect(store.getState().pagamentos.map((pagamento) => pagamento.status)).toEqual([
      'EXCLUIDO',
      'APROVADO',
    ]);
    expect(store.getState().saldo().saldoRestante).toBe(0);
    expect(store.getState().montarPagamentosParaPayload().FormasDePagamento).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ *
 * Venda sem valor líquido não recebe pagamento (pedido do usuário, 2026-09-04)
 * ------------------------------------------------------------------ */

describe('pagamentoSlice — o desconto de capa congela o carrinho (regra do usuário, 2026-09-04)', () => {
  it('desconto aplicado bloqueia a mutação, e removê-lo devolve a mutabilidade', () => {
    const { store } = montarStore();
    // Sem condição, o carrinho estaria livre; é o desconto que o congela aqui.
    store.getState().descartarPagamento();
    expect(store.getState().podeMutarCarrinho()).toBe(true);

    store.getState().aplicarDescontoCapa('VALOR', 1_000);

    expect(store.getState().podeMutarCarrinho()).toBe(false);

    store.getState().removerDescontoCapa();

    expect(store.getState().podeMutarCarrinho()).toBe(true);
  });
});

describe('pagamentoSlice — venda sem valor a cobrar', () => {
  it('o vale devolução recusa antes de consultar o ERP e antes de pedir confirmação de perda', async () => {
    // Correção da revisão: o fluxo consultava `ValidaTicketDevolucao`, calculava
    // um excedente igual ao ticket inteiro e pedia ao operador que confirmasse
    // a perda — para só então recusar por venda sem valor.
    const { store, avisar, validarTicket } = montarStore({ subtotal: 0 });
    const confirmarExcedente = vi.fn(async () => true);

    const aplicado = await store
      .getState()
      .aplicarValeDevolucao(VALE, 'TICKET-1', confirmarExcedente);

    expect(aplicado).toBe(false);
    expect(validarTicket).not.toHaveBeenCalled();
    expect(confirmarExcedente).not.toHaveBeenCalled();
    expect(avisar).toHaveBeenCalledWith(AVISO_VENDA_SEM_VALOR);
  });

  it('recusa a forma com o motivo próprio, não com "saldo já coberto"', async () => {
    const { store, avisar, validarInsercao } = montarStore({ subtotal: 0 });

    await store.getState().aplicarPagamento({ forma: DINHEIRO, valorInformado: centavos(1_000) });

    expect(store.getState().pagamentos).toEqual([]);
    expect(avisar).toHaveBeenCalledWith(AVISO_VENDA_SEM_VALOR);
    expect(avisar).not.toHaveBeenCalledWith(AVISO_SALDO_JA_COBERTO);
    // A recusa é local: o ERP não chega a ser consultado (`FR-020`).
    expect(validarInsercao).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ *
 * T016 — remoção invalida o veredito
 * ------------------------------------------------------------------ */

describe('pagamentoSlice — invalidação do veredito ao remover (T016, FR-021)', () => {
  it('remover chama invalidarVeredito e força nova validação na inserção seguinte', async () => {
    const { store, validarInsercao, invalidarVeredito } = montarStore();

    await store.getState().aplicarPagamento({ forma: DINHEIRO, valorInformado: centavos(5_000) });
    expect(validarInsercao).toHaveBeenCalledTimes(1);

    store.getState().removerPagamento('pag-1');
    expect(invalidarVeredito).toHaveBeenCalledTimes(1);

    // Candidata idêntica à anterior: o veredito antigo valia para a venda de
    // **antes** da remoção, então o ERP é consultado de novo.
    await store.getState().aplicarPagamento({ forma: DINHEIRO, valorInformado: centavos(5_000) });

    expect(validarInsercao).toHaveBeenCalledTimes(2);
  });
});

/* ------------------------------------------------------------------ *
 * T017 / T025 — recusa local encerra antes de qualquer rede
 * ------------------------------------------------------------------ */

describe('pagamentoSlice — validação local antes do ERP (T017/T025, FR-020/FR-013)', () => {
  it('segunda forma dinheiro encerra sem validarInsercao e sem nenhuma chamada de rede', async () => {
    const { store, validarInsercao, validarTicket, iniciarIntegracao, avisar } = montarStore();
    await store.getState().aplicarPagamento({ forma: DINHEIRO, valorInformado: centavos(3_000) });
    validarInsercao.mockClear();

    await store.getState().aplicarPagamento({ forma: DINHEIRO, valorInformado: centavos(2_000) });

    expect(validarInsercao).not.toHaveBeenCalled();
    expect(validarTicket).not.toHaveBeenCalled();
    expect(iniciarIntegracao).not.toHaveBeenCalled();
    expect(avisar).toHaveBeenCalledWith(AVISO_DINHEIRO_DUPLICADO);
  });

  it('a lista permanece com os pagamentos anteriores após o bloqueio (SC-003, I2)', async () => {
    const { store } = montarStore();
    await store.getState().aplicarPagamento({ forma: CARTAO, valorInformado: centavos(7_000) });
    await store.getState().aplicarPagamento({ forma: DINHEIRO, valorInformado: centavos(5_000) });

    await store.getState().aplicarPagamento({ forma: DINHEIRO, valorInformado: centavos(1_000) });

    expect(store.getState().pagamentos).toHaveLength(2);
    expect(store.getState().pagamentos.map((pagamento) => pagamento.formaCodigo)).toEqual([2, 1]);
  });
});

/* ------------------------------------------------------------------ *
 * T021 / T022 / T023 — roteamento de integração
 * ------------------------------------------------------------------ */

describe('pagamentoSlice — roteamento de integração (T021/T022/T023)', () => {
  it('cartão com TEF ativo entra pendente e só audita após a confirmação (FR-004)', async () => {
    const { store, iniciarIntegracao } = montarStore({
      capacidades: { tefAtivo: true, pixAtivo: false },
    });

    await store.getState().aplicarPagamento({ forma: CARTAO, valorInformado: centavos(7_000) });

    expect(store.getState().pagamentos[0]?.status).toBe('PENDENTE_INTEGRACAO');
    expect(iniciarIntegracao).toHaveBeenCalledWith('TEF', {
      idPagamento: 'pag-1',
      formaCodigo: CARTAO.codigo,
      valor: 7_000,
    });
    // Pendente não conta para o total aplicado. O carrinho, porém, já está
    // congelado — não por este pagamento, mas pela condição escolhida na
    // montagem do store (regra de 2026-09-04): um `PENDENTE_INTEGRACAO` na
    // prática só existe com condição selecionada.
    expect(store.getState().saldo().totalAplicado).toBe(0);
    expect(store.getState().podeMutarCarrinho()).toBe(false);
    expect(tiposDeEvento(store)).not.toContain('FORMA_PAGAMENTO_APLICADA');

    store.getState().confirmarPagamentoIntegrado('pag-1', { pixGuid: undefined });

    expect(store.getState().pagamentos[0]?.status).toBe('APROVADO');
    expect(tiposDeEvento(store)).toContain('FORMA_PAGAMENTO_APLICADA');
  });

  it('Pix com pixAtivo entra pendente; a recusa remove o pagamento e audita (FR-005)', async () => {
    const { store, iniciarIntegracao } = montarStore({
      capacidades: { tefAtivo: false, pixAtivo: true },
    });

    await store.getState().aplicarPagamento({ forma: PIX, valorInformado: centavos(10_000) });
    expect(iniciarIntegracao).toHaveBeenCalledWith('PIX_DINAMICO', {
      idPagamento: 'pag-1',
      formaCodigo: PIX.codigo,
      valor: 10_000,
    });

    store.getState().recusarPagamentoIntegrado('pag-1', 'QR Code expirado');

    expect(store.getState().pagamentos).toEqual([]);
    const recusa = store.getState().eventos.find((evento) => evento.tipo === 'PAGAMENTO_RECUSADO');
    expect(recusa?.detalhes).toEqual({ tipo: 'Pix', motivo: 'QR Code expirado' });
  });

  it('PixEstatico nunca dispara iniciarIntegracao (FR-006)', async () => {
    const { store, iniciarIntegracao } = montarStore({
      capacidades: { tefAtivo: true, pixAtivo: true },
    });

    await store
      .getState()
      .aplicarPagamento({ forma: PIX_ESTATICO, valorInformado: centavos(10_000) });

    expect(iniciarIntegracao).not.toHaveBeenCalled();
    expect(store.getState().pagamentos[0]?.status).toBe('APROVADO');
    expect(store.getState().pagamentos[0]?.integracao).toBe('NENHUMA');
  });

  it('cartão roteia TEF sempre que tefAtivo, sem eixo de plataforma (FR-007, AD-144)', async () => {
    // AD-144 revogou a exclusão de TEF no mobile (AD-074): não existe parâmetro
    // de layout em lugar nenhum deste caminho, então não há caso "mobile" a
    // testar — o mesmo `tefAtivo` produz o mesmo veredito sempre.
    const { store, iniciarIntegracao } = montarStore({
      capacidades: { tefAtivo: true, pixAtivo: false },
    });

    await store.getState().aplicarPagamento({ forma: CARTAO, valorInformado: centavos(1_000) });

    expect(store.getState().pagamentos[0]?.integracao).toBe('TEF');
    expect(iniciarIntegracao).toHaveBeenCalledTimes(1);
  });
});

/* ------------------------------------------------------------------ *
 * T018 — disponibilidade por flag
 * ------------------------------------------------------------------ */

describe('pagamentoSlice — disponibilidade por flag (T018, FR-001..FR-003)', () => {
  it('com tefAtivo: false o cartão continua aplicável como pagamento manual', async () => {
    const capacidades: CapacidadesPagamento = { tefAtivo: false, pixAtivo: true };
    const { store, iniciarIntegracao } = montarStore({ capacidades });

    expect(formaDisponivel(CARTAO, capacidades)).toBe(true);
    await store.getState().aplicarPagamento({ forma: CARTAO, valorInformado: centavos(10_000) });

    expect(store.getState().pagamentos[0]?.status).toBe('APROVADO');
    expect(iniciarIntegracao).not.toHaveBeenCalled();
  });

  it('com pixAtivo: false o Pix fica indisponível, mas o PixEstatico permanece', () => {
    const capacidades: CapacidadesPagamento = { tefAtivo: true, pixAtivo: false };

    expect(formaDisponivel(PIX, capacidades)).toBe(false);
    expect(formaDisponivel(PIX_ESTATICO, capacidades)).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * T024 / T026 — split, troco e limite ao saldo
 * ------------------------------------------------------------------ */

describe('pagamentoSlice — split e troco (T024/T026, Cenário 3)', () => {
  it('cartão 70,00 + dinheiro recebido 50,00 sobre 100,00 → aplicado 30,00 e troco 20,00', async () => {
    const { store } = montarStore();

    await store.getState().aplicarPagamento({ forma: CARTAO, valorInformado: centavos(7_000) });
    expect(store.getState().saldo().saldoRestante).toBe(3_000);

    await store.getState().aplicarPagamento({ forma: DINHEIRO, valorInformado: centavos(5_000) });

    const dinheiro = store.getState().pagamentos[1];
    expect(dinheiro?.valorAplicado).toBe(3_000);
    expect(dinheiro?.valorRecebido).toBe(5_000);

    const saldo = store.getState().saldo();
    expect(saldo.saldoRestante).toBe(0);
    expect(saldo.troco).toBe(2_000);
    expect(saldo.totalAplicado).toBe(10_000);
  });

  it('Pix no valor exato do saldo é aplicado e não gera troco (FR-012)', async () => {
    const { store } = montarStore({ capacidades: { tefAtivo: false, pixAtivo: true } });

    await store.getState().aplicarPagamento({ forma: PIX, valorInformado: centavos(10_000) });
    store.getState().confirmarPagamentoIntegrado('pag-1', { pixGuid: 'GUID-EXEMPLO' });

    expect(store.getState().pagamentos[0]?.valorAplicado).toBe(10_000);
    expect(store.getState().pagamentos[0]?.valorRecebido).toBeNull();
    expect(store.getState().saldo().troco).toBe(0);
  });
});

/* ------------------------------------------------------------------ *
 * FR-024 — forma sem troco não recebe acima do saldo
 * ------------------------------------------------------------------ */

/**
 * Correção do usuário (2026-09-04). Até então o excedente de uma forma sem
 * troco era **truncado em silêncio** por `derivarValores`: o operador digitava
 * 150,00 no PIX de uma venda de 100,00 e o ERP recebia `FormaValor: 100.00`,
 * sem que nada avisasse que o valor mudou.
 */
describe('pagamentoSlice — forma sem troco acima do saldo (FR-024)', () => {
  it('recusa Pix acima do saldo, avisa, e não muta nem aciona integração', async () => {
    const { store, validarInsercao, iniciarIntegracao, avisar } = montarStore({
      capacidades: { tefAtivo: false, pixAtivo: true },
    });

    await store.getState().aplicarPagamento({ forma: PIX, valorInformado: centavos(15_000) });

    expect(avisar).toHaveBeenCalledWith(AVISO_VALOR_ACIMA_DO_SALDO);
    expect(store.getState().pagamentos).toEqual([]);
    // `FR-020`: recusa local não consulta o ERP nem abre cobrança PIX.
    expect(validarInsercao).not.toHaveBeenCalled();
    expect(iniciarIntegracao).not.toHaveBeenCalled();
  });

  it('recusa cartão acima do saldo restante de um pagamento parcial', async () => {
    const { store, avisar } = montarStore();

    await store.getState().aplicarPagamento({ forma: DINHEIRO, valorInformado: centavos(6_000) });
    expect(store.getState().saldo().saldoRestante).toBe(4_000);

    await store.getState().aplicarPagamento({ forma: CARTAO, valorInformado: centavos(4_001) });

    expect(avisar).toHaveBeenCalledWith(AVISO_VALOR_ACIMA_DO_SALDO);
    expect(store.getState().pagamentos).toHaveLength(1);
  });

  it('dinheiro acima do saldo continua aceito — o excedente é troco', async () => {
    const { store, avisar } = montarStore();

    await store.getState().aplicarPagamento({ forma: DINHEIRO, valorInformado: centavos(15_000) });

    expect(avisar).not.toHaveBeenCalledWith(AVISO_VALOR_ACIMA_DO_SALDO);
    expect(store.getState().pagamentos).toHaveLength(1);
    expect(store.getState().saldo().troco).toBe(5_000);
  });
});

/* ------------------------------------------------------------------ *
 * T027 — montagem do payload
 * ------------------------------------------------------------------ */

describe('pagamentoSlice — montagem do payload (T027, erp-pagamento-api.md §3)', () => {
  it('soma o total líquido mais o troco em reais, só com aprovados e com FormaEntrada (AD-284)', async () => {
    const { store } = montarStore({ capacidades: { tefAtivo: false, pixAtivo: true } });

    // Um Pix pendente que **não** pode entrar no payload…
    await store.getState().aplicarPagamento({ forma: PIX, valorInformado: centavos(2_000) });
    // …e o split do Cenário 3, que fecha os 100,00.
    await store.getState().aplicarPagamento({ forma: CARTAO, valorInformado: centavos(7_000) });
    await store.getState().aplicarPagamento({ forma: DINHEIRO, valorInformado: centavos(5_000) });

    const payload = store.getState().montarPagamentosParaPayload();

    expect(payload.CondicaoPagamentoCodigo).toBe(A_VISTA.codigo);
    expect(payload.FormasDePagamento).toHaveLength(2);

    const soma = payload.FormasDePagamento.reduce<number>(
      (acumulado, forma) => acumulado + Number(forma.FormaValor),
      0,
    );
    // Feature 018: o dinheiro vai com o que o cliente entregou, então a soma é o
    // total (100,00) **mais** o troco (20,00) — o ERP deriva o troco da diferença.
    expect(soma).toBeCloseTo(emReais(TOTAL_PADRAO + 2_000), 10);

    expect(payload.FormasDePagamento[0]).toEqual({
      FormaCodigo: CARTAO.codigo,
      FormaMeioPagtoNFe: MEIO_PAGTO.CartaoCredito,
      FormaValor: 70,
      FormaIntegracaoCartao: '1',
      // `FormaFpgUtiCar` entrou no payload com a feature 014: é por ele que o
      // ERP reconhece crediário ao somar `&TotalCrediario`. Faltava, e sem ele o
      // gate aprovaria a venda acima do limite de crédito — mesmo modo de falha
      // já corrigido para `FormaEntrada` (AD-111).
      FormaFpgUtiCar: '',
      FormaEntrada: 'N',
      TicketDevolucao: '',
    });
    expect(payload.FormasDePagamento[1]).toEqual({
      FormaCodigo: DINHEIRO.codigo,
      FormaMeioPagtoNFe: MEIO_PAGTO.Dinheiro,
      // O recebido (50,00), não os 30,00 que quitaram a venda.
      FormaValor: 50,
      FormaIntegracaoCartao: '',
      FormaFpgUtiCar: '',
      FormaEntrada: 'S',
      TicketDevolucao: '',
    });

    // A tela não muda: quem quita a venda continua sendo o aplicado, e o troco de
    // 20,00 segue no saldo. O contrato não tem campo de troco.
    expect(store.getState().saldo().troco).toBe(2_000);
    expect(store.getState().saldo().saldoRestante).toBe(0);
    expect(JSON.stringify(payload.FormasDePagamento).toLowerCase()).not.toContain('troco');
  });
});

/* ------------------------------------------------------------------ *
 * T032 / T033 — desconto de capa
 * ------------------------------------------------------------------ */

describe('pagamentoSlice — desconto de capa (T032/T033, Cenário 4)', () => {
  const LINHAS: readonly LinhaRateavel[] = [
    { idLinha: 'linha-1', totalLiquido: centavos(7_000) },
    { idLinha: 'linha-2', totalLiquido: centavos(2_900) },
    { idLinha: 'linha-3', totalLiquido: centavos(100) },
  ];

  it('desconto acima do subtotal é bloqueado com aviso (I8)', () => {
    const { store, avisar } = montarStore({ linhas: LINHAS });

    store.getState().aplicarDescontoCapa('VALOR', 15_000);

    expect(store.getState().descontoCapa).toBeNull();
    expect(avisar).toHaveBeenCalledWith(AVISO_DESCONTO_ZERA_A_VENDA);
  });

  it('desconto exatamente igual ao subtotal é bloqueado: a venda não pode zerar', () => {
    // O antigo limite (`> subtotal`) aceitava este caso e produzia uma nota de
    // R$ 0,00 — nenhuma forma de pagamento consegue fechá-la (pedido do
    // usuário, 2026-09-04).
    const { store, avisar } = montarStore({ linhas: LINHAS });

    store.getState().aplicarDescontoCapa('VALOR', 10_000);

    expect(store.getState().descontoCapa).toBeNull();
    expect(avisar).toHaveBeenCalledWith(AVISO_DESCONTO_ZERA_A_VENDA);
  });

  it('desconto que o rateio faria zerar uma linha é bloqueado, mesmo cabendo no subtotal', () => {
    // 10,00 entre 70,00 / 29,00 / 1,00: a divisão igual daria 3,33 a cada uma,
    // a terceira estoura e o clamp a fixa em 1,00 — deixando-a valendo zero.
    // Cabe no subtotal (o total ainda seria 90,00), e é justamente o caso que a
    // regra nova recusa (pedido do usuário, 2026-09-04).
    const { store, avisar } = montarStore({ linhas: LINHAS });

    store.getState().aplicarDescontoCapa('VALOR', 1_000);

    expect(store.getState().descontoCapa).toBeNull();
    expect(avisar).toHaveBeenCalledWith(AVISO_DESCONTO_ZERA_ITEM);
  });

  it('removerDescontoCapa zera o rateio sem deixar resíduo (FR-015)', () => {
    const { store } = montarStore({ linhas: LINHAS });

    // 2,97 divide exato em 99 centavos por linha e deixa a de 1,00 valendo o
    // mínimo de 1 centavo — o maior desconto de divisão exata que este carrinho
    // aceita. A partir de 3,00 a parcela chega a 1,00 e cai em
    // `AVISO_DESCONTO_ZERA_ITEM`.
    store.getState().aplicarDescontoCapa('VALOR', 297);
    // Afirmado por chave, não por posição: a ordem de iteração do `Map` não faz
    // parte do contrato — o que importa é a parcela de cada linha.
    const comDesconto = rateioDoPayload(store);
    expect(comDesconto.get('linha-1')).toBe(99);
    expect(comDesconto.get('linha-2')).toBe(99);
    expect(comDesconto.get('linha-3')).toBe(99);
    expect(store.getState().saldo().totalLiquido).toBe(9_703);

    store.getState().removerDescontoCapa();

    const semDesconto = rateioDoPayload(store);
    expect([...semDesconto.values()]).toEqual([0, 0, 0]);
    expect(store.getState().saldo().totalLiquido).toBe(TOTAL_PADRAO);
  });

  it('com pagamento aplicado, o desconto é recusado com aviso (I12/FR-023/AD-113)', async () => {
    const { store, avisar } = montarStore({ linhas: LINHAS });
    await store.getState().aplicarPagamento({ forma: DINHEIRO, valorInformado: centavos(1_000) });

    // 10,00 está dentro do limite de I8 — o que barra aqui é exclusivamente a
    // existência de um pagamento aplicado.
    store.getState().aplicarDescontoCapa('VALOR', 1_000);

    expect(store.getState().descontoCapa).toBeNull();
    expect(avisar).toHaveBeenCalledWith(AVISO_DESCONTO_COM_PAGAMENTO);
  });
});

/* ------------------------------------------------------------------ *
 * T038 — vale devolução
 * ------------------------------------------------------------------ */

/**
 * O vale devolução é a **forma** `FpgUtiCar = 'VDV'`, e aplicá-lo insere um
 * pagamento com o valor do ticket. Substitui os casos de AD-048, em que o vale
 * era somado sobre um pagamento já existente.
 */
describe('pagamentoSlice — vale devolução como forma de pagamento (VDV)', () => {
  const CODIGO_VALE = 'TCK-000000-EXEMPLO';

  it('vale válido insere o pagamento com o valor do ticket e emite VALE_DEVOLUCAO_USADO', async () => {
    const { store, validarTicket } = montarStore();
    validarTicket.mockResolvedValue({ valido: true, valor: centavos(2_550) });

    const aplicado = await store.getState().aplicarValeDevolucao(VALE, CODIGO_VALE);

    expect(aplicado).toBe(true);
    expect(store.getState().pagamentos).toHaveLength(1);
    expect(store.getState().pagamentos[0]?.valorAplicado).toBe(2_550);
    expect(store.getState().pagamentos[0]?.ticketDevolucao).toBe(CODIGO_VALE);
    expect(store.getState().valesDevolucao).toEqual([
      { codigo: CODIGO_VALE, valor: 2_550, idPagamento: 'pag-1' },
    ]);
    const usado = store.getState().eventos.find((evento) => evento.tipo === 'VALE_DEVOLUCAO_USADO');
    expect(usado?.detalhes).toEqual({ codigoVale: CODIGO_VALE, valor: 2_550 });
  });

  it('o mesmo código duas vezes é recusado sem rede — o ERP só baixa o ticket no faturamento', async () => {
    const { store, validarTicket, avisar } = montarStore();
    validarTicket.mockResolvedValue({ valido: true, valor: centavos(2_550) });
    await store.getState().aplicarValeDevolucao(VALE, CODIGO_VALE);

    const segundo = await store.getState().aplicarValeDevolucao(VALE, CODIGO_VALE);

    expect(segundo).toBe(false);
    expect(store.getState().pagamentos).toHaveLength(1);
    expect(avisar).toHaveBeenCalledWith(AVISO_VALE_JA_APLICADO);
    // Sem 2ª consulta: `PValidaTicketNFCe` ainda diria "válido", porque o ticket
    // só vira `DevTicSit = 3` na ação 'emitir', no faturamento.
    expect(validarTicket).toHaveBeenCalledTimes(1);
  });

  it('dois tickets diferentes na mesma venda são aceitos', async () => {
    const { store, validarTicket } = montarStore();
    validarTicket.mockResolvedValue({ valido: true, valor: centavos(2_000) });

    await store.getState().aplicarValeDevolucao(VALE, 'TCK-A');
    await store.getState().aplicarValeDevolucao(VALE, 'TCK-B');

    expect(store.getState().pagamentos).toHaveLength(2);
    expect(store.getState().valesDevolucao.map((vale) => vale.codigo)).toEqual(['TCK-A', 'TCK-B']);
  });

  it('vale inválido avisa com a mensagem do ERP e emite PAGAMENTO_RECUSADO sem inserir', async () => {
    const { store, validarTicket, avisar } = montarStore();
    validarTicket.mockResolvedValue({ valido: false, mensagem: 'Ticket já utilizado' });

    const aplicado = await store.getState().aplicarValeDevolucao(VALE, CODIGO_VALE);

    expect(aplicado).toBe(false);
    expect(store.getState().pagamentos).toEqual([]);
    expect(store.getState().valesDevolucao).toEqual([]);
    expect(avisar).toHaveBeenCalledWith('Ticket já utilizado');
    const recusa = store.getState().eventos.find((evento) => evento.tipo === 'PAGAMENTO_RECUSADO');
    expect(recusa?.detalhes).toEqual({ tipo: 'Outros', motivo: 'Ticket já utilizado' });
  });

  it('forma que não é VDV é no-op com aviso, sem nenhuma chamada de rede', async () => {
    const { store, validarTicket, avisar } = montarStore();

    const aplicado = await store.getState().aplicarValeDevolucao(CARTAO, CODIGO_VALE);

    expect(aplicado).toBe(false);
    expect(validarTicket).not.toHaveBeenCalled();
    expect(avisar).toHaveBeenCalledWith(AVISO_VALE_FORMA_ERRADA);
  });

  it('ticket maior que o saldo pergunta antes; recusada a confirmação, nada é aplicado (FR-026)', async () => {
    const { store, validarTicket } = montarStore();
    validarTicket.mockResolvedValue({ valido: true, valor: centavos(15_000) });
    const confirmar = vi.fn(async () => false);

    const aplicado = await store.getState().aplicarValeDevolucao(VALE, CODIGO_VALE, confirmar);

    expect(aplicado).toBe(false);
    expect(confirmar).toHaveBeenCalledWith({
      valorTicket: 15_000,
      saldoRestante: 10_000,
      excedente: 5_000,
    });
    expect(store.getState().pagamentos).toEqual([]);
    expect(store.getState().valesDevolucao).toEqual([]);
  });

  it('confirmado o excedente, aplica limitado ao saldo — a nota fecha e o ticket se perde (FR-026)', async () => {
    const { store, validarTicket } = montarStore();
    validarTicket.mockResolvedValue({ valido: true, valor: centavos(15_000) });
    const confirmar = vi.fn(async () => true);

    const aplicado = await store.getState().aplicarValeDevolucao(VALE, CODIGO_VALE, confirmar);

    expect(aplicado).toBe(true);
    // `Σ FormaValor` nunca ultrapassa o total da nota, mesmo com o ticket maior.
    expect(store.getState().pagamentos[0]?.valorAplicado).toBe(10_000);
    expect(store.getState().saldo().saldoRestante).toBe(0);
    // Vale devolução não gera troco (`FR-012`): os 50,00 excedentes somem.
    expect(store.getState().saldo().troco).toBe(0);
  });

  it('sem callback de confirmação, o excedente não é aplicado — o padrão é seguro', async () => {
    const { store, validarTicket } = montarStore();
    validarTicket.mockResolvedValue({ valido: true, valor: centavos(15_000) });

    const aplicado = await store.getState().aplicarValeDevolucao(VALE, CODIGO_VALE);

    expect(aplicado).toBe(false);
    expect(store.getState().pagamentos).toEqual([]);
  });

  it('ticket que cabe no saldo não pergunta nada', async () => {
    const { store, validarTicket } = montarStore();
    validarTicket.mockResolvedValue({ valido: true, valor: centavos(2_550) });
    const confirmar = vi.fn(async () => true);

    await store.getState().aplicarValeDevolucao(VALE, CODIGO_VALE, confirmar);

    expect(confirmar).not.toHaveBeenCalled();
    expect(store.getState().pagamentos).toHaveLength(1);
  });

  it('ERP indisponível avisa e não muta nada, sem evento de auditoria', async () => {
    const { store, validarTicket, avisar } = montarStore();
    validarTicket.mockRejectedValue(new Error('rede indisponível'));
    const eventosAntes = tiposDeEvento(store);

    await store.getState().aplicarValeDevolucao(VALE, CODIGO_VALE);

    expect(avisar).toHaveBeenCalledWith(AVISO_VALE_INDISPONIVEL);
    expect(store.getState().pagamentos).toEqual([]);
    expect(store.getState().valesDevolucao).toEqual([]);
    // Indisponibilidade técnica não é evento de domínio: a trilha fica intacta.
    expect(tiposDeEvento(store)).toEqual(eventosAntes);
  });

  it('remover o pagamento do vale libera o código para ser informado de novo', async () => {
    const { store, validarTicket } = montarStore();
    validarTicket.mockResolvedValue({ valido: true, valor: centavos(2_550) });
    await store.getState().aplicarValeDevolucao(VALE, CODIGO_VALE);

    store.getState().removerPagamento('pag-1');
    expect(store.getState().valesDevolucao).toEqual([]);

    const denovo = await store.getState().aplicarValeDevolucao(VALE, CODIGO_VALE);
    expect(denovo).toBe(true);
  });

  it('o ticket é validado exatamente uma vez — a montagem do payload nunca revalida (FR-009/SC-001)', async () => {
    const { store, validarTicket } = montarStore();
    validarTicket.mockResolvedValue({ valido: true, valor: centavos(2_550) });
    await store.getState().aplicarValeDevolucao(VALE, CODIGO_VALE);

    store.getState().saldo();
    const payload = store.getState().montarPagamentosParaPayload();

    expect(validarTicket).toHaveBeenCalledTimes(1);
    expect(payload.FormasDePagamento[0]?.TicketDevolucao).toBe(CODIGO_VALE);
  });
});

/* ------------------------------------------------------------------ *
 * `aplicarForma` — porta da feature 013 sobre o mesmo núcleo
 * ------------------------------------------------------------------ */

describe('pagamentoSlice — aplicarForma (porta da feature 013)', () => {
  it('resolve a forma pela condição e passa ATALHO_CENARIO ao gate', async () => {
    const { store, validarInsercao } = montarStore();

    await store.getState().aplicarForma(DINHEIRO.codigo, centavos(10_000));

    expect(validarInsercao).toHaveBeenCalledWith(
      {
        formaCodigo: DINHEIRO.codigo,
        meioPagtoNFe: MEIO_PAGTO.Dinheiro,
        valor: 10_000,
        fpgUtiCar: '',
        entrada: 'S',
        // Os dois campos entraram na candidata com a feature 014: o retrato
        // validado precisa descrever a forma exatamente como ela entraria no
        // payload de emissão (I5).
        integracaoCartao: '',
        ticketDevolucao: null,
        // Feature 018: o dinheiro entra na candidata com o recebido (I5).
        valorRecebido: 10_000,
      },
      'ATALHO_CENARIO',
    );
    expect(store.getState().pagamentos).toHaveLength(1);
  });

  it('aplicarPagamento passa MANUAL ao gate — é a única diferença entre as duas portas', async () => {
    const { store, validarInsercao } = montarStore();

    await store.getState().aplicarPagamento({ forma: DINHEIRO, valorInformado: centavos(10_000) });

    expect(validarInsercao.mock.calls[0]?.[1]).toBe('MANUAL');
  });

  it('código fora da condição selecionada é no-op com aviso', async () => {
    const { store, validarInsercao, avisar } = montarStore();

    await store.getState().aplicarForma(999, centavos(10_000));

    expect(validarInsercao).not.toHaveBeenCalled();
    expect(store.getState().pagamentos).toEqual([]);
    expect(avisar).toHaveBeenCalledWith(AVISO_FORMA_FORA_DA_CONDICAO);
  });
});

/* ------------------------------------------------------------------ *
 * Importação de DAV (feature 006) e limpeza (feature 004)
 * ------------------------------------------------------------------ */

describe('pagamentoSlice — importação e limpeza', () => {
  const IMPORTADAS: readonly FormaPagamentoImportada[] = [
    {
      formaCodigo: DINHEIRO.codigo,
      formaMeioPagtoNFe: MEIO_PAGTO.Dinheiro,
      valor: centavos(4_000),
      tef: null,
      pixGuid: null,
      ticketDevolucao: null,
    },
    {
      formaCodigo: DINHEIRO.codigo,
      formaMeioPagtoNFe: MEIO_PAGTO.Dinheiro,
      valor: centavos(6_000),
      tef: null,
      pixGuid: null,
      ticketDevolucao: null,
    },
    {
      formaCodigo: 90,
      formaMeioPagtoNFe: 'MeioInexistente',
      valor: centavos(1_000),
      tef: null,
      pixGuid: null,
      ticketDevolucao: null,
    },
  ];

  it('substitui a lista, aceita duas formas Dinheiro e descarta o meio desconhecido', async () => {
    const { store, validarInsercao } = montarStore();
    await store.getState().aplicarPagamento({ forma: CARTAO, valorInformado: centavos(1_000) });
    validarInsercao.mockClear();
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    store.getState().importarFormasDePagamento(IMPORTADAS);

    const pagamentos = store.getState().pagamentos;
    expect(pagamentos).toHaveLength(2);
    expect(pagamentos.every((pagamento) => pagamento.status === 'APROVADO')).toBe(true);
    expect(pagamentos.every((pagamento) => pagamento.integracao === 'NENHUMA')).toBe(true);
    expect(validarInsercao).not.toHaveBeenCalled();
    expect(aviso).toHaveBeenCalledTimes(1);
    // Nenhum `FORMA_PAGAMENTO_APLICADA` por forma: a 006 audita a importação
    // inteira com um único `DAV_IMPORTADO`.
    expect(tiposDeEvento(store).filter((tipo) => tipo === 'FORMA_PAGAMENTO_APLICADA')).toHaveLength(
      1,
    );
    aviso.mockRestore();
  });

  // Feature 018, FR-020: o ERP grava o dinheiro com o recebido; retomado, o
  // excedente volta a ser troco em vez de "pagamento acima do total".
  it('dinheiro do documento acima do total reconstrói o troco, sem acusar excesso (FR-020)', () => {
    const { store } = montarStore(); // subtotal R$ 100,00

    store.getState().importarFormasDePagamento([
      {
        formaCodigo: DINHEIRO.codigo,
        formaMeioPagtoNFe: MEIO_PAGTO.Dinheiro,
        valor: centavos(15_000),
        tef: null,
        pixGuid: null,
        ticketDevolucao: null,
      },
    ]);

    const [dinheiro] = store.getState().pagamentos;
    expect(dinheiro?.valorRecebido).toBe(15_000);
    expect(dinheiro?.valorAplicado).toBe(TOTAL_PADRAO);
    const saldo = store.getState().saldo();
    expect(saldo.saldoRestante).toBe(0);
    expect(saldo.troco).toBe(5_000);
    // O que vai de volta ao ERP é o mesmo recebido do documento.
    expect(store.getState().montarPagamentosParaPayload().FormasDePagamento[0]?.FormaValor).toBe(
      150,
    );
  });

  it('documento sem excedente segue com recebido igual ao aplicado (FR-021)', () => {
    const { store } = montarStore();

    store.getState().importarFormasDePagamento([
      {
        formaCodigo: DINHEIRO.codigo,
        formaMeioPagtoNFe: MEIO_PAGTO.Dinheiro,
        valor: centavos(TOTAL_PADRAO),
        tef: null,
        pixGuid: null,
        ticketDevolucao: null,
      },
    ]);

    const [dinheiro] = store.getState().pagamentos;
    expect(dinheiro?.valorRecebido).toBe(TOTAL_PADRAO);
    expect(dinheiro?.valorAplicado).toBe(TOTAL_PADRAO);
    expect(store.getState().saldo().troco).toBe(0);
  });

  it('limparPagamentos esvazia pagamentos, condição, desconto e vale', async () => {
    const { store } = montarStore();
    store.getState().aplicarDescontoCapa('VALOR', 1_000);
    await store.getState().aplicarPagamento({ forma: DINHEIRO, valorInformado: centavos(9_000) });

    store.getState().limparPagamentos();

    expect(store.getState().pagamentos).toEqual([]);
    expect(store.getState().condicaoSelecionada).toBeNull();
    expect(store.getState().descontoCapa).toBeNull();
    expect(store.getState().valesDevolucao).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * Cenário 8 — ordem dos eventos de auditoria
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * 017, US3 (T039) — capa pela condição, com teto
 * ------------------------------------------------------------------ */

describe('pagamentoSlice — capa pela condição de pagamento (017)', () => {
  // Subtotal R$ 100,00 (TOTAL_PADRAO).
  const COND_A = condicaoDe(10, 'COND A', undefined, { desconto: 5, descontoMaximo: 8 });
  const COND_B = condicaoDe(11, 'COND B', undefined, { desconto: 0, descontoMaximo: 0 });
  const COND_C = condicaoDe(12, 'COND C', undefined, { desconto: 10, descontoMaximo: 8 });
  const COND_SEM_TETO_COM_DESCONTO = condicaoDe(13, 'COND D', undefined, {
    desconto: 5,
    descontoMaximo: 0,
  });
  const COND_TUDO = condicaoDe(14, 'COND E', undefined, { desconto: 100, descontoMaximo: 100 });

  function eventosDeCapa(store: ReturnType<typeof montarStore>['store']) {
    return store
      .getState()
      .eventos.filter((evento) => evento.tipo === 'DESCONTO_CAPA_APLICADO')
      .map((evento) => evento.detalhes);
  }

  it('escolher a condição preenche a capa no mesmo set (I-D4)', () => {
    const { store } = montarStore();
    const quadros: { codigo: number | undefined; capa: boolean }[] = [];
    store.subscribe((estado) => {
      quadros.push({
        codigo: estado.condicaoSelecionada?.codigo,
        capa: estado.descontoCapa !== null,
      });
    });

    store.getState().selecionarCondicao(COND_A);

    expect(store.getState().descontoCapa).toEqual({
      modo: 'PERCENTUAL',
      entrada: 5,
      valorResolvido: 500,
      origem: 'CONDICAO',
    });
    expect(quadros.filter((quadro) => quadro.codigo === COND_A.codigo && !quadro.capa)).toEqual([]);
  });

  it('trocar a condição descarta a capa digitada (FR-019)', () => {
    const { store } = montarStore();
    store.getState().selecionarCondicao(COND_A);
    store.getState().aplicarDescontoCapa('PERCENTUAL', 7);
    expect(store.getState().descontoCapa?.origem).toBe('MANUAL');

    store.getState().selecionarCondicao(A_PRAZO);

    expect(store.getState().descontoCapa).toBeNull();
  });

  it('condição sem desconto deixa a capa vazia, sem aviso', () => {
    const { store, avisar } = montarStore();
    avisar.mockClear();

    store.getState().selecionarCondicao(COND_B);

    expect(store.getState().descontoCapa).toBeNull();
    expect(avisar).not.toHaveBeenCalled();
  });

  it('desconto com teto zero não aplica e avisa', () => {
    const { store, avisar } = montarStore();

    store.getState().selecionarCondicao(COND_SEM_TETO_COM_DESCONTO);

    expect(store.getState().descontoCapa).toBeNull();
    expect(avisar).toHaveBeenCalledWith(AVISO_CONDICAO_SEM_DESCONTO);
  });

  it('desconto acima do próprio teto aplica limitado e avisa (FR-020)', () => {
    const { store, avisar } = montarStore();

    store.getState().selecionarCondicao(COND_C);

    expect(store.getState().descontoCapa).toMatchObject({ entrada: 8, valorResolvido: 800 });
    expect(avisar).toHaveBeenCalledWith(avisoTetoDaCondicao(8));
  });

  it('capa automática que igualaria o subtotal não aplica e avisa (FR-021)', () => {
    const { store, avisar } = montarStore();

    store.getState().selecionarCondicao(COND_TUDO);

    expect(store.getState().descontoCapa).toBeNull();
    expect(store.getState().condicaoSelecionada?.codigo).toBe(COND_TUDO.codigo);
    expect(avisar).toHaveBeenCalledWith(AVISO_DESCONTO_ZERA_A_VENDA);
  });

  it('troca recusada com pagamento vivo mantém a capa', async () => {
    const { store } = montarStore();
    store.getState().selecionarCondicao(COND_A);
    await store.getState().aplicarPagamento({ forma: DINHEIRO, valorInformado: centavos(9_500) });

    store.getState().selecionarCondicao(COND_C);

    expect(store.getState().condicaoSelecionada?.codigo).toBe(COND_A.codigo);
    expect(store.getState().descontoCapa?.valorResolvido).toBe(500);
  });

  it('condição importada de documento não aplica capa automática', () => {
    const { store } = montarStore();
    store.setState({ condicaoSelecionada: null, descontoCapa: null });

    store.getState().importarCondicaoPagamento(COND_A);

    expect(store.getState().descontoCapa).toBeNull();
  });

  it('sem condição não há teto (FR-022)', () => {
    const { store } = montarStore();
    store.setState({ condicaoSelecionada: null });

    expect(store.getState().aplicarDescontoCapa('PERCENTUAL', 50)).toBe(true);
    expect(store.getState().descontoCapa?.valorResolvido).toBe(5_000);
  });

  it('a digitação acima do teto é ajustada e avisada; o teto zero recusa', () => {
    const { store, avisar } = montarStore();
    store.getState().selecionarCondicao(COND_A);
    avisar.mockClear();

    expect(store.getState().aplicarDescontoCapa('PERCENTUAL', 10)).toBe(true);
    expect(store.getState().descontoCapa).toEqual({
      modo: 'PERCENTUAL',
      entrada: 8,
      valorResolvido: 800,
      origem: 'MANUAL',
    });
    expect(avisar).toHaveBeenCalledWith(avisoTetoDaCondicao(8));

    store.getState().selecionarCondicao(COND_B);
    expect(store.getState().aplicarDescontoCapa('VALOR', 100)).toBe(false);
    expect(avisar).toHaveBeenCalledWith(AVISO_CONDICAO_SEM_DESCONTO);
  });

  it('a digitação silenciosa ajusta sem avisar', () => {
    const { store, avisar } = montarStore();
    store.getState().selecionarCondicao(COND_A);
    avisar.mockClear();

    store.getState().aplicarDescontoCapa('PERCENTUAL', 10, { silencioso: true });

    expect(store.getState().descontoCapa?.entrada).toBe(8);
    expect(avisar).not.toHaveBeenCalled();
  });

  describe('auditoria (FR-025)', () => {
    it('a capa automática registra origem CONDICAO', () => {
      const { store } = montarStore();

      store.getState().selecionarCondicao(COND_A);

      expect(eventosDeCapa(store)).toEqual([
        { origem: 'CONDICAO', modo: 'PERCENTUAL', entrada: 5, valor: 500 },
      ]);
    });

    it('a manual só registra na chamada não silenciosa, sem duplicar a mesma capa', () => {
      const { store } = montarStore();
      store.getState().selecionarCondicao(COND_A);

      store.getState().aplicarDescontoCapa('PERCENTUAL', 7, { silencioso: true });
      store.getState().aplicarDescontoCapa('PERCENTUAL', 7);
      store.getState().aplicarDescontoCapa('PERCENTUAL', 7);
      store.getState().aplicarDescontoCapa('PERCENTUAL', 6);

      expect(eventosDeCapa(store)).toEqual([
        { origem: 'CONDICAO', modo: 'PERCENTUAL', entrada: 5, valor: 500 },
        { origem: 'MANUAL', modo: 'PERCENTUAL', entrada: 7, valor: 700 },
        { origem: 'MANUAL', modo: 'PERCENTUAL', entrada: 6, valor: 600 },
      ]);
    });

    it('a digitação acima do teto registra o que foi pedido ao lado do que entrou (AD-280)', () => {
      const { store } = montarStore();
      store.getState().selecionarCondicao(COND_A);

      store.getState().aplicarDescontoCapa('PERCENTUAL', 30);

      expect(eventosDeCapa(store).at(-1)).toEqual({
        origem: 'MANUAL',
        modo: 'PERCENTUAL',
        entrada: 8,
        valor: 800,
        entradaSolicitada: 30,
      });
    });

    it('a mesma capa ajustada, vinda de outro pedido, é uma tentativa nova e não é deduplicada', () => {
      const { store } = montarStore();
      store.getState().selecionarCondicao(COND_A);

      store.getState().aplicarDescontoCapa('PERCENTUAL', 8);
      store.getState().aplicarDescontoCapa('PERCENTUAL', 30);
      store.getState().aplicarDescontoCapa('PERCENTUAL', 30);

      expect(eventosDeCapa(store).slice(1)).toEqual([
        { origem: 'MANUAL', modo: 'PERCENTUAL', entrada: 8, valor: 800 },
        { origem: 'MANUAL', modo: 'PERCENTUAL', entrada: 8, valor: 800, entradaSolicitada: 30 },
      ]);
    });

    it('a condição que traz mais desconto do que o próprio teto registra o pedido dela', () => {
      const { store } = montarStore();

      store.getState().selecionarCondicao(COND_C);

      expect(eventosDeCapa(store)).toEqual([
        { origem: 'CONDICAO', modo: 'PERCENTUAL', entrada: 8, valor: 800, entradaSolicitada: 10 },
      ]);
    });

    it('na venda seguinte a mesma capa registra de novo (achado D1)', () => {
      const { store } = montarStore();
      store.getState().selecionarCondicao(COND_A);
      store.getState().aplicarDescontoCapa('PERCENTUAL', 7);

      store.getState().resetarAuditoria('NOVA');
      store.getState().aplicarDescontoCapa('PERCENTUAL', 7);

      expect(eventosDeCapa(store)).toEqual([
        { origem: 'MANUAL', modo: 'PERCENTUAL', entrada: 7, valor: 700 },
      ]);
    });
  });
});

/* ------------------------------------------------------------------ *
 * 017, US4 (T054) — a chave decide como a capa vai ao ERP
 * ------------------------------------------------------------------ */

describe('pagamentoSlice — chave DESCONTO_CAPA_NO_ERP (017)', () => {
  // 70,00 + 29,00 + 1,00 = 100,00 — o caso de AD-151.
  const LINHAS_AD151: readonly LinhaRateavel[] = [
    { idLinha: 'linha-1', totalLiquido: centavos(7_000) },
    { idLinha: 'linha-2', totalLiquido: centavos(2_900) },
    { idLinha: 'linha-3', totalLiquido: centavos(100) },
  ];

  it('ligada, o payload leva a capa no cabeçalho', () => {
    const { store } = montarStore({ linhas: LINHAS_AD151, descontoCapaNoErp: true });
    store.getState().aplicarDescontoCapa('VALOR', 300);

    expect(store.getState().montarPagamentosParaPayload().descontoCapa).toEqual({
      tipo: 'NO_CABECALHO',
      valor: 300,
    });
  });

  it('ligada e sem capa, o cabeçalho leva zero', () => {
    const { store } = montarStore({ descontoCapaNoErp: true });

    expect(store.getState().montarPagamentosParaPayload().descontoCapa).toEqual({
      tipo: 'NO_CABECALHO',
      valor: 0,
    });
  });

  it('desligada, o payload continua rateado', () => {
    const { store } = montarStore({ linhas: LINHAS_AD151 });
    store.getState().aplicarDescontoCapa('VALOR', 300);

    expect(store.getState().montarPagamentosParaPayload().descontoCapa.tipo).toBe('RATEADA');
  });

  it('ligada, 10% em 70/29/1 é aceito — ZERA_UM_ITEM deixa de valer (FR-029)', () => {
    const desligada = montarStore({ linhas: LINHAS_AD151 });
    expect(desligada.store.getState().aplicarDescontoCapa('PERCENTUAL', 10)).toBe(false);

    const ligada = montarStore({ linhas: LINHAS_AD151, descontoCapaNoErp: true });
    expect(ligada.store.getState().aplicarDescontoCapa('PERCENTUAL', 10)).toBe(true);
    expect(ligada.store.getState().descontoCapa?.valorResolvido).toBe(1_000);
  });

  it('ligada, ZERA_A_VENDA continua recusando', () => {
    const { store, avisar } = montarStore({ linhas: LINHAS_AD151, descontoCapaNoErp: true });

    expect(store.getState().aplicarDescontoCapa('VALOR', 10_000)).toBe(false);
    expect(avisar).toHaveBeenCalledWith(AVISO_DESCONTO_ZERA_A_VENDA);
  });
});

describe('pagamentoSlice — auditoria da venda (Cenário 8, FR-017)', () => {
  it('registra os cinco eventos na ordem de posição do array', async () => {
    const { store, validarTicket } = montarStore({
      capacidades: { tefAtivo: false, pixAtivo: true },
    });
    validarTicket.mockResolvedValue({ valido: true, valor: centavos(2_550) });

    // Cenário 3: split cartão + dinheiro.
    await store.getState().aplicarPagamento({ forma: CARTAO, valorInformado: centavos(7_000) });
    await store.getState().aplicarPagamento({ forma: DINHEIRO, valorInformado: centavos(3_000) });
    // Cenário 6: remoção do pagamento reversível.
    store.getState().removerPagamento('pag-2');
    // Cenário 5: vale devolução entra como a sua própria forma de pagamento.
    await store.getState().aplicarValeDevolucao(VALE, 'TCK-000000-EXEMPLO');
    // Recusa de integração: último evento da trilha. O PIX é `pag-4` — o vale
    // acima consumiu `pag-3`, por ser um pagamento como qualquer outro.
    await store.getState().aplicarPagamento({ forma: PIX, valorInformado: centavos(450) });
    store.getState().recusarPagamentoIntegrado('pag-4', 'QR Code expirado');

    // A ordem **de posição no array** é a autoritativa. `timestamp` não é
    // afirmado como estritamente crescente: o carimbo tem resolução de
    // milissegundo, e dois eventos podem empatar sem que isso seja erro.
    expect(tiposDeEvento(store)).toEqual([
      'VENDA_INICIADA',
      'CONDICAO_PAGAMENTO_APLICADA',
      'FORMA_PAGAMENTO_APLICADA',
      'FORMA_PAGAMENTO_APLICADA',
      'FORMA_PAGAMENTO_REMOVIDA',
      // O vale devolução emite **dois** eventos, porque são dois fatos: um
      // ticket foi consumido e uma forma de pagamento entrou na venda. `FR-017`
      // pede os dois, e a trilha precisa mostrar a forma para o valor do vale
      // não aparecer sem origem.
      'VALE_DEVOLUCAO_USADO',
      'FORMA_PAGAMENTO_APLICADA',
      'PAGAMENTO_RECUSADO',
    ]);
  });
});

/* ------------------------------------------------------------------ *
 * Feature 018, US4 — desistir do TEF/PIX deixa rastro
 * ------------------------------------------------------------------ */

describe('pagamentoSlice — desistência e falha de cobrança TEF/PIX (018, US4)', () => {
  const DESISTENCIA = 'FECHADO_PELO_OPERADOR';

  function recusas(store: ReturnType<typeof montarStore>['store']): readonly object[] {
    return store
      .getState()
      .eventos.filter((evento) => evento.tipo === 'PAGAMENTO_RECUSADO')
      .map((evento) => evento.detalhes);
  }

  it('registrarIdentificadorIntegracao guarda o identificador na forma pendente, sem aprová-la nem enviá-la', async () => {
    const { store } = montarStore({ capacidades: { tefAtivo: false, pixAtivo: true } });
    await store.getState().aplicarPagamento({ forma: PIX, valorInformado: centavos(10_000) });

    store.getState().registrarIdentificadorIntegracao('pag-1', { pixGuid: 'guid-gerado' });

    const [pix] = store.getState().pagamentos;
    expect(pix?.pixGuid).toBe('guid-gerado');
    expect(pix?.status).toBe('PENDENTE_INTEGRACAO');
    expect(store.getState().montarPagamentosParaPayload().FormasDePagamento).toEqual([]);
    expect(store.getState().saldo().totalAplicado).toBe(0);
  });

  it('registrarIdentificadorIntegracao é no-op fora de PENDENTE_INTEGRACAO', async () => {
    const { store } = montarStore({ capacidades: { tefAtivo: false, pixAtivo: true } });
    await store.getState().aplicarPagamento({ forma: PIX, valorInformado: centavos(10_000) });
    store.getState().confirmarPagamentoIntegrado('pag-1', { pixGuid: 'guid-aprovado' });

    store.getState().registrarIdentificadorIntegracao('pag-1', { pixGuid: 'guid-tardio' });
    store.getState().registrarIdentificadorIntegracao('inexistente', { pixGuid: 'x' });

    expect(store.getState().pagamentos[0]?.pixGuid).toBe('guid-aprovado');
  });

  it('desistir do PIX gerado risca a forma e leva o identificador ao Log (FR-023, FR-025)', async () => {
    const { store, invalidarVeredito } = montarStore({
      capacidades: { tefAtivo: false, pixAtivo: true },
    });
    await store.getState().aplicarPagamento({ forma: PIX, valorInformado: centavos(10_000) });
    store.getState().registrarIdentificadorIntegracao('pag-1', { pixGuid: 'guid-gerado' });
    invalidarVeredito.mockClear();

    store.getState().recusarPagamentoIntegrado('pag-1', DESISTENCIA);

    expect(store.getState().pagamentos.map((pagamento) => pagamento.status)).toEqual(['EXCLUIDO']);
    expect(store.getState().saldo().saldoRestante).toBe(TOTAL_PADRAO);
    expect(invalidarVeredito).toHaveBeenCalled();
    expect(recusas(store)).toEqual([
      {
        tipo: 'Pix',
        motivo: DESISTENCIA,
        formaPagamento: expect.any(String),
        valor: 10_000,
        pixGuid: 'guid-gerado',
      },
    ]);
  });

  it('desistir do TEF criado leva o payment_identifier, sem dadosTEF (FR-025)', async () => {
    const { store } = montarStore({ capacidades: { tefAtivo: true, pixAtivo: false } });
    await store.getState().aplicarPagamento({ forma: CARTAO, valorInformado: centavos(10_000) });
    store.getState().registrarIdentificadorIntegracao('pag-1', { tefPagId: 'pay_criado_0001' });

    store.getState().recusarPagamentoIntegrado('pag-1', DESISTENCIA);

    expect(store.getState().pagamentos.map((pagamento) => pagamento.status)).toEqual(['EXCLUIDO']);
    expect(recusas(store)).toEqual([
      expect.objectContaining({ valor: 10_000, tefPagId: 'pay_criado_0001' }),
    ]);
  });

  it('falha terminal de cobrança já criada também deixa a forma riscada, com o identificador', async () => {
    const { store } = montarStore({ capacidades: { tefAtivo: true, pixAtivo: false } });
    await store.getState().aplicarPagamento({ forma: CARTAO, valorInformado: centavos(10_000) });
    store.getState().registrarIdentificadorIntegracao('pag-1', { tefPagId: 'pay_criado_0002' });

    store.getState().recusarPagamentoIntegrado('pag-1', 'CANCELADO');

    expect(store.getState().pagamentos.map((pagamento) => pagamento.status)).toEqual(['EXCLUIDO']);
    expect(recusas(store)).toEqual([expect.objectContaining({ tefPagId: 'pay_criado_0002' })]);
  });

  it('desistir antes de a cobrança existir risca a forma e o evento vai sem identificador (cenário 4)', async () => {
    const { store } = montarStore({ capacidades: { tefAtivo: true, pixAtivo: false } });
    await store.getState().aplicarPagamento({ forma: CARTAO, valorInformado: centavos(10_000) });

    store.getState().recusarPagamentoIntegrado('pag-1', DESISTENCIA);

    expect(store.getState().pagamentos.map((pagamento) => pagamento.status)).toEqual(['EXCLUIDO']);
    const [recusa] = recusas(store);
    expect(recusa).toMatchObject({ motivo: DESISTENCIA, valor: 10_000 });
    expect(recusa).not.toHaveProperty('tefPagId');
    expect(recusa).not.toHaveProperty('pixGuid');
  });

  it('recusa sem cobrança e sem desistência tira a forma da lista, como antes (FR-024)', async () => {
    const { store } = montarStore({ capacidades: { tefAtivo: true, pixAtivo: false } });
    await store.getState().aplicarPagamento({ forma: CARTAO, valorInformado: centavos(10_000) });

    store.getState().recusarPagamentoIntegrado('pag-1', 'SEM_CLIENTE');

    expect(store.getState().pagamentos).toEqual([]);
    expect(recusas(store)).toEqual([{ tipo: expect.any(String), motivo: 'SEM_CLIENTE' }]);
  });

  it('aprovação que chega depois da desistência não ressuscita a forma', async () => {
    const { store } = montarStore({ capacidades: { tefAtivo: false, pixAtivo: true } });
    await store.getState().aplicarPagamento({ forma: PIX, valorInformado: centavos(10_000) });
    store.getState().registrarIdentificadorIntegracao('pag-1', { pixGuid: 'guid-gerado' });
    store.getState().recusarPagamentoIntegrado('pag-1', DESISTENCIA);

    store.getState().confirmarPagamentoIntegrado('pag-1', { pixGuid: 'guid-gerado' });

    expect(store.getState().pagamentos[0]?.status).toBe('EXCLUIDO');
    expect(store.getState().saldo().totalAplicado).toBe(0);
  });

  it('uma nova forma entra ao lado da desistida, que fica fora do saldo (cenário 6)', async () => {
    const { store } = montarStore({ capacidades: { tefAtivo: false, pixAtivo: true } });
    await store.getState().aplicarPagamento({ forma: PIX, valorInformado: centavos(10_000) });
    store.getState().recusarPagamentoIntegrado('pag-1', DESISTENCIA);

    await store.getState().aplicarPagamento({ forma: DINHEIRO, valorInformado: centavos(10_000) });

    expect(store.getState().pagamentos.map((pagamento) => pagamento.status)).toEqual([
      'EXCLUIDO',
      'APROVADO',
    ]);
    expect(store.getState().saldo().saldoRestante).toBe(0);
  });
});

/* ------------------------------------------------------------------ *
 * Sanidade dos tipos monetários
 * ------------------------------------------------------------------ */

describe('pagamentoSlice — fronteira monetária', () => {
  it('mantém centavos inteiros no estado e converte para reais só no payload', async () => {
    const { store } = montarStore({ subtotal: 3_333 });

    await store.getState().aplicarPagamento({ forma: CARTAO, valorInformado: centavos(3_333) });

    const aplicado: Centavos = store.getState().pagamentos[0]?.valorAplicado ?? centavos(0);
    expect(Number.isInteger(aplicado)).toBe(true);
    expect(store.getState().montarPagamentosParaPayload().FormasDePagamento[0]?.FormaValor).toBe(
      33.33,
    );
  });
});

/* ------------------------------------------------------------------ *
 * Feature 010 (T030) — estorno do TEF aprovado
 * ------------------------------------------------------------------ */

/**
 * `confirmarEstornoTef` é o **único** caminho de um TEF `APROVADO` para
 * `EXCLUIDO`, e só é chamada depois de a janela de estorno observar `EST`
 * (invariantes T5/T6 de `specs/010-pagamento-tef/data-model.md`).
 */
describe('pagamentoSlice — confirmarEstornoTef (feature 010)', () => {
  const DADOS_TEF = {
    pagId: 'pay_exemplo_0001',
    bandeira: 'MASTERCARD',
    nsu: '048291',
    autorizacao: '192837',
    tipoIntegracao: '1',
  } as const;

  async function vendaComTefAprovado(valores: readonly number[] = [TOTAL_PADRAO]) {
    const montado = montarStore({ capacidades: { tefAtivo: true, pixAtivo: false } });
    for (const [indice, valor] of valores.entries()) {
      await montado.store
        .getState()
        .aplicarPagamento({ forma: CARTAO, valorInformado: centavos(valor) });
      montado.store.getState().confirmarPagamentoIntegrado(`pag-${String(indice + 1)}`, {
        dadosTEF: { ...DADOS_TEF, pagId: `pay_exemplo_000${String(indice + 1)}` },
      });
    }
    return montado;
  }

  function removidas(store: ReturnType<typeof montarStore>['store']): number {
    return store.getState().eventos.filter((evento) => evento.tipo === 'FORMA_PAGAMENTO_REMOVIDA')
      .length;
  }

  // (a) T5.
  it('risca o TEF aprovado, devolve o saldo, registra a remoção e invalida o veredito', async () => {
    const { store, invalidarVeredito } = await vendaComTefAprovado();
    expect(store.getState().saldo().saldoRestante).toBe(0);
    invalidarVeredito.mockClear();

    store.getState().confirmarEstornoTef('pag-1');

    expect(store.getState().pagamentos[0]?.status).toBe('EXCLUIDO');
    expect(store.getState().saldo().saldoRestante).toBe(TOTAL_PADRAO);
    expect(removidas(store)).toBe(1);
    expect(invalidarVeredito).toHaveBeenCalled();
  });

  // Feature 018, FR-012: o ERP concilia o estorno pelo `payment_identifier`.
  it('o evento do estorno leva valor, motivo ESTORNO_TEF e o pagId da transação', async () => {
    const { store } = await vendaComTefAprovado();

    store.getState().confirmarEstornoTef('pag-1');

    expect(detalhesDasRemocoes(store)).toEqual([
      expect.objectContaining({
        valor: TOTAL_PADRAO,
        motivo: 'ESTORNO_TEF',
        tefPagId: 'pay_exemplo_0001',
      }),
    ]);
  });

  // (b)
  it('é no-op para o que não é TEF aprovado, sem evento', async () => {
    const { store } = montarStore({ capacidades: { tefAtivo: true, pixAtivo: true } });
    await store.getState().aplicarPagamento({ forma: DINHEIRO, valorInformado: centavos(1_000) });
    await store.getState().aplicarPagamento({ forma: PIX, valorInformado: centavos(1_000) });
    store.getState().confirmarPagamentoIntegrado('pag-2', { pixGuid: 'guid-exemplo' });
    await store.getState().aplicarPagamento({ forma: CARTAO, valorInformado: centavos(1_000) });

    for (const id of ['pag-1', 'pag-2', 'pag-3', 'inexistente']) {
      store.getState().confirmarEstornoTef(id);
    }

    expect(store.getState().pagamentos.map((pagamento) => pagamento.status)).toEqual([
      'APROVADO',
      'APROVADO',
      'PENDENTE_INTEGRACAO',
    ]);
    expect(removidas(store)).toBe(0);
  });

  it('é no-op para TEF já excluído — não registra a remoção duas vezes', async () => {
    const { store } = await vendaComTefAprovado();
    store.getState().confirmarEstornoTef('pag-1');
    store.getState().confirmarEstornoTef('pag-1');

    expect(removidas(store)).toBe(1);
  });

  // (c) FR-003: a remoção **direta** continua proibida.
  it('removerPagamento continua recusando o TEF aprovado', async () => {
    const { store, avisar } = await vendaComTefAprovado();

    store.getState().removerPagamento('pag-1');

    expect(avisar).toHaveBeenCalledWith(AVISO_TEF_IRREVERSIVEL);
    expect(store.getState().pagamentos[0]?.status).toBe('APROVADO');
  });

  // (d) FR-009: a trava some sozinha quando o estorno vira `EXCLUIDO`.
  it('depois do estorno, Limpar volta a funcionar e o carrinho volta a mutar', async () => {
    const { store, avisar } = await vendaComTefAprovado();
    store.getState().descartarPagamento();
    expect(avisar).toHaveBeenCalledWith(AVISO_TEF_IRREVERSIVEL);
    avisar.mockClear();

    store.getState().confirmarEstornoTef('pag-1');
    store.getState().descartarPagamento();

    expect(avisar).not.toHaveBeenCalled();
    expect(store.getState().condicaoSelecionada).toBeNull();
    expect(store.getState().podeMutarCarrinho()).toBe(true);
  });

  // (e) T6.
  it('com dois TEFs aprovados, estornar um mantém o outro travando o descarte', async () => {
    const { store, avisar } = await vendaComTefAprovado([5_000, 5_000]);

    store.getState().confirmarEstornoTef('pag-1');
    store.getState().descartarPagamento();

    expect(avisar).toHaveBeenCalledWith(AVISO_TEF_IRREVERSIVEL);
    expect(store.getState().pagamentos.map((pagamento) => pagamento.status)).toEqual([
      'EXCLUIDO',
      'APROVADO',
    ]);
  });
});

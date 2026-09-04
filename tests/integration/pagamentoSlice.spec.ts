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
  AVISO_DESCONTO_ACIMA_DO_SUBTOTAL,
  AVISO_DESCONTO_COM_PAGAMENTO,
  AVISO_DINHEIRO_DUPLICADO,
  AVISO_FORMA_FORA_DA_CONDICAO,
  AVISO_PAGAMENTO_IRREVERSIVEL,
  AVISO_VALE_INDISPONIVEL,
  AVISO_VALE_INELEGIVEL,
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
import { formaDe } from '../support/pagamento';

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
  meioPagtoNFe: 'Dinheiro',
});

const CARTAO = formaDe({
  codigo: 2,
  descricao: 'CARTAO CREDITO',
  entrada: 'N',
  meioPagtoNFe: 'CartaoCredito',
  integracaoCartao: '1',
  tipoTransacaoTEF: 'CREDITO',
  fpgUtiCar: 'VDV',
});

const PIX = formaDe({ codigo: 3, descricao: 'PIX', entrada: 'S', meioPagtoNFe: 'Pix' });

const PIX_ESTATICO = formaDe({
  codigo: 4,
  descricao: 'PIX ESTATICO',
  entrada: 'S',
  meioPagtoNFe: 'PixEstatico',
});

/** `fpgUtiCar` explicitamente diferente de vale devolução → inelegível (AD-048). */
const CARTAO_SEM_VALE = formaDe({
  codigo: 5,
  descricao: 'CARTAO DEBITO',
  entrada: 'N',
  meioPagtoNFe: 'CartaoDebito',
  integracaoCartao: '1',
  fpgUtiCar: 'OUTRO',
});

function condicaoDe(
  codigo: number,
  descricao: string,
  formas: readonly FormaPagamento[] = [DINHEIRO, CARTAO, PIX, PIX_ESTATICO, CARTAO_SEM_VALE],
): CondicaoPagamento {
  return {
    codigo,
    descricao,
    prazo: 0,
    minimoEntrada: centavos(0),
    desconto: 0,
    descontoMaximo: 0,
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

  const store = create<VendaState & PagamentoSlice>()(
    immer((...args) => ({
      ...criarAuditoriaSlice(...args),
      ...criarCarrinhoSlice(depsCarrinho)(...args),
      ...criarIdentidadeVendaSlice(depsIdentidade)(...args),
      ...criarClienteSlice(depsCliente)(...args),
      ...criarPagamentoSlice(depsPagamento)(...args),
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

  it('trocar a condição esvazia os pagamentos aplicados (I9)', async () => {
    const { store } = montarStore();
    await store.getState().aplicarPagamento({ forma: DINHEIRO, valorInformado: centavos(10_000) });
    expect(store.getState().pagamentos).toHaveLength(1);

    store.getState().selecionarCondicao(A_PRAZO);

    expect(store.getState().pagamentos).toEqual([]);
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
 * T015 — bloqueio do carrinho reversível vs. irreversível
 * ------------------------------------------------------------------ */

describe('pagamentoSlice — bloqueio do carrinho (T015, I6/I7, Cenário 6)', () => {
  it('dinheiro sem integração bloqueia o carrinho, e removê-lo devolve a mutabilidade', async () => {
    const { store } = montarStore();

    await store.getState().aplicarPagamento({ forma: DINHEIRO, valorInformado: centavos(10_000) });
    expect(store.getState().podeMutarCarrinho()).toBe(false);

    store.getState().removerPagamento('pag-1');

    expect(store.getState().pagamentos).toEqual([]);
    expect(store.getState().podeMutarCarrinho()).toBe(true);
  });

  it('cartão aprovado por TEF é irreversível e mantém o carrinho bloqueado', async () => {
    const { store, avisar } = montarStore({ capacidades: { tefAtivo: true, pixAtivo: false } });

    await store.getState().aplicarPagamento({ forma: CARTAO, valorInformado: centavos(10_000) });
    store.getState().confirmarPagamentoIntegrado('pag-1', {
      dadosTEF: {
        identificacao: 123_456,
        cnpj: '00000000000000',
        bandeira: 'EXEMPLO',
        numeroAutorizacao: '000000',
        tipoIntegracao: '1',
      },
    });
    expect(store.getState().podeMutarCarrinho()).toBe(false);

    store.getState().removerPagamento('pag-1');

    expect(avisar).toHaveBeenCalledWith(AVISO_PAGAMENTO_IRREVERSIVEL);
    expect(store.getState().pagamentos).toHaveLength(1);
    expect(store.getState().podeMutarCarrinho()).toBe(false);
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
    // Pendente não conta para o total aplicado nem bloqueia o carrinho.
    expect(store.getState().saldo().totalAplicado).toBe(0);
    expect(store.getState().podeMutarCarrinho()).toBe(true);
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
  it('soma exatamente o total líquido em reais, só com aprovados e com FormaEntrada', async () => {
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
    expect(soma).toBeCloseTo(emReais(TOTAL_PADRAO), 10);

    expect(payload.FormasDePagamento[0]).toEqual({
      FormaCodigo: CARTAO.codigo,
      FormaMeioPagtoNFe: 'CartaoCredito',
      FormaValor: 70,
      FormaIntegracaoCartao: '1',
      FormaEntrada: 'N',
      TicketDevolucao: '',
    });
    expect(payload.FormasDePagamento[1]).toEqual({
      FormaCodigo: DINHEIRO.codigo,
      FormaMeioPagtoNFe: 'Dinheiro',
      FormaValor: 30,
      FormaIntegracaoCartao: '',
      FormaEntrada: 'S',
      TicketDevolucao: '',
    });

    // O troco de 20,00 existe no saldo e **não** aparece em campo nenhum.
    expect(store.getState().saldo().troco).toBe(2_000);
    const serializado = JSON.stringify(payload.FormasDePagamento);
    expect(serializado).not.toContain('20');
    expect(serializado.toLowerCase()).not.toContain('troco');
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
    expect(avisar).toHaveBeenCalledWith(AVISO_DESCONTO_ACIMA_DO_SUBTOTAL);
  });

  it('removerDescontoCapa zera o rateio sem deixar resíduo (FR-015)', () => {
    const { store } = montarStore({ linhas: LINHAS });

    store.getState().aplicarDescontoCapa('VALOR', 1_000);
    // Afirmado por chave, não por posição: `ratearDescontoCapa` devolve as
    // linhas fixadas pelo clamp antes das redivididas, e a ordem de iteração do
    // `Map` não faz parte do contrato — o que importa é a parcela de cada linha.
    const comDesconto = store.getState().montarPagamentosParaPayload().rateioDescontoCapa;
    expect(comDesconto.get('linha-1')).toBe(450);
    expect(comDesconto.get('linha-2')).toBe(450);
    expect(comDesconto.get('linha-3')).toBe(100);
    expect(store.getState().saldo().totalLiquido).toBe(9_000);

    store.getState().removerDescontoCapa();

    const semDesconto = store.getState().montarPagamentosParaPayload().rateioDescontoCapa;
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

describe('pagamentoSlice — vale devolução (T038, Cenário 5)', () => {
  const CODIGO_VALE = 'TCK-000000-EXEMPLO';

  it('vale válido soma o valor ao pagamento vinculado e emite VALE_DEVOLUCAO_USADO', async () => {
    const { store, validarTicket } = montarStore();
    validarTicket.mockResolvedValue({ valido: true, valor: centavos(2_550) });
    await store.getState().aplicarPagamento({ forma: CARTAO, valorInformado: centavos(7_000) });

    await store.getState().aplicarValeDevolucao(CODIGO_VALE, 'pag-1');

    expect(store.getState().pagamentos[0]?.valorAplicado).toBe(9_550);
    expect(store.getState().pagamentos[0]?.ticketDevolucao).toBe(CODIGO_VALE);
    expect(store.getState().valeDevolucao).toEqual({
      codigo: CODIGO_VALE,
      valor: 2_550,
      idPagamento: 'pag-1',
    });
    const usado = store.getState().eventos.find((evento) => evento.tipo === 'VALE_DEVOLUCAO_USADO');
    expect(usado?.detalhes).toEqual({ codigoVale: CODIGO_VALE, valor: 2_550 });
  });

  it('vale inválido avisa com a mensagem do ERP e emite PAGAMENTO_RECUSADO sem mutar', async () => {
    const { store, validarTicket, avisar } = montarStore();
    validarTicket.mockResolvedValue({ valido: false, mensagem: 'Ticket já utilizado' });
    await store.getState().aplicarPagamento({ forma: CARTAO, valorInformado: centavos(7_000) });

    await store.getState().aplicarValeDevolucao(CODIGO_VALE, 'pag-1');

    expect(store.getState().pagamentos[0]?.valorAplicado).toBe(7_000);
    expect(store.getState().pagamentos[0]?.ticketDevolucao).toBeNull();
    expect(store.getState().valeDevolucao).toBeNull();
    expect(avisar).toHaveBeenCalledWith('Ticket já utilizado');
    const recusa = store.getState().eventos.find((evento) => evento.tipo === 'PAGAMENTO_RECUSADO');
    expect(recusa?.detalhes).toEqual({ tipo: 'CartaoCredito', motivo: 'Ticket já utilizado' });
  });

  it('forma inelegível é no-op com aviso, sem nenhuma chamada de rede (AD-048)', async () => {
    const { store, validarTicket, avisar } = montarStore();
    await store
      .getState()
      .aplicarPagamento({ forma: CARTAO_SEM_VALE, valorInformado: centavos(7_000) });

    await store.getState().aplicarValeDevolucao(CODIGO_VALE, 'pag-1');

    expect(validarTicket).not.toHaveBeenCalled();
    expect(avisar).toHaveBeenCalledWith(AVISO_VALE_INELEGIVEL);
  });

  it('ERP indisponível avisa e não muta nada, sem evento de auditoria', async () => {
    const { store, validarTicket, avisar } = montarStore();
    await store.getState().aplicarPagamento({ forma: CARTAO, valorInformado: centavos(7_000) });
    validarTicket.mockRejectedValue(new Error('rede indisponível'));
    const eventosAntes = tiposDeEvento(store);

    await store.getState().aplicarValeDevolucao(CODIGO_VALE, 'pag-1');

    expect(avisar).toHaveBeenCalledWith(AVISO_VALE_INDISPONIVEL);
    expect(store.getState().pagamentos[0]?.valorAplicado).toBe(7_000);
    expect(store.getState().pagamentos[0]?.ticketDevolucao).toBeNull();
    expect(store.getState().valeDevolucao).toBeNull();
    // Indisponibilidade técnica não é evento de domínio: a trilha fica intacta.
    expect(tiposDeEvento(store)).toEqual(eventosAntes);
  });

  it('o ticket é validado exatamente uma vez — a montagem do payload nunca revalida (FR-009/SC-001)', async () => {
    const { store, validarTicket } = montarStore();
    validarTicket.mockResolvedValue({ valido: true, valor: centavos(2_550) });
    await store.getState().aplicarPagamento({ forma: CARTAO, valorInformado: centavos(7_000) });
    await store.getState().aplicarValeDevolucao(CODIGO_VALE, 'pag-1');

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
        meioPagtoNFe: 'Dinheiro',
        valor: 10_000,
        fpgUtiCar: '',
        entrada: 'S',
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
      formaMeioPagtoNFe: 'Dinheiro',
      valor: centavos(4_000),
      tef: null,
      pixGuid: null,
      ticketDevolucao: null,
    },
    {
      formaCodigo: DINHEIRO.codigo,
      formaMeioPagtoNFe: 'Dinheiro',
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

  it('limparPagamentos esvazia pagamentos, condição, desconto e vale', async () => {
    const { store } = montarStore();
    store.getState().aplicarDescontoCapa('VALOR', 1_000);
    await store.getState().aplicarPagamento({ forma: DINHEIRO, valorInformado: centavos(9_000) });

    store.getState().limparPagamentos();

    expect(store.getState().pagamentos).toEqual([]);
    expect(store.getState().condicaoSelecionada).toBeNull();
    expect(store.getState().descontoCapa).toBeNull();
    expect(store.getState().valeDevolucao).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * Cenário 8 — ordem dos eventos de auditoria
 * ------------------------------------------------------------------ */

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
    // Cenário 5: vale sobre a forma elegível remanescente.
    await store.getState().aplicarValeDevolucao('TCK-000000-EXEMPLO', 'pag-1');
    // Recusa de integração: último evento da trilha.
    await store.getState().aplicarPagamento({ forma: PIX, valorInformado: centavos(450) });
    store.getState().recusarPagamentoIntegrado('pag-3', 'QR Code expirado');

    // A ordem **de posição no array** é a autoritativa. `timestamp` não é
    // afirmado como estritamente crescente: o carimbo tem resolução de
    // milissegundo, e dois eventos podem empatar sem que isso seja erro.
    expect(tiposDeEvento(store)).toEqual([
      'VENDA_INICIADA',
      'CONDICAO_PAGAMENTO_APLICADA',
      'FORMA_PAGAMENTO_APLICADA',
      'FORMA_PAGAMENTO_APLICADA',
      'FORMA_PAGAMENTO_REMOVIDA',
      'VALE_DEVOLUCAO_USADO',
      'PAGAMENTO_RECUSADO',
    ]);
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

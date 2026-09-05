import { beforeEach, describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { centavos, ZERO_CENTAVOS, type Centavos } from '../../src/client/domain/precificacao/dinheiro';
import type { SnapshotPrecoProduto } from '../../src/client/domain/precificacao/linha';
import type { CondicaoPagamento } from '../../src/client/domain/pagamento/formaPagamento';
import type { CapacidadesPagamento } from '../../src/client/domain/pagamento/roteamentoIntegracao';
import type { ResultadoTicket } from '../../src/client/domain/pagamento/valeDevolucao';
import type { AtalhoVendaRapida, ListaAtalhos } from '../../src/client/domain/vendaRapida/tipos';
import {
  acionarCenario,
  criarDepsPadrao,
  type AcionarCenarioDeps,
} from '../../src/client/features/venda-rapida/useAcionarCenario';
import { aplicarFormaComIntegracao } from '../../src/client/features/venda-rapida/aplicarFormaComIntegracao';
import {
  AVISO_ATALHO_SEM_ITENS,
  AVISO_ATALHO_SEM_SALDO,
  AVISO_PAGAMENTO_JA_INICIADO,
} from '../../src/client/features/venda-rapida/avisosVendaRapida';
import { criarAuditoriaSlice } from '../../src/client/stores/slices/auditoriaSlice';
import { criarCarrinhoSlice, type CarrinhoDeps } from '../../src/client/stores/slices/carrinhoSlice';
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
  criarPagamentoSlice,
  type PagamentoDeps,
  type PagamentoSlice,
} from '../../src/client/stores/slices/pagamentoSlice';
import { useVendaStore, type VendaState } from '../../src/client/stores/vendaStore';
import { formaDe } from '../support/pagamento';
import { linhaDe } from '../support/precificacao';

/**
 * Acionamento da venda rápida sobre o slice **real** de pagamento (T008–T011,
 * T015–T018) — invariantes I6 a I9 e I12 de
 * `specs/013-venda-rapida-cenario-pagamento/data-model.md`.
 *
 * O store é montado com os slices reais, como em
 * `tests/integration/pagamentoSlice.spec.ts`: é o que torna "um acionamento ⇒
 * um evento" uma afirmação sobre o dispatcher de verdade, e não sobre um duplo.
 * Só as portas que **pertencem a outras features** (finalização da 004) e as
 * capacidades do PDV são duplos.
 */

const TOTAL_PADRAO = 10_000; // R$ 100,00 em centavos

const DINHEIRO = formaDe({ codigo: 1, descricao: 'DINHEIRO', meioPagtoNFe: 'Dinheiro' });
const PIX = formaDe({ codigo: 4, descricao: 'PIX', meioPagtoNFe: 'Pix' });

const A_VISTA: CondicaoPagamento = {
  codigo: 1,
  descricao: 'A VISTA',
  prazo: 0,
  minimoEntrada: ZERO_CENTAVOS,
  desconto: 0,
  descontoMaximo: 0,
  formas: [DINHEIRO, PIX],
};

/** Segunda condição — existe só para o conflito de G5 ser exercitável. */
const A_PRAZO: CondicaoPagamento = { ...A_VISTA, codigo: 2, descricao: 'A PRAZO' };

function atalhoDe(opcoes: Partial<AtalhoVendaRapida> = {}): AtalhoVendaRapida {
  return {
    tecla: opcoes.tecla ?? 'F6',
    nome: opcoes.nome ?? 'Dinheiro à vista',
    condicaoCodigo: opcoes.condicaoCodigo ?? A_VISTA.codigo,
    formaCodigo: opcoes.formaCodigo ?? DINHEIRO.codigo,
    meioPagtoNFe: opcoes.meioPagtoNFe ?? 'Dinheiro',
    encerraOperacao: opcoes.encerraOperacao ?? true,
  };
}

/* ------------------------------------------------------------------ *
 * Montagem do store real + portas da 013
 * ------------------------------------------------------------------ */

interface OpcoesMontagem {
  readonly subtotal?: number;
  readonly capacidades?: CapacidadesPagamento;
  /** Duplo da porta `aplicarForma` — por padrão, o caminho real do slice. */
  readonly aplicarForma?: (codigo: number, valor: Centavos) => Promise<boolean>;
  readonly temItens?: boolean;
}

function montar(opcoes: OpcoesMontagem = {}) {
  const subtotal = centavos(opcoes.subtotal ?? TOTAL_PADRAO);
  const capacidades = opcoes.capacidades ?? { tefAtivo: false, pixAtivo: false };

  const iniciarIntegracao = vi.fn(() => undefined);
  const avisar = vi.fn((_mensagem: string) => undefined);

  let sequencia = 0;
  const depsPagamento: PagamentoDeps = {
    subtotalCarrinho: () => subtotal,
    linhasRateaveis: () => [],
    capacidades: () => capacidades,
    validarTicket: (): Promise<ResultadoTicket> =>
      Promise.resolve({ valido: false, mensagem: 'não exercitado' }),
    iniciarIntegracao,
    validarInsercao: () => Promise.resolve({ aceita: true as const }),
    invalidarVeredito: () => undefined,
    avisar,
    gerarIdPagamento: () => {
      sequencia += 1;
      return `pag-${String(sequencia)}`;
    },
  };

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

  const store = create<VendaState & PagamentoSlice>()(
    immer((...args) => ({
      ...criarAuditoriaSlice(...args),
      ...criarCarrinhoSlice(depsCarrinho)(...args),
      ...criarIdentidadeVendaSlice({ podeMutarCarrinho: () => true } as IdentidadeVendaDeps)(
        ...args,
      ),
      ...criarClienteSlice(depsCliente)(...args),
      ...criarPagamentoSlice(depsPagamento)(...args),
      ...criarVendedorSlice({ podeMutarCarrinho: () => true } as VendedorDeps)(...args),
    })),
  );

  store.getState().resetarAuditoria('NOVA');

  const finalizarVenda = vi.fn((): Promise<void> => Promise.resolve());
  const irParaEtapaPagamento = vi.fn(() => undefined);
  const selecionarCondicao = vi.fn((codigo: number) => {
    if (codigo === A_VISTA.codigo) {
      store.getState().selecionarCondicao(A_VISTA);
    }
  });
  const aplicarFormaReal = (codigo: number, valor: Centavos): Promise<boolean> =>
    aplicarFormaComIntegracao(store, codigo, valor);
  const aplicarForma = vi.fn(opcoes.aplicarForma ?? aplicarFormaReal);

  /** Aviso do **atalho** (013). O `avisar` acima é o do slice de pagamento (008). */
  const avisarAtalho = vi.fn((_mensagem: string) => undefined);

  const deps: AcionarCenarioDeps = {
    obterSaldoEmAberto: () => store.getState().saldo().saldoRestante,
    vendaTemItens: () => opcoes.temItens ?? true,
    // Lidas do store **real**, como em produção: é o que faz o segundo
    // acionamento enxergar o que o primeiro deixou na venda.
    condicaoDaVenda: () => store.getState().condicaoSelecionada?.codigo ?? null,
    vendaTemFormaAplicada: () =>
      store
        .getState()
        .pagamentos.some(
          (pagamento) => pagamento.status !== 'RECUSADO' && pagamento.status !== 'EXCLUIDO',
        ),
    irParaEtapaPagamento,
    selecionarCondicao,
    aplicarForma,
    finalizarVenda,
    avisar: avisarAtalho,
    registrarEvento: (atalho, valor, finalizou) => {
      store.getState().registrarEventoAuditoria({
        tipo: 'VENDA_RAPIDA_ACIONADA',
        detalhes: {
          tecla: atalho.tecla,
          cenarioNome: atalho.nome,
          condicaoCodigo: atalho.condicaoCodigo,
          formaCodigo: atalho.formaCodigo,
          valorLancado: valor,
          finalizacaoAutomatica: finalizou,
        },
      });
    },
    acionamentoEmAndamento: () => store.getState().acionamentoEmAndamento,
    marcarAcionamento: (emAndamento) => {
      store.getState().marcarAcionamentoEmAndamento(emAndamento);
    },
  };

  return {
    store,
    deps,
    finalizarVenda,
    irParaEtapaPagamento,
    selecionarCondicao,
    aplicarForma,
    iniciarIntegracao,
    avisar,
    avisarAtalho,
  };
}

function eventosDeVendaRapida(store: ReturnType<typeof montar>['store']) {
  return store.getState().eventos.filter((evento) => evento.tipo === 'VENDA_RAPIDA_ACIONADA');
}

const ATALHOS: ListaAtalhos = [atalhoDe()];

/**
 * Porta `aplicarForma` que só resolve quando o teste mandar — o ciclo
 * `PENDENTE_INTEGRACAO` → `confirmarPagamentoIntegrado`/`recusarPagamentoIntegrado`
 * da 008, reduzido ao que o acionamento enxerga: uma Promise que demora.
 */
function portaComConfirmacao(): {
  aplicarForma: () => Promise<boolean>;
  confirmar: (aprovado: boolean) => void;
} {
  const liberar: ((aprovado: boolean) => void)[] = [];

  return {
    aplicarForma: () =>
      new Promise<boolean>((resolver) => {
        liberar.push(resolver);
      }),
    confirmar: (aprovado) => {
      for (const resolver of liberar) {
        resolver(aprovado);
      }
    },
  };
}

/* ------------------------------------------------------------------ *
 * T008 — G1 a G4: recusas que não alteram a venda (FR-009, I8)
 * ------------------------------------------------------------------ */

describe('acionarCenario — guards G1..G4 recusam sem tocar na venda (T008)', () => {
  it('G1: acionamento já em andamento', async () => {
    const { store, deps, aplicarForma } = montar();
    store.getState().marcarAcionamentoEmAndamento(true);

    const resultado = await acionarCenario('F6', ATALHOS, deps);

    expect(resultado).toEqual({ tipo: 'RECUSADO', motivo: 'ACIONAMENTO_EM_ANDAMENTO' });
    expect(aplicarForma).not.toHaveBeenCalled();
    // O guard não é desligado por uma recusa em G1: quem o ligou é quem o
    // desliga, e apagá-lo aqui liberaria o segundo toque a passar por cima do
    // acionamento em curso — exatamente o que I9 impede.
    expect(store.getState().acionamentoEmAndamento).toBe(true);
  });

  it('G2: tecla sem atalho na lista', async () => {
    const { store, deps, aplicarForma } = montar();

    const resultado = await acionarCenario('F8', ATALHOS, deps);

    expect(resultado).toEqual({ tipo: 'RECUSADO', motivo: 'ATALHO_INEXISTENTE' });
    expect(aplicarForma).not.toHaveBeenCalled();
    expect(store.getState().pagamentos).toEqual([]);
  });

  it('G2: no mobile a lista chega vazia, então toda tecla é ATALHO_INEXISTENTE (I10)', async () => {
    const { deps } = montar();

    await expect(acionarCenario('F6', [], deps)).resolves.toEqual({
      tipo: 'RECUSADO',
      motivo: 'ATALHO_INEXISTENTE',
    });
  });

  it('G3: venda sem itens', async () => {
    const { store, deps, aplicarForma } = montar({ temItens: false });

    const resultado = await acionarCenario('F6', ATALHOS, deps);

    expect(resultado).toEqual({ tipo: 'RECUSADO', motivo: 'SEM_ITENS' });
    expect(aplicarForma).not.toHaveBeenCalled();
    expect(store.getState().condicaoSelecionada).toBeNull();
  });

  it('G5: a venda já tem **outra** condição escolhida', async () => {
    const { store, deps, aplicarForma, avisarAtalho } = montar();
    // O operador escolheu a condição pelo combobox, sem lançar forma nenhuma.
    // O atalho aponta para a condição 1; a venda está na 2.
    store.getState().selecionarCondicao(A_PRAZO);

    const resultado = await acionarCenario('F6', ATALHOS, deps);

    expect(resultado).toEqual({ tipo: 'RECUSADO', motivo: 'PAGAMENTO_JA_INICIADO' });
    expect(aplicarForma).not.toHaveBeenCalled();
    expect(avisarAtalho).toHaveBeenCalledWith(AVISO_PAGAMENTO_JA_INICIADO);
    // A condição do operador continua de pé: a recusa não mexe na venda.
    expect(store.getState().condicaoSelecionada?.codigo).toBe(A_PRAZO.codigo);
  });

  it('G5: a **mesma** condição, sem forma viva, passa — é a retentativa do próprio atalho', async () => {
    const { store, deps, avisarAtalho } = montar();
    // O estado que um atalho recusado em P4 deixa para trás: condição posta
    // pelo P3, nenhuma forma. Travar aqui faria o atalho envenenar a própria
    // retentativa e exigir um "Limpar" para desfazer o que ele mesmo fez.
    store.getState().selecionarCondicao(A_VISTA);

    const resultado = await acionarCenario('F6', [atalhoDe({ encerraOperacao: false })], deps);

    expect(resultado).toMatchObject({ tipo: 'LANCADO' });
    expect(avisarAtalho).not.toHaveBeenCalled();
    expect(store.getState().pagamentos).toHaveLength(1);
  });

  it('G5: a venda tem forma aplicada **sem** condição — o caso do DAV/rascunho retomado', async () => {
    const { store, deps, aplicarForma, avisarAtalho } = montar();
    // `importarFormasDePagamento` (006/011) não toca em `condicaoSelecionada`:
    // olhar só a condição deixaria o atalho lançar por cima de um valor que o
    // cliente já pagou e que está gravado no documento dentro do ERP.
    store.getState().importarFormasDePagamento([
      {
        formaCodigo: DINHEIRO.codigo,
        formaMeioPagtoNFe: 'Dinheiro',
        valor: centavos(1_000),
        tef: null,
        pixGuid: null,
        ticketDevolucao: null,
      },
    ]);
    expect(store.getState().condicaoSelecionada).toBeNull();

    const resultado = await acionarCenario('F6', ATALHOS, deps);

    expect(resultado).toEqual({ tipo: 'RECUSADO', motivo: 'PAGAMENTO_JA_INICIADO' });
    expect(aplicarForma).not.toHaveBeenCalled();
    expect(avisarAtalho).toHaveBeenCalledWith(AVISO_PAGAMENTO_JA_INICIADO);
  });

  it('G5: o segundo acionamento é recusado porque o primeiro deixou a condição posta', async () => {
    const { store, deps, avisarAtalho } = montar();

    const primeiro = await acionarCenario('F6', [atalhoDe({ encerraOperacao: false })], deps);
    expect(primeiro).toMatchObject({ tipo: 'LANCADO' });

    const segundo = await acionarCenario('F6', [atalhoDe({ encerraOperacao: false })], deps);

    expect(segundo).toEqual({ tipo: 'RECUSADO', motivo: 'PAGAMENTO_JA_INICIADO' });
    // Um pagamento só: o atalho não divide venda entre duas condições.
    expect(store.getState().pagamentos).toHaveLength(1);
    expect(avisarAtalho).toHaveBeenCalledWith(AVISO_PAGAMENTO_JA_INICIADO);
  });

  it('G4: saldo em aberto já zerado', async () => {
    const { store, deps, aplicarForma } = montar({ subtotal: 0 });

    const resultado = await acionarCenario('F6', ATALHOS, deps);

    expect(resultado).toEqual({ tipo: 'RECUSADO', motivo: 'SEM_SALDO_EM_ABERTO' });
    expect(aplicarForma).not.toHaveBeenCalled();
    expect(store.getState().pagamentos).toEqual([]);
  });

  it('nenhuma recusa de guard gera evento de auditoria (I12)', async () => {
    const { store, deps } = montar({ temItens: false });

    await acionarCenario('F6', ATALHOS, deps);
    await acionarCenario('F8', ATALHOS, deps);

    expect(eventosDeVendaRapida(store)).toEqual([]);
  });

  it('as recusas que o operador pode resolver falam; as outras calam (FR-009)', async () => {
    const semItens = montar({ temItens: false });
    await acionarCenario('F6', ATALHOS, semItens.deps);
    expect(semItens.avisarAtalho).toHaveBeenCalledWith(AVISO_ATALHO_SEM_ITENS);

    const semSaldo = montar({ subtotal: 0 });
    await acionarCenario('F6', ATALHOS, semSaldo.deps);
    expect(semSaldo.avisarAtalho).toHaveBeenCalledWith(AVISO_ATALHO_SEM_SALDO);

    // Acionamento concorrente cala: o primeiro **está acontecendo**, e avisar a
    // cada toque encheria a tela durante uma espera de TEF/PIX.
    const emAndamento = montar();
    emAndamento.store.getState().marcarAcionamentoEmAndamento(true);
    await acionarCenario('F6', ATALHOS, emAndamento.deps);
    expect(emAndamento.avisarAtalho).not.toHaveBeenCalled();

    // Lançamento recusado cala: quem recusou já falou o motivo exato.
    const recusado = montar({ aplicarForma: () => Promise.resolve(false) });
    await acionarCenario('F6', ATALHOS, recusado.deps);
    expect(recusado.avisarAtalho).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ *
 * T009 — lançamento pelo saldo integral + auditoria (I6, I12, FR-008/017/021)
 * ------------------------------------------------------------------ */

describe('acionarCenario — lançamento pelo saldo em aberto integral (T009)', () => {
  it('seleciona a condição e aplica a forma pelo saldo integral, em Centavos', async () => {
    const { deps, selecionarCondicao, aplicarForma, irParaEtapaPagamento } = montar();

    const resultado = await acionarCenario(
      'F6',
      [atalhoDe({ encerraOperacao: false })],
      deps,
    );

    expect(irParaEtapaPagamento).toHaveBeenCalledTimes(1);
    expect(selecionarCondicao).toHaveBeenCalledWith(A_VISTA.codigo);
    expect(aplicarForma).toHaveBeenCalledWith(DINHEIRO.codigo, centavos(TOTAL_PADRAO));
    expect(resultado).toEqual({
      tipo: 'LANCADO',
      valorLancado: centavos(TOTAL_PADRAO),
      finalizacaoIniciada: false,
    });
  });

  it('nunca lança um valor parcial: o pagamento entra com o saldo inteiro', async () => {
    const { store, deps } = montar();

    await acionarCenario('F6', [atalhoDe({ encerraOperacao: false })], deps);

    expect(store.getState().pagamentos).toHaveLength(1);
    expect(store.getState().pagamentos[0]?.valorAplicado).toBe(centavos(TOTAL_PADRAO));
    expect(store.getState().saldo().saldoRestante).toBe(ZERO_CENTAVOS);
  });

  it('registra exatamente um evento VENDA_RAPIDA_ACIONADA, com tecla/cenário/valor', async () => {
    const { store, deps } = montar();

    await acionarCenario('F6', [atalhoDe({ nome: 'Dinheiro à vista' })], deps);

    const eventos = eventosDeVendaRapida(store);
    expect(eventos).toHaveLength(1);
    expect(eventos[0]?.detalhes).toEqual({
      tecla: 'F6',
      cenarioNome: 'Dinheiro à vista',
      condicaoCodigo: A_VISTA.codigo,
      formaCodigo: DINHEIRO.codigo,
      valorLancado: TOTAL_PADRAO,
      finalizacaoAutomatica: true,
    });
  });

  it('o guard é desligado ao final de um acionamento bem-sucedido', async () => {
    const { store, deps } = montar();

    await acionarCenario('F6', ATALHOS, deps);

    expect(store.getState().acionamentoEmAndamento).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * T010 — formas com integração externa (FR-013, D10, quickstart C5)
 * ------------------------------------------------------------------ */

describe('acionarCenario — forma com TEF/PIX só resolve depois da confirmação (T010)', () => {
  it('a Promise do acionamento não resolve antes da confirmação da integração', async () => {
    const porta = portaComConfirmacao();
    const { deps } = montar({ aplicarForma: porta.aplicarForma });

    let concluido = false;
    const emCurso = acionarCenario('F9', [atalhoDe({ tecla: 'F9', formaCodigo: PIX.codigo })], deps);
    void emCurso.then(() => {
      concluido = true;
    });

    // Dois turnos de microtask: se houvesse retorno antecipado, já teria caído.
    await Promise.resolve();
    await Promise.resolve();
    expect(concluido).toBe(false);

    porta.confirmar(true);
    await expect(emCurso).resolves.toMatchObject({ tipo: 'LANCADO' });
  });

  it('integração recusada devolve RECUSADO(LANCAMENTO_FALHOU) sem alterar a venda', async () => {
    const porta = portaComConfirmacao();
    const { store, deps, finalizarVenda } = montar({ aplicarForma: porta.aplicarForma });

    const emCurso = acionarCenario('F9', [atalhoDe({ tecla: 'F9', formaCodigo: PIX.codigo })], deps);
    await Promise.resolve();
    porta.confirmar(false);

    await expect(emCurso).resolves.toEqual({ tipo: 'RECUSADO', motivo: 'LANCAMENTO_FALHOU' });
    expect(store.getState().pagamentos).toEqual([]);
    expect(finalizarVenda).not.toHaveBeenCalled();
    expect(eventosDeVendaRapida(store)).toEqual([]);
    expect(store.getState().acionamentoEmAndamento).toBe(false);
  });

  it('rejeição da porta é tratada como recusa, nunca propagada ao chamador', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { store, deps } = montar({
      aplicarForma: () => Promise.reject(new Error('terminal TEF fora do ar')),
    });

    await expect(acionarCenario('F6', ATALHOS, deps)).resolves.toEqual({
      tipo: 'RECUSADO',
      motivo: 'LANCAMENTO_FALHOU',
    });
    expect(store.getState().acionamentoEmAndamento).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * aplicarFormaComIntegracao sobre o slice real — o adaptador da porta
 * ------------------------------------------------------------------ */

describe('aplicarFormaComIntegracao — espera o ciclo PENDENTE_INTEGRACAO da 008', () => {
  it('forma sem integração resolve na hora, com true', async () => {
    const { store } = montar();
    store.getState().selecionarCondicao(A_VISTA);

    await expect(
      aplicarFormaComIntegracao(store, DINHEIRO.codigo, centavos(TOTAL_PADRAO)),
    ).resolves.toBe(true);
  });

  it('PIX dinâmico fica pendente e só resolve em confirmarPagamentoIntegrado', async () => {
    const { store } = montar({ capacidades: { tefAtivo: false, pixAtivo: true } });
    store.getState().selecionarCondicao(A_VISTA);

    let concluido = false;
    const emCurso = aplicarFormaComIntegracao(store, PIX.codigo, centavos(TOTAL_PADRAO));
    void emCurso.then(() => {
      concluido = true;
    });
    await Promise.resolve();
    await Promise.resolve();

    const pendente = store.getState().pagamentos[0];
    expect(pendente?.status).toBe('PENDENTE_INTEGRACAO');
    expect(concluido).toBe(false);

    store.getState().confirmarPagamentoIntegrado(pendente?.idPagamento ?? '', { pixGuid: 'x' });
    await expect(emCurso).resolves.toBe(true);
  });

  it('recusa da integração resolve false — o pagamento sai da lista', async () => {
    const { store } = montar({ capacidades: { tefAtivo: false, pixAtivo: true } });
    store.getState().selecionarCondicao(A_VISTA);

    const emCurso = aplicarFormaComIntegracao(store, PIX.codigo, centavos(TOTAL_PADRAO));
    await Promise.resolve();
    const pendente = store.getState().pagamentos[0];

    store.getState().recusarPagamentoIntegrado(pendente?.idPagamento ?? '', 'cliente desistiu');
    await expect(emCurso).resolves.toBe(false);
  });

  it('forma fora da condição resolve false, sem inserir nada', async () => {
    const { store, avisar } = montar();
    store.getState().selecionarCondicao(A_VISTA);

    await expect(aplicarFormaComIntegracao(store, 999, centavos(TOTAL_PADRAO))).resolves.toBe(
      false,
    );
    expect(store.getState().pagamentos).toEqual([]);
    expect(avisar).toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ *
 * T011 — acionamento concorrente (I9, quickstart C7)
 * ------------------------------------------------------------------ */

describe('acionarCenario — dois acionamentos concorrentes produzem um lançamento (T011)', () => {
  it('o segundo é recusado por ACIONAMENTO_EM_ANDAMENTO', async () => {
    const porta = portaComConfirmacao();
    const { store, deps, aplicarForma } = montar({ aplicarForma: porta.aplicarForma });

    const primeiro = acionarCenario('F6', ATALHOS, deps);
    await Promise.resolve();
    const segundo = await acionarCenario('F6', ATALHOS, deps);

    expect(segundo).toEqual({ tipo: 'RECUSADO', motivo: 'ACIONAMENTO_EM_ANDAMENTO' });
    expect(aplicarForma).toHaveBeenCalledTimes(1);

    porta.confirmar(true);
    await primeiro;
    expect(eventosDeVendaRapida(store)).toHaveLength(1);
  });

  it('o guard é limpo mesmo quando a aplicação rejeita', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { store, deps } = montar({
      aplicarForma: () => Promise.reject(new Error('falhou')),
    });

    await acionarCenario('F6', ATALHOS, deps);

    expect(store.getState().acionamentoEmAndamento).toBe(false);

    // E o acionamento seguinte passa normalmente.
    const segundo = await acionarCenario('F6', ATALHOS, deps);
    expect(segundo).toEqual({ tipo: 'RECUSADO', motivo: 'LANCAMENTO_FALHOU' });
  });
});

/* ------------------------------------------------------------------ *
 * T015–T018 — finalização automática (US2)
 * ------------------------------------------------------------------ */

describe('acionarCenario — finalização automática (T015–T018)', () => {
  it('T015: cenário que encerra a operação finaliza sem nenhum diálogo (C1, SC-001)', async () => {
    const { store, deps, finalizarVenda } = montar();

    const resultado = await acionarCenario('F6', [atalhoDe({ encerraOperacao: true })], deps);

    expect(finalizarVenda).toHaveBeenCalledTimes(1);
    expect(resultado).toEqual({
      tipo: 'LANCADO',
      valorLancado: centavos(TOTAL_PADRAO),
      finalizacaoIniciada: true,
    });
    expect(store.getState().saldo().saldoRestante).toBe(ZERO_CENTAVOS);
  });

  it('T016: cenário sem encerramento lança e deixa a venda aberta (C2)', async () => {
    const { deps, finalizarVenda } = montar();

    const resultado = await acionarCenario('F6', [atalhoDe({ encerraOperacao: false })], deps);

    expect(finalizarVenda).not.toHaveBeenCalled();
    expect(resultado).toMatchObject({ tipo: 'LANCADO', finalizacaoIniciada: false });
  });

  it('T017: lançamento recusado não finaliza, não altera pagamentos e não audita', async () => {
    const { store, deps, finalizarVenda } = montar({ aplicarForma: () => Promise.resolve(false) });
    const pagamentosAntes = store.getState().pagamentos;

    const resultado = await acionarCenario('F6', [atalhoDe({ encerraOperacao: true })], deps);

    expect(resultado).toEqual({ tipo: 'RECUSADO', motivo: 'LANCAMENTO_FALHOU' });
    expect(finalizarVenda).not.toHaveBeenCalled();
    expect(store.getState().pagamentos).toEqual(pagamentosAntes);
    expect(eventosDeVendaRapida(store)).toEqual([]);
  });

  it('T018: encerra a operação, mas o lançamento não zerou o saldo ⇒ não finaliza (I7)', async () => {
    // Lançamento anômalo: a porta responde "entrou" sem que o saldo mude.
    const { store, deps, finalizarVenda } = montar({
      aplicarForma: () => Promise.resolve(true),
    });

    const resultado = await acionarCenario('F6', [atalhoDe({ encerraOperacao: true })], deps);

    expect(finalizarVenda).not.toHaveBeenCalled();
    expect(resultado).toMatchObject({ tipo: 'LANCADO', finalizacaoIniciada: false });
    expect(store.getState().saldo().saldoRestante).toBe(centavos(TOTAL_PADRAO));
  });

  it('o evento reporta a finalização real, não um valor fixo (correção F3)', async () => {
    const comEncerramento = montar();
    await acionarCenario('F6', [atalhoDe({ encerraOperacao: true })], comEncerramento.deps);

    const semEncerramento = montar();
    await acionarCenario('F6', [atalhoDe({ encerraOperacao: false })], semEncerramento.deps);

    expect(
      eventosDeVendaRapida(comEncerramento.store)[0]?.detalhes.finalizacaoAutomatica,
    ).toBe(true);
    expect(
      eventosDeVendaRapida(semEncerramento.store)[0]?.detalhes.finalizacaoAutomatica,
    ).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * T026 — a composição real, e não só o duplo do teste
 * ------------------------------------------------------------------ */

describe('criarDepsPadrao — as portas ligadas ao vendaStore de produção (T026)', () => {
  beforeEach(() => {
    useVendaStore.setState({
      linhas: [],
      condicaoSelecionada: null,
      descontoCapa: null,
      pagamentos: [],
      valesDevolucao: [],
      acionamentoEmAndamento: false,
    });
    useVendaStore.getState().resetarAuditoria('NOVA');
  });

  it('registrarEvento grava VENDA_RAPIDA_ACIONADA no formato do contrato §5', () => {
    const deps = criarDepsPadrao([A_VISTA], () => Promise.resolve());

    deps.registrarEvento(
      atalhoDe({ tecla: 'F9', nome: 'PIX à vista', formaCodigo: PIX.codigo }),
      centavos(4_250),
      true,
    );

    const evento = useVendaStore
      .getState()
      .eventos.find((candidato) => candidato.tipo === 'VENDA_RAPIDA_ACIONADA');

    expect(evento?.detalhes).toEqual({
      tecla: 'F9',
      cenarioNome: 'PIX à vista',
      condicaoCodigo: A_VISTA.codigo,
      formaCodigo: PIX.codigo,
      valorLancado: 4_250,
      finalizacaoAutomatica: true,
    });
    // O `timestamp` é do slice, nunca do call site (contrato da feature 001).
    expect(evento?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('selecionarCondicao resolve o código no catálogo e ignora código desconhecido', () => {
    const deps = criarDepsPadrao([A_VISTA], () => Promise.resolve());

    deps.selecionarCondicao(999);
    expect(useVendaStore.getState().condicaoSelecionada).toBeNull();

    deps.selecionarCondicao(A_VISTA.codigo);
    expect(useVendaStore.getState().condicaoSelecionada?.codigo).toBe(A_VISTA.codigo);
  });

  it('o guard vive no slice, então tecla e clique disputam o mesmo booleano (I9)', () => {
    const deps = criarDepsPadrao([A_VISTA], () => Promise.resolve());

    expect(deps.acionamentoEmAndamento()).toBe(false);
    deps.marcarAcionamento(true);
    expect(useVendaStore.getState().acionamentoEmAndamento).toBe(true);
    expect(criarDepsPadrao([A_VISTA], () => Promise.resolve()).acionamentoEmAndamento()).toBe(true);

    deps.marcarAcionamento(false);
    expect(deps.acionamentoEmAndamento()).toBe(false);
  });

  it('vendaTemItens ignora linha cancelada — o que importa é haver valor a cobrar', () => {
    const deps = criarDepsPadrao([A_VISTA], () => Promise.resolve());

    expect(deps.vendaTemItens()).toBe(false);

    useVendaStore.setState({ linhas: [linhaDe({ precoUnitario: 1_000 })] });
    expect(deps.vendaTemItens()).toBe(true);

    useVendaStore.setState({ linhas: [linhaDe({ precoUnitario: 1_000, cancelada: true })] });
    expect(deps.vendaTemItens()).toBe(false);
  });
});

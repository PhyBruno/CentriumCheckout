import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVendaStore } from '../../../../src/client/stores/vendaStore';
import {
  eventoClienteCriado,
  eventoClienteSelecionado,
  eventoClienteTrocado,
  eventoCondicaoPagamentoAplicada,
  eventoDavImportado,
  eventoDescontoCapaAplicado,
  eventoFaturamentoFalhou,
  eventoFormaPagamentoAplicada,
  eventoFormaPagamentoRemovida,
  eventoPagamentoRecusado,
  eventoProdutoAlterado,
  eventoProdutoCancelado,
  eventoProdutoInserido,
  eventoValeDevolucaoUsado,
  eventoValidacaoVendaRecusada,
  eventoVendaFinalizada,
  eventoVendaRapidaAcionada,
  eventoVendaSuspensa,
  eventoVendedorSelecionado,
  eventoVendedorTrocado,
  ultimoDescontoCapaAuditado,
} from '../../../../src/client/domain/auditoria/eventos';
import type { EventoAuditoriaRegistravel } from '../../../../src/client/domain/auditoria/eventos';
import { serializarLogAuditoria } from '../../../../src/client/domain/auditoria/serializarLog';

/**
 * Catálogo de eventos + dispatcher do slice de auditoria (feature 001).
 *
 * O que se protege aqui: um `tipo` errado numa factory ou um `detalhes` com
 * campo renomeado chega ao ERP como log inutilizável — e o Checkout não tem
 * tela de revisão (FR-009), então ninguém percebe antes da auditoria fiscal.
 */

/**
 * ISO 8601 com milissegundos no fuso do navegador e o deslocamento explícito
 * (AD-280) — nunca o `Z` de `toISOString()`.
 */
const ISO_8601_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/;

function historico() {
  return useVendaStore.getState().eventos;
}

function registrar(evento: EventoAuditoriaRegistravel): void {
  useVendaStore.getState().registrarEventoAuditoria(evento);
}

beforeEach(() => {
  // O store é singleton de módulo: sem isto, um teste herdaria o histórico do
  // anterior — exatamente o que FR-008 proíbe em produção.
  useVendaStore.getState().descartarAuditoria();
  // `import.meta.env.DEV` é `true` sob Vitest e o `descartarAuditoria()` acima
  // deixa o array vazio, então o aviso de "histórico vazio" (correção 2)
  // dispararia em quase todo teste. Silenciado aqui; `restoreMocks: true` no
  // `vitest.config.ts` restaura `console.warn` sozinho a cada teste.
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

describe('VENDA_INICIADA e resetarAuditoria (T005)', () => {
  it.each(['NOVA', 'RASCUNHO', 'DAV'] as const)(
    'abre a sessão com um único VENDA_INICIADA de origem %s',
    (origem) => {
      useVendaStore.getState().resetarAuditoria(origem);

      expect(historico()).toHaveLength(1);
      expect(historico()[0]).toMatchObject({
        tipo: 'VENDA_INICIADA',
        detalhes: { origem },
      });
      expect(historico()[0]?.timestamp).toMatch(ISO_8601_MS);
    },
  );

  it('não herda o histórico da sessão anterior ao retomar (FR-008)', () => {
    useVendaStore.getState().resetarAuditoria('NOVA');
    registrar(
      eventoProdutoInserido({
        codigoProduto: 'PROD-1',
        quantidade: 1,
        precoUnitario: 1990,
        desconto: 0,
      }),
    );
    registrar(eventoVendaSuspensa());
    expect(historico()).toHaveLength(3);

    useVendaStore.getState().resetarAuditoria('RASCUNHO');

    expect(historico()).toHaveLength(1);
    expect(historico().map((evento) => evento.tipo)).toEqual(['VENDA_INICIADA']);
    expect(historico()[0]).toMatchObject({ detalhes: { origem: 'RASCUNHO' } });
  });
});

describe('Aviso de histórico vazio e ordenação real (correção 2 e 3)', () => {
  it('registra o evento mesmo sem sessão aberta e avisa em desenvolvimento (FR-002)', () => {
    // beforeEach já chamou descartarAuditoria(): histórico vazio, sem
    // VENDA_INICIADA — simula um call site que esqueceu de chamar
    // resetarAuditoria antes (erro de sequenciamento em efeito React, corrida
    // no bootstrap).
    registrar(eventoVendaSuspensa());

    // O evento não é engolido: perder um dado de auditoria é pior do que
    // registrá-lo fora de ordem.
    expect(historico()).toHaveLength(1);
    expect(historico()[0]?.tipo).toBe('VENDA_SUSPENSA');

    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('FR-002'));
  });

  it('não avisa quando a sessão foi aberta com resetarAuditoria antes', () => {
    useVendaStore.getState().resetarAuditoria('NOVA');

    registrar(eventoClienteSelecionado({ codigoCliente: 101, nome: 'Cliente Sintético' }));

    expect(console.warn).not.toHaveBeenCalled();
  });

  it('preserva a ordem de chamada no array mesmo com timestamps iguais (relógio real)', () => {
    // Sem vi.useFakeTimers(): relógio real de propósito. `new Date().toISOString()`
    // tem resolução de milissegundo, então dois registros no mesmo tick real
    // (ex.: bipagem rápida de código de barras gerando dois PRODUTO_INSERIDO em
    // sequência) podem produzir timestamps IGUAIS. A garantia real do slice é a
    // ORDEM DO ARRAY — ela nunca depende do timestamp e nunca quebra. Por isso a
    // asserção de timestamp abaixo é "não-decrescente" (`>=`), não "estritamente
    // crescente" (`>`): afirmar `>` documentaria uma garantia mais forte do que
    // o slice realmente oferece.
    registrar(eventoProdutoCancelado({ codigoProduto: 'PROD-A' }));
    registrar(eventoProdutoCancelado({ codigoProduto: 'PROD-B' }));
    registrar(eventoProdutoCancelado({ codigoProduto: 'PROD-C' }));
    registrar(eventoProdutoCancelado({ codigoProduto: 'PROD-D' }));

    const registrados = historico();
    expect(registrados.map((evento) => evento.detalhes)).toEqual([
      { codigoProduto: 'PROD-A' },
      { codigoProduto: 'PROD-B' },
      { codigoProduto: 'PROD-C' },
      { codigoProduto: 'PROD-D' },
    ]);

    const timestamps = registrados.map((evento) => evento.timestamp);
    expect(timestamps).toHaveLength(4);
    for (const timestamp of timestamps) {
      expect(timestamp).toMatch(ISO_8601_MS);
    }

    const naoDecrescente = timestamps.every((atual, indice) => {
      if (indice === 0) {
        return true;
      }
      const anterior = timestamps[indice - 1];
      // `noUncheckedIndexedAccess`: comparar `>=` só depois de garantir que o
      // vizinho existe — nunca com non-null assertion (`!`).
      return anterior !== undefined && atual >= anterior;
    });
    expect(naoDecrescente).toBe(true);
  });
});

describe('Eventos de ação (T009)', () => {
  /** Um por tipo, tipos 2–14 do catálogo (`data-model.md`). Valores sintéticos. */
  const EVENTOS_DE_ACAO: readonly EventoAuditoriaRegistravel[] = [
    eventoClienteSelecionado({ codigoCliente: 101, nome: 'Cliente Sintético' }),
    eventoClienteCriado({ codigoCliente: 102, nome: 'Cliente Recém-Criado' }),
    eventoClienteTrocado({ codigoClienteAnterior: 101, codigoClienteNovo: 102 }),
    eventoVendedorSelecionado({ codigoVendedor: 7, nome: 'Vendedor Sintético' }),
    eventoVendedorTrocado({ codigoVendedorAnterior: 7, codigoVendedorNovo: 9 }),
    eventoProdutoInserido({
      codigoProduto: 'PROD-1',
      quantidade: 2,
      // Centavos inteiros, sem recálculo neste módulo (Constitution V).
      precoUnitario: 1990,
      desconto: 150,
    }),
    eventoProdutoAlterado({
      codigoProduto: 'PROD-1',
      campo: 'quantidade',
      valorAnterior: 2,
      valorNovo: 3,
    }),
    eventoProdutoCancelado({ codigoProduto: 'PROD-1' }),
    eventoCondicaoPagamentoAplicada({ condicao: 'A VISTA' }),
    eventoFormaPagamentoAplicada({ formaPagamento: 'DINHEIRO', valor: 5000 }),
    eventoFormaPagamentoRemovida({ formaPagamento: 'DINHEIRO' }),
    eventoValeDevolucaoUsado({ codigoVale: 'VALE-0001', valor: 2500 }),
    eventoPagamentoRecusado({ tipo: 'PIX', motivo: 'Saldo insuficiente' }),
  ];

  it('registra os 13 tipos de ação preservando tipo, detalhes e timestamp', () => {
    for (const evento of EVENTOS_DE_ACAO) {
      registrar(evento);
    }

    const registrados = historico();
    expect(registrados).toHaveLength(13);
    expect(registrados.map((evento) => evento.tipo)).toEqual([
      'CLIENTE_SELECIONADO',
      'CLIENTE_CRIADO',
      'CLIENTE_TROCADO',
      'VENDEDOR_SELECIONADO',
      'VENDEDOR_TROCADO',
      'PRODUTO_INSERIDO',
      'PRODUTO_ALTERADO',
      'PRODUTO_CANCELADO',
      'CONDICAO_PAGAMENTO_APLICADA',
      'FORMA_PAGAMENTO_APLICADA',
      'FORMA_PAGAMENTO_REMOVIDA',
      'VALE_DEVOLUCAO_USADO',
      'PAGAMENTO_RECUSADO',
    ]);

    registrados.forEach((registrado, indice) => {
      expect(registrado.detalhes).toEqual(EVENTOS_DE_ACAO[indice]?.detalhes);
      expect(registrado.timestamp).toMatch(ISO_8601_MS);
    });
  });

  it('aceita PAGAMENTO_RECUSADO sem motivo (campo opcional)', () => {
    registrar(eventoPagamentoRecusado({ tipo: 'TEF' }));

    expect(historico()[0]).toMatchObject({
      tipo: 'PAGAMENTO_RECUSADO',
      detalhes: { tipo: 'TEF' },
    });
  });

  it('carimba o timestamp no push, acompanhando o relógio', () => {
    // Relógio controlado: `toISOString()` tem resolução de milissegundo, então
    // dois registros no mesmo tick teriam timestamps iguais. Em produção as
    // ações do operador são segundos entre si; aqui o avanço é explícito para
    // provar que o carimbo acompanha o relógio no momento do `push`.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T10:00:00.000Z'));

    registrar(eventoProdutoCancelado({ codigoProduto: 'PROD-1' }));
    vi.advanceTimersByTime(1);
    registrar(eventoProdutoCancelado({ codigoProduto: 'PROD-2' }));
    vi.advanceTimersByTime(1500);
    registrar(eventoProdutoCancelado({ codigoProduto: 'PROD-3' }));

    // A suíte roda em `America/Sao_Paulo` (`vitest.config.ts`): 10h UTC são 7h
    // no relógio do caixa.
    expect(historico().map((evento) => evento.timestamp)).toEqual([
      '2026-01-01T07:00:00.000-03:00',
      '2026-01-01T07:00:00.001-03:00',
      '2026-01-01T07:00:01.501-03:00',
    ]);
  });

  it('carimba no horário do navegador, e o texto continua sendo o mesmo instante (AD-280)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-16T13:23:45.123Z'));

    registrar(eventoProdutoCancelado({ codigoProduto: 'PROD-1' }));

    const timestamp = historico()[0]?.timestamp ?? '';
    expect(timestamp).toBe('2026-10-16T10:23:45.123-03:00');
    expect(new Date(timestamp).toISOString()).toBe('2026-10-16T13:23:45.123Z');
  });

  it('ignora um timestamp fornecido pelo call site', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T10:00:00.000Z'));

    // O contrato manda o call site não fornecer `timestamp`; se alguém burlar
    // o tipo, o slice ainda tem a última palavra sobre a ordem do histórico.
    registrar({
      ...eventoProdutoCancelado({ codigoProduto: 'PROD-1' }),
      timestamp: '1999-12-31T23:59:59.999Z',
    } as EventoAuditoriaRegistravel);

    expect(historico()[0]?.timestamp).toBe('2026-01-01T07:00:00.000-03:00');
  });
});

describe('VALIDACAO_VENDA_RECUSADA (T019)', () => {
  it('registra a recusa da validação prévia com origem, condição, forma e motivo', () => {
    registrar(
      eventoValidacaoVendaRecusada({
        origem: 'ATALHO_CENARIO',
        condicao: 'A PRAZO',
        formaPagamento: 'CARTAO',
        motivo: 'Cliente sem limite de crédito',
      }),
    );

    expect(historico()[0]).toMatchObject({
      tipo: 'VALIDACAO_VENDA_RECUSADA',
      detalhes: {
        origem: 'ATALHO_CENARIO',
        condicao: 'A PRAZO',
        formaPagamento: 'CARTAO',
        motivo: 'Cliente sem limite de crédito',
      },
    });
    expect(historico()[0]?.timestamp).toMatch(ISO_8601_MS);
  });

  it('é um evento distinto de PAGAMENTO_RECUSADO (FR-010)', () => {
    registrar(
      eventoValidacaoVendaRecusada({
        origem: 'MANUAL',
        condicao: 'A VISTA',
        formaPagamento: 'PIX',
        motivo: 'ERP indisponível',
      }),
    );
    registrar(eventoPagamentoRecusado({ tipo: 'PIX', motivo: 'ERP indisponível' }));

    expect(historico().map((evento) => evento.tipo)).toEqual([
      'VALIDACAO_VENDA_RECUSADA',
      'PAGAMENTO_RECUSADO',
    ]);
  });
});

describe('DAV_IMPORTADO (T021)', () => {
  it('registra a importação do DAV com contagens de linhas e formas', () => {
    registrar(
      eventoDavImportado({
        numeroDav: 'DAV-000123',
        numeroRascunho: 4567,
        quantidadeLinhas: 3,
        quantidadeFormasDePagamento: 2,
      }),
    );

    expect(historico()[0]).toMatchObject({
      tipo: 'DAV_IMPORTADO',
      detalhes: {
        numeroDav: 'DAV-000123',
        numeroRascunho: 4567,
        quantidadeLinhas: 3,
        quantidadeFormasDePagamento: 2,
      },
    });
    expect(historico()[0]?.timestamp).toMatch(ISO_8601_MS);
  });
});

describe('VENDA_RAPIDA_ACIONADA (T023)', () => {
  it('registra o cenário acionado, a tecla e o valor lançado em centavos', () => {
    registrar(
      eventoVendaRapidaAcionada({
        tecla: 'F8',
        cenarioNome: 'PIX à vista',
        condicaoCodigo: 1,
        formaCodigo: 12,
        valorLancado: 12345,
        finalizacaoAutomatica: true,
      }),
    );

    expect(historico()[0]).toMatchObject({
      tipo: 'VENDA_RAPIDA_ACIONADA',
      detalhes: {
        tecla: 'F8',
        cenarioNome: 'PIX à vista',
        condicaoCodigo: 1,
        formaCodigo: 12,
        valorLancado: 12345,
        finalizacaoAutomatica: true,
      },
    });
    expect(historico()[0]?.timestamp).toMatch(ISO_8601_MS);
  });
});

/** 017, US3 (T038, FR-025) — a capa registra se veio da condição ou do operador. */
describe('DESCONTO_CAPA_APLICADO', () => {
  it('registra origem, modo, entrada e valor em centavos', () => {
    registrar(
      eventoDescontoCapaAplicado({
        origem: 'CONDICAO',
        modo: 'PERCENTUAL',
        entrada: 5,
        valor: 500,
      }),
    );

    expect(historico()[0]).toMatchObject({
      tipo: 'DESCONTO_CAPA_APLICADO',
      detalhes: { origem: 'CONDICAO', modo: 'PERCENTUAL', entrada: 5, valor: 500 },
    });
    expect(historico()[0]?.timestamp).toMatch(ISO_8601_MS);
  });

  it('vai inteiro no Log do retrato', () => {
    registrar(
      eventoDescontoCapaAplicado({ origem: 'MANUAL', modo: 'VALOR', entrada: 300, valor: 300 }),
    );

    const log: unknown = JSON.parse(serializarLogAuditoria(historico()));

    expect(log).toEqual([
      expect.objectContaining({
        tipo: 'DESCONTO_CAPA_APLICADO',
        detalhes: { origem: 'MANUAL', modo: 'VALOR', entrada: 300, valor: 300 },
      }),
    ]);
  });

  it('ultimoDescontoCapaAuditado devolve o último evento de capa, ignorando os demais', () => {
    expect(ultimoDescontoCapaAuditado([])).toBeNull();

    registrar(
      eventoDescontoCapaAplicado({
        origem: 'CONDICAO',
        modo: 'PERCENTUAL',
        entrada: 5,
        valor: 500,
      }),
    );
    registrar(
      eventoDescontoCapaAplicado({ origem: 'MANUAL', modo: 'PERCENTUAL', entrada: 7, valor: 700 }),
    );
    registrar(eventoVendaSuspensa());

    expect(ultimoDescontoCapaAuditado(historico())?.detalhes).toEqual({
      origem: 'MANUAL',
      modo: 'PERCENTUAL',
      entrada: 7,
      valor: 700,
    });
    expect(ultimoDescontoCapaAuditado([historico()[2]].flatMap((e) => (e ? [e] : [])))).toBeNull();
  });
});

describe('Eventos de finalização (T013)', () => {
  it('registra FATURAMENTO_FALHOU com a operação tentada', () => {
    registrar(eventoFaturamentoFalhou({ operacao: 'FATURAR' }));
    registrar(eventoFaturamentoFalhou({ operacao: 'SUSPENDER' }));

    expect(historico()).toMatchObject([
      { tipo: 'FATURAMENTO_FALHOU', detalhes: { operacao: 'FATURAR' } },
      { tipo: 'FATURAMENTO_FALHOU', detalhes: { operacao: 'SUSPENDER' } },
    ]);
    for (const evento of historico()) {
      expect(evento.timestamp).toMatch(ISO_8601_MS);
    }
  });

  it('registra VENDA_FINALIZADA e VENDA_SUSPENSA sem detalhes', () => {
    registrar(eventoVendaFinalizada());
    registrar(eventoVendaSuspensa());

    expect(historico().map((evento) => evento.tipo)).toEqual([
      'VENDA_FINALIZADA',
      'VENDA_SUSPENSA',
    ]);
    expect(historico().map((evento) => evento.detalhes)).toEqual([{}, {}]);
    for (const evento of historico()) {
      expect(evento.timestamp).toMatch(ISO_8601_MS);
    }
  });
});

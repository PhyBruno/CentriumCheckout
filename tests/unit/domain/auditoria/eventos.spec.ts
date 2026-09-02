import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVendaStore } from '../../../../src/client/stores/vendaStore';
import {
  eventoClienteCriado,
  eventoClienteSelecionado,
  eventoClienteTrocado,
  eventoCondicaoPagamentoAplicada,
  eventoDavImportado,
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
} from '../../../../src/client/domain/auditoria/eventos';
import type { EventoAuditoriaSemTimestamp } from '../../../../src/client/domain/auditoria/eventos';

/**
 * Catálogo de eventos + dispatcher do slice de auditoria (feature 001).
 *
 * O que se protege aqui: um `tipo` errado numa factory ou um `detalhes` com
 * campo renomeado chega ao ERP como log inutilizável — e o Checkout não tem
 * tela de revisão (FR-009), então ninguém percebe antes da auditoria fiscal.
 */

/** `new Date().toISOString()` — UTC com milissegundos (research.md #2). */
const ISO_8601_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function historico() {
  return useVendaStore.getState().eventos;
}

function registrar(evento: EventoAuditoriaSemTimestamp): void {
  useVendaStore.getState().registrarEventoAuditoria(evento);
}

beforeEach(() => {
  // O store é singleton de módulo: sem isto, um teste herdaria o histórico do
  // anterior — exatamente o que FR-008 proíbe em produção.
  useVendaStore.getState().descartarAuditoria();
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

describe('Eventos de ação (T009)', () => {
  /** Um por tipo, tipos 2–14 do catálogo (`data-model.md`). Valores sintéticos. */
  const EVENTOS_DE_ACAO: readonly EventoAuditoriaSemTimestamp[] = [
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

  it('carimba o timestamp no push, em ordem estritamente crescente', () => {
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

    expect(historico().map((evento) => evento.timestamp)).toEqual([
      '2026-01-01T10:00:00.000Z',
      '2026-01-01T10:00:00.001Z',
      '2026-01-01T10:00:01.501Z',
    ]);
  });

  it('ignora um timestamp fornecido pelo call site', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T10:00:00.000Z'));

    // O contrato manda o call site não fornecer `timestamp`; se alguém burlar
    // o tipo, o slice ainda tem a última palavra sobre a ordem do histórico.
    registrar({
      ...eventoProdutoCancelado({ codigoProduto: 'PROD-1' }),
      timestamp: '1999-12-31T23:59:59.999Z',
    } as EventoAuditoriaSemTimestamp);

    expect(historico()[0]?.timestamp).toBe('2026-01-01T10:00:00.000Z');
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
        numeroNota: 4567,
        quantidadeLinhas: 3,
        quantidadeFormasDePagamento: 2,
      }),
    );

    expect(historico()[0]).toMatchObject({
      tipo: 'DAV_IMPORTADO',
      detalhes: {
        numeroDav: 'DAV-000123',
        numeroNota: 4567,
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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVendaStore } from '../../../../src/client/stores/vendaStore';
import { serializarLogAuditoria } from '../../../../src/client/domain/auditoria/serializarLog';
import {
  eventoClienteSelecionado,
  eventoFaturamentoFalhou,
  eventoFormaPagamentoAplicada,
  eventoProdutoInserido,
  eventoVendaFinalizada,
} from '../../../../src/client/domain/auditoria/eventos';
import type { EventoAuditoria } from '../../../../src/client/domain/auditoria/eventos';

/**
 * Serialização do histórico para o campo `Log` de `FaturarNFCe` (US2).
 *
 * O que se protege aqui é AUDIT-09 (`.specs/features/auditoria-acoes-operador/spec.md`,
 * linha 87): uma falha de rede na finalização não pode encolher o histórico —
 * é o único ponto do sistema em que eventos já registrados poderiam sumir sem
 * ninguém notar, já que o Checkout não tem tela de auditoria (FR-009).
 */

function historico() {
  return useVendaStore.getState().eventos;
}

/** Monta uma venda sintética plausível, com o relógio avançando entre ações. */
function encenarVendaAteOPagamento(): void {
  vi.setSystemTime(new Date('2026-01-01T10:00:00.000Z'));
  const { resetarAuditoria, registrarEventoAuditoria } = useVendaStore.getState();

  resetarAuditoria('NOVA');
  vi.advanceTimersByTime(1200);
  registrarEventoAuditoria(
    eventoClienteSelecionado({ codigoCliente: 101, nome: 'Cliente Sintético' }),
  );
  vi.advanceTimersByTime(3400);
  registrarEventoAuditoria(
    eventoProdutoInserido({
      codigoProduto: 'PROD-1',
      quantidade: 2,
      precoUnitario: 1990,
      desconto: 0,
    }),
  );
  vi.advanceTimersByTime(2100);
  registrarEventoAuditoria(
    eventoFormaPagamentoAplicada({ formaPagamento: 'DINHEIRO', valor: 3980 }),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  useVendaStore.getState().descartarAuditoria();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('serializarLogAuditoria (T012)', () => {
  it('faz round-trip por JSON.parse sem perder nenhum campo', () => {
    encenarVendaAteOPagamento();
    vi.advanceTimersByTime(800);
    useVendaStore.getState().registrarEventoAuditoria(eventoVendaFinalizada());

    const log = serializarLogAuditoria(historico());

    expect(typeof log).toBe('string');
    expect(JSON.parse(log)).toEqual(historico());
  });

  it('preserva a ordem cronológica estritamente crescente', () => {
    encenarVendaAteOPagamento();

    const eventos = JSON.parse(serializarLogAuditoria(historico())) as EventoAuditoria[];

    expect(eventos.map((evento) => evento.tipo)).toEqual([
      'VENDA_INICIADA',
      'CLIENTE_SELECIONADO',
      'PRODUTO_INSERIDO',
      'FORMA_PAGAMENTO_APLICADA',
    ]);
    const timestamps = eventos.map((evento) => evento.timestamp);
    expect([...timestamps].sort()).toEqual(timestamps);
    expect(new Set(timestamps).size).toBe(timestamps.length);
  });

  it('serializa histórico vazio como array JSON vazio', () => {
    expect(serializarLogAuditoria([])).toBe('[]');
  });
});

describe('Retentativa após FATURAMENTO_FALHOU (T014, FR-006/FR-007)', () => {
  it('reenvia o histórico completo, incluindo a falha anterior', () => {
    encenarVendaAteOPagamento();

    // 1ª tentativa: rede cai. A feature 004 registra a falha e **não** chama
    // `descartarAuditoria` — o histórico segue vivo para a próxima tentativa.
    vi.advanceTimersByTime(500);
    useVendaStore
      .getState()
      .registrarEventoAuditoria(eventoFaturamentoFalhou({ operacao: 'FATURAR' }));
    const logDaTentativaQueFalhou = serializarLogAuditoria(historico());

    // 2ª tentativa, rede restaurada.
    vi.advanceTimersByTime(9000);
    useVendaStore.getState().registrarEventoAuditoria(eventoVendaFinalizada());
    const logDaTentativaBemSucedida = serializarLogAuditoria(historico());

    const reenviado = JSON.parse(logDaTentativaBemSucedida) as EventoAuditoria[];
    expect(reenviado.map((evento) => evento.tipo)).toEqual([
      'VENDA_INICIADA',
      'CLIENTE_SELECIONADO',
      'PRODUTO_INSERIDO',
      'FORMA_PAGAMENTO_APLICADA',
      'FATURAMENTO_FALHOU',
      'VENDA_FINALIZADA',
    ]);
    // Estritamente maior, nunca reiniciado: o log da tentativa que falhou é um
    // prefixo do log reenviado.
    expect(logDaTentativaBemSucedida.length).toBeGreaterThan(logDaTentativaQueFalhou.length);
    expect(JSON.parse(logDaTentativaQueFalhou)).toEqual(reenviado.slice(0, 5));
  });

  it('só esvazia o histórico depois da entrega bem-sucedida (FR-007)', () => {
    encenarVendaAteOPagamento();
    useVendaStore
      .getState()
      .registrarEventoAuditoria(eventoFaturamentoFalhou({ operacao: 'SUSPENDER' }));

    expect(historico()).toHaveLength(5);

    useVendaStore.getState().descartarAuditoria();

    expect(historico()).toEqual([]);
    expect(serializarLogAuditoria(historico())).toBe('[]');
  });
});

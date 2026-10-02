import { describe, expect, it } from 'vitest';
import {
  interpretarStatusCobrancaTef,
  interpretarStatusEstornoTef,
  MENSAGEM_POR_MOTIVO_FALHA_TEF,
  type MotivoFalhaTef,
  type StatusSmartTef,
} from '../../../../src/client/domain/tef/interpretarStatusTef';

/**
 * T003 — os nove literais de `SmartTefStatusPagamento` nas duas fases
 * (`research.md` D4, invariante T1 de `data-model.md` §6).
 *
 * A tabela é declarada aqui por extenso, e não derivada da implementação: o
 * teste é a segunda leitura independente da KB, e um erro de mapeamento num
 * literal só seria invisível se as duas leituras saíssem da mesma fonte.
 */

const COBRANCA: ReadonlyArray<readonly [StatusSmartTef, ReturnType<typeof interpretarStatusCobrancaTef>]> =
  [
    ['PDT', { situacao: 'PENDENTE' }],
    ['PROC_PAG', { situacao: 'PENDENTE' }],
    ['CNC', { situacao: 'APROVADO' }],
    ['CAN_ERP', { situacao: 'FALHA', motivo: 'CANCELADO_NO_ERP' }],
    ['REJ_PAG', { situacao: 'FALHA', motivo: 'PAGAMENTO_REJEITADO' }],
    ['SOL_EST', { situacao: 'FALHA', motivo: 'ESTORNADO_FORA_DO_CHECKOUT' }],
    ['PROC_EST', { situacao: 'FALHA', motivo: 'ESTORNADO_FORA_DO_CHECKOUT' }],
    ['EST', { situacao: 'FALHA', motivo: 'ESTORNADO_FORA_DO_CHECKOUT' }],
    ['REJ_EST', { situacao: 'FALHA', motivo: 'ESTORNADO_FORA_DO_CHECKOUT' }],
  ];

const ESTORNO: ReadonlyArray<readonly [StatusSmartTef, ReturnType<typeof interpretarStatusEstornoTef>]> =
  [
    ['PDT', { situacao: 'ESTORNO_PENDENTE' }],
    ['PROC_PAG', { situacao: 'ESTORNO_PENDENTE' }],
    ['CNC', { situacao: 'ESTORNO_PENDENTE' }],
    ['CAN_ERP', { situacao: 'ESTORNO_REJEITADO' }],
    ['REJ_PAG', { situacao: 'ESTORNO_REJEITADO' }],
    ['SOL_EST', { situacao: 'ESTORNO_PENDENTE' }],
    ['PROC_EST', { situacao: 'ESTORNO_PENDENTE' }],
    ['EST', { situacao: 'ESTORNADO' }],
    ['REJ_EST', { situacao: 'ESTORNO_REJEITADO' }],
  ];

/** Literais fora do domínio — inclusive a caixa errada do único que aprova. */
const DESCONHECIDOS = ['', 'cnc', 'XYZ', ' CNC', 'est'] as const;

describe('interpretarStatusCobrancaTef', () => {
  it.each(COBRANCA)('%s → %o', (literal, esperado) => {
    expect(interpretarStatusCobrancaTef(literal)).toEqual(esperado);
  });

  it('só CNC aprova (T1)', () => {
    const aprovados = COBRANCA.filter(
      ([literal]) => interpretarStatusCobrancaTef(literal).situacao === 'APROVADO',
    ).map(([literal]) => literal);
    expect(aprovados).toEqual(['CNC']);
  });

  // Desconhecido espera, não falha: um literal novo da SmartTEF não pode
  // abandonar uma cobrança que o cliente talvez já pagou (`research.md` D4).
  it.each(DESCONHECIDOS)('literal desconhecido %j fica pendente, nunca aprovado', (literal) => {
    expect(interpretarStatusCobrancaTef(literal)).toEqual({ situacao: 'PENDENTE' });
  });
});

describe('interpretarStatusEstornoTef', () => {
  it.each(ESTORNO)('%s → %o', (literal, esperado) => {
    expect(interpretarStatusEstornoTef(literal)).toEqual(esperado);
  });

  it('só EST estorna (T1)', () => {
    const estornados = ESTORNO.filter(
      ([literal]) => interpretarStatusEstornoTef(literal).situacao === 'ESTORNADO',
    ).map(([literal]) => literal);
    expect(estornados).toEqual(['EST']);
  });

  it.each(DESCONHECIDOS)('literal desconhecido %j fica pendente, nunca estornado', (literal) => {
    expect(interpretarStatusEstornoTef(literal)).toEqual({ situacao: 'ESTORNO_PENDENTE' });
  });
});

describe('MENSAGEM_POR_MOTIVO_FALHA_TEF', () => {
  const motivos: readonly MotivoFalhaTef[] = [
    'PAGAMENTO_REJEITADO',
    'CANCELADO_NO_ERP',
    'ESTORNADO_FORA_DO_CHECKOUT',
  ];

  it.each(motivos)('tem uma frase não vazia para %s', (motivo) => {
    expect(MENSAGEM_POR_MOTIVO_FALHA_TEF[motivo].trim()).not.toBe('');
  });
});

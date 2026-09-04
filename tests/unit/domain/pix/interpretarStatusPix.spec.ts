import { describe, expect, it } from 'vitest';
import {
  MENSAGEM_POR_MOTIVO_FALHA,
  interpretarStatusPix,
  type MotivoFalhaPix,
  type StatusTransacaoLiteral,
} from '../../../../src/client/domain/pix/interpretarStatusPix';

/**
 * T008 — os dez literais reais de `StatusTransacao` (AD-102) mapeados 1:1 para a
 * tabela de `data-model.md` §2, mais a guarda de valor desconhecido.
 *
 * O caso de borda que este arquivo existe para travar é a invariante **J2**:
 * nenhum valor fora de `'P'`/`'M'` pode virar `APROVADO`. É a única falha desta
 * feature capaz de dar uma venda como paga sem dinheiro ter entrado.
 */

const APROVADOS: readonly StatusTransacaoLiteral[] = ['P', 'M'];
const PENDENTES: readonly StatusTransacaoLiteral[] = ['C', 'A', 'G'];
const FALHAS: readonly (readonly [StatusTransacaoLiteral, MotivoFalhaPix])[] = [
  ['X', 'EXPIRADA'],
  ['R', 'RECUSADA'],
  ['E', 'ERRO'],
  ['F', 'FECHADA'],
  ['O', 'ASSOCIACAO_REMOVIDA'],
];

describe('interpretarStatusPix', () => {
  it.each(APROVADOS)('trata %s como aprovado', (literal) => {
    expect(interpretarStatusPix(literal)).toEqual({ situacao: 'APROVADO' });
  });

  it.each(PENDENTES)('trata %s como pendente', (literal) => {
    expect(interpretarStatusPix(literal)).toEqual({ situacao: 'PENDENTE' });
  });

  it.each(FALHAS)('trata %s como falha terminal %s', (literal, motivo) => {
    expect(interpretarStatusPix(literal)).toEqual({ situacao: 'FALHA_TERMINAL', motivo });
  });

  it('cobre exatamente os dez literais confirmados em AD-102', () => {
    const cobertos = [...APROVADOS, ...PENDENTES, ...FALHAS.map(([literal]) => literal)];
    expect(new Set(cobertos).size).toBe(10);
  });

  // Guarda J2. Os valores abaixo são justamente os que um `switch` descuidado
  // deixaria cair num `default` otimista: string vazia (campo ausente na
  // resposta), minúscula do literal aprovado, e um literal futuro do ERP.
  it.each(['', 'p', 'm', 'Z', 'PAGO', ' P '])(
    'trata %o como falha terminal desconhecida, nunca como aprovado',
    (valor) => {
      expect(interpretarStatusPix(valor)).toEqual({
        situacao: 'FALHA_TERMINAL',
        motivo: 'DESCONHECIDO',
      });
    },
  );

  it('tem uma frase para cada motivo de falha', () => {
    const motivos: readonly MotivoFalhaPix[] = [
      ...FALHAS.map(([, motivo]) => motivo),
      'DESCONHECIDO',
    ];
    for (const motivo of motivos) {
      expect(MENSAGEM_POR_MOTIVO_FALHA[motivo]).not.toBe('');
    }
  });
});

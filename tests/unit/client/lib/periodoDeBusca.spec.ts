import { describe, expect, it } from 'vitest';
import {
  DIAS_DO_PERIODO_PADRAO,
  periodoPadrao,
  umAnoAntes,
  umAnoDepois,
} from '../../../../src/client/lib/periodoDeBusca';

/**
 * O período nunca passa de um ano (pedido do usuário, 2026-09-24: "tem que
 * limitar a um ano sempre, não pode selecionar mais que isso"). Um ano é do
 * dia até o mesmo dia do ano vizinho, inclusive.
 */
describe('limite de um ano', () => {
  it('um ano antes e depois é o mesmo dia do ano vizinho', () => {
    expect(umAnoAntes('2026-09-24')).toBe('2025-09-24');
    expect(umAnoDepois('2025-09-24')).toBe('2026-09-24');
  });

  it('29 de fevereiro cai no dia 28 do ano sem ele', () => {
    expect(umAnoAntes('2028-02-29')).toBe('2027-02-28');
    expect(umAnoDepois('2024-02-29')).toBe('2025-02-28');
  });

  it('sem data válida não há limite', () => {
    expect(umAnoAntes('')).toBeUndefined();
    expect(umAnoDepois('2026-02-31')).toBeUndefined();
  });
});

/**
 * Período de emissão pré-aplicado às duas janelas de importação — DAV (006) e
 * NFCe (011, AD-237). Um módulo só, para as duas não divergirem no número de
 * dias nem na virada do mês.
 */
describe('periodoPadrao', () => {
  it('são 7 dias', () => {
    expect(DIAS_DO_PERIODO_PADRAO).toBe(7);
  });

  it('vai de 7 dias atrás até hoje, em YYYY-MM-DD', () => {
    expect(periodoPadrao(new Date(2026, 8, 16, 23, 59))).toEqual({
      inicial: '2026-09-09',
      final: '2026-09-16',
    });
  });

  it('atravessa a virada do mês pelo calendário local', () => {
    expect(periodoPadrao(new Date(2026, 2, 3))).toEqual({
      inicial: '2026-02-24',
      final: '2026-03-03',
    });
  });
});

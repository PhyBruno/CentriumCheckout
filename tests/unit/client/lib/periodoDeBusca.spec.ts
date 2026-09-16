import { describe, expect, it } from 'vitest';
import { DIAS_DO_PERIODO_PADRAO, periodoPadrao } from '../../../../src/client/lib/periodoDeBusca';

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

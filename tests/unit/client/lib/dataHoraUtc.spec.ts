import { describe, expect, it } from 'vitest';
import { dataHoraUtcParaLocal } from '../../../../src/client/lib/dataHoraUtc';

/**
 * `GetListaNFCes.Emissao` em UTC → fuso do navegador (AD-258). A suíte roda em
 * `America/Sao_Paulo` (UTC−3, `vitest.config.ts`); os valores são sintéticos.
 */
describe('dataHoraUtcParaLocal', () => {
  it('lê o ISO sem sufixo como UTC e exibe no fuso do navegador', () => {
    expect(dataHoraUtcParaLocal('2026-09-29T19:30:30')).toEqual({
      data: '29/09/2026',
      hora: '16:30',
    });
  });

  it('vira o dia quando a hora UTC ainda é madrugada', () => {
    // 02:15 UTC é 23:15 do dia anterior em Brasília — o caso que ler o texto
    // cru exibia no dia errado.
    expect(dataHoraUtcParaLocal('2026-10-01T02:15:00')).toEqual({
      data: '30/09/2026',
      hora: '23:15',
    });
  });

  it('aceita frações de segundo e ausência de segundos', () => {
    expect(dataHoraUtcParaLocal('2026-09-29T19:30:30.123').hora).toBe('16:30');
    expect(dataHoraUtcParaLocal('2026-09-29T19:30').hora).toBe('16:30');
  });

  it('respeita o fuso quando o ERP o informa', () => {
    expect(dataHoraUtcParaLocal('2026-09-29T19:30:00Z').hora).toBe('16:30');
    expect(dataHoraUtcParaLocal('2026-09-29T19:30:00-03:00').hora).toBe('19:30');
  });

  it('formato inesperado volta cru, sem hora', () => {
    expect(dataHoraUtcParaLocal('29/09/2026')).toEqual({ data: '29/09/2026', hora: '' });
    expect(dataHoraUtcParaLocal('')).toEqual({ data: '', hora: '' });
  });
});

import { describe, expect, it } from 'vitest';
import {
  LARGURA_MINIMA_DESKTOP_PX,
  classificarLayout,
} from '../../../../src/client/domain/layout/classificarLayout';

/**
 * T003 — o limiar de MOB-01 e suas bordas (`data-model.md` §1, I1/I2).
 *
 * O valor testado é o comportamento na fronteira, não o número em si: é ali que
 * um erro de `<` para `<=` deixaria um tablet de 768px no layout errado sem que
 * nenhum outro teste percebesse.
 */
describe('classificarLayout', () => {
  it('trata 768px exato como desktop (I2)', () => {
    expect(classificarLayout(768)).toBe('DESKTOP');
  });

  it('trata o último pixel abaixo do limiar como mobile', () => {
    expect(classificarLayout(767)).toBe('MOBILE');
    expect(classificarLayout(767.98)).toBe('MOBILE');
    expect(classificarLayout(767.99)).toBe('MOBILE');
  });

  it('classifica os extremos sem caso especial', () => {
    expect(classificarLayout(0)).toBe('MOBILE');
    expect(classificarLayout(320)).toBe('MOBILE');
    expect(classificarLayout(1440)).toBe('DESKTOP');
    expect(classificarLayout(7680)).toBe('DESKTOP');
  });

  it('publica o limiar para que a consulta de mídia derive dele, sem segunda cópia', () => {
    expect(LARGURA_MINIMA_DESKTOP_PX).toBe(768);
    expect(classificarLayout(LARGURA_MINIMA_DESKTOP_PX)).toBe('DESKTOP');
    expect(classificarLayout(LARGURA_MINIMA_DESKTOP_PX - 1)).toBe('MOBILE');
  });
});

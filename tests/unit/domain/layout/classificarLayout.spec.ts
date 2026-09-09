import { describe, expect, it } from 'vitest';
import {
  LARGURA_MINIMA_DESKTOP_PX,
  classificarLayout,
} from '../../../../src/client/domain/layout/classificarLayout';

/**
 * T003 — o critério de MOB-01 e suas bordas (`data-model.md` §1, I1/I2,
 * AD-198).
 *
 * O que se testa é o comportamento na fronteira, não o número em si: é ali que
 * um erro de `<` para `<=`, ou uma inversão na ordem dos dois critérios,
 * deixaria um aparelho no layout errado sem que nenhum outro teste percebesse.
 */
const COM_MOUSE = { temPonteiroFino: true } as const;
const SO_DEDO = { temPonteiroFino: false } as const;

describe('classificarLayout', () => {
  /**
   * O critério principal: a tela em etapas existe para o dedo, não para a tela
   * pequena. Sem isto o iPad Pro 12.9 deitado — 1366px, operado só com o dedo —
   * caía na tela única, com alvos de 5px e atalhos F6/F7 que não existem ali.
   */
  it.each([
    ['iPad 10.9 em pé', 820],
    ['iPad Pro 12.9 em pé', 1024],
    ['iPad Pro 11 deitado', 1194],
    ['iPad Pro 12.9 deitado', 1366],
    ['tablet ligado a tela grande', 1920],
  ])('manda %s (%ipx) para o compacto por não ter ponteiro preciso', (_nome, largura) => {
    expect(classificarLayout({ larguraViewportPx: largura, ...SO_DEDO })).toBe('MOBILE');
  });

  /**
   * O contrapeso, e a razão de o insumo ser `any-pointer` (existe **algum**
   * ponteiro preciso) e não `pointer` (o primário é preciso): o monitor touch de
   * balcão com mouse ligado e o notebook de tela sensível continuam no desktop —
   * exatamente o que a decisão original da 007 protegia.
   */
  it('mantém no desktop a tela sensível ao toque que tem mouse', () => {
    expect(classificarLayout({ larguraViewportPx: 1920, ...COM_MOUSE })).toBe('DESKTOP');
  });

  /**
   * O caso que o usuário levantou (2026-09-09): monitor de desktop de 1280px.
   * Tem mouse, então é desktop — a largura sozinha não pode rebaixá-lo, e é por
   * isso que a árvore desktop passou a caber em 1024 em vez de o limiar subir.
   */
  it('mantém no desktop o monitor de 1280px com mouse', () => {
    expect(classificarLayout({ larguraViewportPx: 1280, ...COM_MOUSE })).toBe('DESKTOP');
  });

  it('trata 1024px exato como desktop (I2)', () => {
    expect(classificarLayout({ larguraViewportPx: 1024, ...COM_MOUSE })).toBe('DESKTOP');
  });

  /**
   * O piso: abaixo dele não há tela única possível nem com mouse. Na prática só
   * alcança a janela de navegador arrastada para um palmo num desktop.
   */
  it('trata o último pixel abaixo do piso como mobile, mesmo com mouse', () => {
    expect(classificarLayout({ larguraViewportPx: 1023, ...COM_MOUSE })).toBe('MOBILE');
    expect(classificarLayout({ larguraViewportPx: 1023.98, ...COM_MOUSE })).toBe('MOBILE');
    expect(classificarLayout({ larguraViewportPx: 1023.99, ...COM_MOUSE })).toBe('MOBILE');
  });

  it('classifica os extremos sem caso especial', () => {
    expect(classificarLayout({ larguraViewportPx: 0, ...COM_MOUSE })).toBe('MOBILE');
    expect(classificarLayout({ larguraViewportPx: 320, ...COM_MOUSE })).toBe('MOBILE');
    expect(classificarLayout({ larguraViewportPx: 1440, ...COM_MOUSE })).toBe('DESKTOP');
    expect(classificarLayout({ larguraViewportPx: 7680, ...COM_MOUSE })).toBe('DESKTOP');
  });

  it('publica o piso para que a consulta de mídia derive dele, sem segunda cópia', () => {
    expect(LARGURA_MINIMA_DESKTOP_PX).toBe(1024);
    expect(classificarLayout({ larguraViewportPx: LARGURA_MINIMA_DESKTOP_PX, ...COM_MOUSE })).toBe(
      'DESKTOP',
    );
    expect(
      classificarLayout({ larguraViewportPx: LARGURA_MINIMA_DESKTOP_PX - 1, ...COM_MOUSE }),
    ).toBe('MOBILE');
  });
});

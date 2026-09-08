import { afterEach, describe, expect, it } from 'vitest';
import { classificarLayout } from '../../../../src/client/domain/layout/classificarLayout';
import { obterPlataforma } from '../../../../src/client/layout/obterPlataforma';

/**
 * T005 (AD-116) — a leitura síncrona fora de React devolve **exatamente** o
 * mesmo veredito de `classificarLayout` para a mesma largura.
 *
 * É esse o invariante que justifica a existência do módulo: se `obterPlataforma`
 * pudesse divergir de `useIsMobile` numa faixa de larguras, o `pagamentoSlice`
 * (008) aplicaria a capacidade `plataforma` de um layout que não é o que está
 * montado na tela.
 */
const larguraOriginal = window.innerWidth;

function comLargura(largura: number): void {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: largura,
  });
}

afterEach(() => {
  comLargura(larguraOriginal);
});

describe('obterPlataforma', () => {
  it('devolve DESKTOP em 768px, como classificarLayout', () => {
    comLargura(768);
    expect(obterPlataforma()).toBe('DESKTOP');
    expect(obterPlataforma()).toBe(classificarLayout(768));
  });

  it('devolve MOBILE em 767px, como classificarLayout', () => {
    comLargura(767);
    expect(obterPlataforma()).toBe('MOBILE');
    expect(obterPlataforma()).toBe(classificarLayout(767));
  });

  it('não diverge de classificarLayout em nenhuma largura amostrada', () => {
    for (const largura of [0, 320, 390, 600, 767, 768, 1024, 1440, 2560]) {
      comLargura(largura);
      expect(obterPlataforma()).toBe(classificarLayout(largura));
    }
  });
});

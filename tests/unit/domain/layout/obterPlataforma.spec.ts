import { afterEach, describe, expect, it, vi } from 'vitest';
import { classificarLayout } from '../../../../src/client/domain/layout/classificarLayout';
import { obterPlataforma } from '../../../../src/client/layout/obterPlataforma';

/**
 * T005 (AD-116) — a leitura síncrona fora de React devolve **exatamente** o
 * mesmo veredito de `classificarLayout` para as mesmas capacidades de tela.
 *
 * É esse o invariante que justifica a existência do módulo: se `obterPlataforma`
 * pudesse divergir de `useIsMobile` numa faixa de aparelhos, o `pagamentoSlice`
 * (008) aplicaria a capacidade `plataforma` de um layout que não é o que está
 * montado na tela.
 */
const larguraOriginal = window.innerWidth;
const matchMediaOriginal = window.matchMedia;

function comLargura(largura: number): void {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: largura,
  });
}

/** Duplo de `matchMedia` que só sabe responder `(any-pointer: fine)`. */
function comPonteiroFino(disponivel: boolean): void {
  window.matchMedia = vi.fn(
    (query: string) => ({ matches: query.includes('any-pointer: fine') && disponivel }) as never,
  ) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  comLargura(larguraOriginal);
  window.matchMedia = matchMediaOriginal;
});

describe('obterPlataforma', () => {
  it('devolve DESKTOP em 1024px com mouse, como classificarLayout', () => {
    comLargura(1024);
    comPonteiroFino(true);
    expect(obterPlataforma()).toBe('DESKTOP');
    expect(obterPlataforma()).toBe(
      classificarLayout({ larguraViewportPx: 1024, temPonteiroFino: true }),
    );
  });

  it('devolve MOBILE em 1023px, como classificarLayout', () => {
    comLargura(1023);
    comPonteiroFino(true);
    expect(obterPlataforma()).toBe('MOBILE');
    expect(obterPlataforma()).toBe(
      classificarLayout({ larguraViewportPx: 1023, temPonteiroFino: true }),
    );
  });

  it('devolve MOBILE numa tela larga sem ponteiro preciso (AD-198)', () => {
    comLargura(1920);
    comPonteiroFino(false);
    expect(obterPlataforma()).toBe('MOBILE');
  });

  /**
   * O jsdom não implementa `matchMedia`, e `notificar` chama isto de dentro de
   * specs que nem sabem que existe layout. Sem informação, o desktop é o padrão
   * — o contrário rebaixaria uma tela legítima ao wizard por omissão do
   * ambiente.
   */
  it('assume ponteiro preciso quando o ambiente não implementa matchMedia', () => {
    comLargura(1440);
    // @ts-expect-error — remover a função é exatamente o cenário do jsdom cru.
    delete window.matchMedia;
    expect(obterPlataforma()).toBe('DESKTOP');
  });

  it('não diverge de classificarLayout em nenhuma largura amostrada', () => {
    comPonteiroFino(true);
    for (const largura of [0, 320, 390, 600, 820, 1023, 1024, 1194, 1280, 1366, 1440, 2560]) {
      comLargura(largura);
      expect(obterPlataforma()).toBe(
        classificarLayout({ larguraViewportPx: largura, temPonteiroFino: true }),
      );
    }
  });
});

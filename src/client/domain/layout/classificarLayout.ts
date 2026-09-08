/**
 * Classificação de layout por largura de viewport (T002, `data-model.md` §1).
 *
 * **O critério é exclusivamente a largura** (I1): nunca `maxTouchPoints`,
 * `ontouchstart` ou qualquer sinal de "é um aparelho de toque". Um notebook com
 * tela sensível ao toque continua sendo desktop, e um tablet ligado a um
 * monitor largo continua sendo desktop — é o espaço disponível que decide se a
 * tela única cabe, não o gesto com que o operador a opera (Assumptions do
 * `spec.md`).
 *
 * Pura de propósito: sem `window`, sem React. Quem lê a largura do navegador é
 * a casca (`useIsMobile` via `matchMedia`, `obterPlataforma` via
 * `window.innerWidth`), e o limiar mora num lugar só — duas cópias criariam uma
 * faixa de larguras em que os dois consumidores discordariam sobre qual árvore
 * está montada.
 */
export type ModoLayout = 'DESKTOP' | 'MOBILE';

/**
 * Limiar de MOB-01: `768px`.
 *
 * `768` **exato conta como desktop** (I2) — a média equivalente é
 * `max-width: 767.98px`, e não `max-width: 768px`, para não deixar buraco em
 * telas de largura fracionária (`research.md` D1).
 */
export const LARGURA_MINIMA_DESKTOP_PX = 768;

export function classificarLayout(larguraViewportPx: number): ModoLayout {
  return larguraViewportPx < LARGURA_MINIMA_DESKTOP_PX ? 'MOBILE' : 'DESKTOP';
}

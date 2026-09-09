import type { ModoLayout } from '../domain/layout/classificarLayout';
import { CONSULTA_LAYOUT_COMPACTO } from './useIsMobile';

/**
 * Espelha o veredito de layout no `<html data-layout>` (AD-198).
 *
 * **Por que o CSS não pergunta sozinho.** Antes de 2026-09-09 havia duas
 * materializações do mesmo breakpoint: `LARGURA_MINIMA_DESKTOP_PX` no
 * TypeScript, que decide *qual árvore monta*, e o `md:` do Tailwind (48rem por
 * padrão) mais três `@media (width < 48rem)` escritos à mão no `global.css`,
 * que decidem *como cada componente se veste*. Elas concordavam por
 * coincidência numérica. No instante em que o limiar deixou de ser 768px, um
 * tablet de 1200px passaria a montar o `MobileWizard` **com o estilo desktop
 * aplicado por cima** — cada `md:` do projeto ligado numa árvore que não é a do
 * desktop. Trocar um bug de layout por outro.
 *
 * Com o atributo, o veredito é calculado uma vez, em TypeScript, e o CSS o
 * consome: `global.css` redefine `md:` como
 * `&:where([data-layout='DESKTOP'] *)` e os blocos de compacto viram
 * `[data-layout='MOBILE'] …`. Não existe mais número de breakpoint no CSS para
 * divergir do domínio — o que também é o que permite ao critério deixar de ser
 * só largura: `any-pointer` teria de ser repetido em cada consulta escrita à
 * mão.
 *
 * **Chamado por `main.tsx`, antes de `createRoot().render()`**, e não de dentro
 * de um componente: entre a primeira pintura e a montagem do `AppShell` existem
 * as telas de carregamento e de erro de sessão (feature 002), que também usam
 * `md:`. Se o atributo só chegasse com o `AppShell`, elas apareceriam vestidas
 * de mobile num desktop.
 *
 * Devolve a função que cancela a assinatura. A SPA nunca a chama — o documento
 * vive enquanto a aba viver —, mas ela existe para o teste poder desmontar o
 * ouvinte entre casos.
 */
export function sincronizarLayoutNoDocumento(): () => void {
  const aplicar = (modo: ModoLayout): void => {
    document.documentElement.dataset.layout = modo;
  };

  // Ambiente sem `matchMedia` (jsdom): o desktop é o padrão, pela mesma razão
  // de `obterPlataforma` — não saber responder não pode rebaixar a tela.
  if (typeof window.matchMedia !== 'function') {
    aplicar('DESKTOP');
    return () => {
      /* nada assinado */
    };
  }

  const consulta = window.matchMedia(CONSULTA_LAYOUT_COMPACTO);
  const aoMudar = (): void => {
    aplicar(consulta.matches ? 'MOBILE' : 'DESKTOP');
  };

  aoMudar();
  consulta.addEventListener('change', aoMudar);
  return () => {
    consulta.removeEventListener('change', aoMudar);
  };
}

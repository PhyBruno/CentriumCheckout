/**
 * Mantém o toast dentro da faixa que o operador de fato enxerga (correção do
 * usuário, 2026-09-15: *"parece que quando é warning, não está fazendo o scroll
 * up para mostrar a notificação"*).
 *
 * **O problema não é de rolagem, é de qual viewport o `fixed` obedece.** O
 * `GooeyToaster` nasce `position: fixed` no canto superior direito, e `fixed` se
 * resolve contra a *layout* viewport. No Chrome/Android a *visual* viewport —
 * o retângulo realmente visível — desliza por dentro da layout assim que o
 * teclado virtual sobe ou o operador aproxima a tela com os dedos. O toast
 * continua desenhado no topo da layout viewport, que nessa hora está acima do
 * que se vê: o operador ouve o "não" e não lê frase nenhuma.
 *
 * `rolarParaOTopo` cobre um caso desse sintoma — a coluna do wizard rolada para
 * baixo — e **só** esse: com um modal aberto por cima, ou com o teclado
 * empurrando a visual viewport, não há coluna que rolar e o toast continua fora
 * de vista. Por isso os dois existem: um reposiciona o conteúdo, este
 * reposiciona o toast.
 *
 * **`translate`, não `transform`**: o sonner usa `transform` nos toasts e pode
 * usá-lo no próprio container (`translateX(-50%)` quando a posição é centrada).
 * A propriedade `translate` é independente e compõe com ele, então ancorar aqui
 * nunca desfaz o posicionamento da biblioteca.
 *
 * Fora do React, chamado uma vez no `main.tsx` como `sincronizarLayoutNoDocumento`:
 * o container do toaster é um nó só, vive pela aplicação inteira e não pertence a
 * componente nenhum — um hook o amarraria a uma árvore que ele não habita.
 */

const SELETOR_DO_TOASTER = '[data-sonner-toaster]';

/**
 * Instala a ancoragem e devolve como desfazê-la.
 *
 * Devolve uma função de limpeza mesmo sem `visualViewport` (navegador antigo,
 * jsdom): quem chama não precisa saber se houve o que instalar.
 */
export function ancorarToastNaViewport(): () => void {
  const viewport = window.visualViewport;
  if (viewport === undefined || viewport === null) {
    return () => {
      /* nada foi instalado */
    };
  }

  function reposicionar(): void {
    const toaster = document.querySelector<HTMLElement>(SELETOR_DO_TOASTER);
    if (toaster === null || viewport === null) {
      return;
    }
    // `offsetTop` é o quanto a visual viewport desceu dentro da layout; empurrar
    // o toast pela mesma distância o recoloca no topo do que se vê. Zero no
    // desktop e no celular sem teclado, onde as duas coincidem — a ancoragem
    // fica inerte em vez de precisar de um `if` de plataforma.
    toaster.style.translate = `0px ${String(Math.round(viewport.offsetTop))}px`;
  }

  viewport.addEventListener('resize', reposicionar);
  viewport.addEventListener('scroll', reposicionar);
  reposicionar();

  return () => {
    viewport.removeEventListener('resize', reposicionar);
    viewport.removeEventListener('scroll', reposicionar);
  };
}

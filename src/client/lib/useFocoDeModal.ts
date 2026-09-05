import { useEffect, useRef, type RefObject } from 'react';

/**
 * O que o Tab alcança. `:not([disabled])` mantém fora os botões de paginação
 * desligados nos extremos da lista, que senão virariam paradas mortas do laço;
 * `[tabindex="-1"]` fica de fora porque é foco programático, não de teclado.
 */
const SELETOR_FOCAVEL = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Prende o foco dentro de uma janela modal e o devolve de onde veio ao fechar.
 *
 * `role="dialog"` + `aria-modal="true"` **afirmam** ao leitor de tela que o
 * resto da página está inerte, mas não o tornam inerte: sem isto o Tab sai da
 * janela e passeia pela tela de venda atrás do backdrop, onde o operador não
 * enxerga o anel de foco. Quem usa teclado perde a referência de onde está, e
 * quem usa leitor de tela ouve conteúdo que a janela diz estar bloqueado.
 *
 * **Cobertura atual:** as três janelas do fluxo de importação
 * (`ModalMenuImportacao`, `ModalImportacaoDav`, `ModalRecuperacaoNFCe`). As
 * demais janelas desta base ainda não usam o hook — estendê-lo a elas é uma
 * linha por modal, mas é mudança de comportamento de teclado em telas que esta
 * revisão não cobriu, então fica para uma passagem própria.
 *
 * @param aberto Estado **lógico** da janela, não o de montagem: `usePresenca`
 * mantém o modal montado durante a animação de saída, e devolver o foco só no
 * desmonte o deixaria preso no nada por toda a animação.
 * @returns `ref` para o elemento com `role="dialog"` — é a fronteira do laço.
 */
export function useFocoDeModal<T extends HTMLElement>(aberto: boolean): RefObject<T | null> {
  const janelaRef = useRef<T | null>(null);
  const focoAnterior = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!aberto) {
      return;
    }

    const ativoAoAbrir = document.activeElement;
    focoAnterior.current = ativoAoAbrir instanceof HTMLElement ? ativoAoAbrir : null;
    const janela = janelaRef.current;

    const aoTeclar = (evento: KeyboardEvent): void => {
      if (evento.key !== 'Tab' || janela === null) {
        return;
      }

      // Consultado a cada Tab, e não memorizado: a lista muda com a janela
      // aberta — os botões de paginação alternam `disabled`, e a tabela troca
      // de linhas a cada busca.
      const focaveis = Array.from(janela.querySelectorAll<HTMLElement>(SELETOR_FOCAVEL));
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (primeiro === undefined || ultimo === undefined) {
        return;
      }

      const ativo = document.activeElement;

      // Foco fora da janela (o backdrop, ou a tela por trás): o próximo Tab
      // entra pelo começo em vez de continuar de onde estava lá fora.
      if (ativo === null || !janela.contains(ativo)) {
        evento.preventDefault();
        primeiro.focus();
        return;
      }
      if (!evento.shiftKey && ativo === ultimo) {
        evento.preventDefault();
        primeiro.focus();
        return;
      }
      if (evento.shiftKey && ativo === primeiro) {
        evento.preventDefault();
        ultimo.focus();
      }
    };

    window.addEventListener('keydown', aoTeclar);

    return () => {
      window.removeEventListener('keydown', aoTeclar);

      const anterior = focoAnterior.current;
      if (anterior === null || !anterior.isConnected) {
        return;
      }

      // Devolve o foco **só** se ninguém mais o tomou. É o caso real do seletor
      // de importação: escolher "Importar NFCe" fecha o seletor e abre a janela
      // de recuperação no mesmo commit, e o `autoFocus` do campo de busca já
      // rodou quando esta limpeza executa. Restaurar aqui arrancaria o foco do
      // campo recém-aberto e o jogaria de volta no atalho da faixa.
      const ativo = document.activeElement;
      const focoSolto = ativo === null || ativo === document.body;
      const focoAindaNaJanela = janela !== null && ativo !== null && janela.contains(ativo);
      if (focoSolto || focoAindaNaJanela) {
        anterior.focus();
      }
    };
  }, [aberto]);

  return janelaRef;
}

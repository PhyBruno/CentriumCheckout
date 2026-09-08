import { useEffect, useRef, type RefObject } from 'react';

/**
 * O que o Tab alcança. `:not([disabled])` mantém fora os botões desligados nos
 * extremos de uma paginação, que senão virariam paradas mortas do laço;
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
 * Pilha das janelas com laço ativo — a última é a que manda.
 *
 * Existe porque os modais desta base **se empilham**: a confirmação destrutiva
 * abre por cima da janela do PIX, o vale devolução por cima do cartão de
 * pagamento, os diálogos da finalização por cima de tudo. Com dois laços ativos
 * ao mesmo tempo, cada Tab dispararia os dois ouvintes e o de baixo puxaria o
 * foco de volta para a janela que já não é a do operador — o mesmo sintoma que
 * o laço existe para evitar, agora causado por ele.
 *
 * Módulo, e não contexto de React: um provedor obrigaria todo call site a
 * conhecer a hierarquia de janelas, que é justamente o que nenhum deles sabe —
 * `DialogoConfirmacaoDestrutiva` é renderizado por quatro pais diferentes.
 */
const pilhaDeJanelas: RefObject<HTMLElement | null>[] = [];

/**
 * Prende o foco dentro de uma janela modal e o devolve de onde veio ao fechar.
 *
 * `role="dialog"` + `aria-modal="true"` **afirmam** ao leitor de tela que o
 * resto da página está inerte, mas não o tornam inerte: sem isto o Tab sai da
 * janela e passeia pela tela de venda atrás do backdrop, onde o operador não
 * enxerga o anel de foco. Quem usa teclado perde a referência de onde está, e
 * quem usa leitor de tela ouve conteúdo que a janela diz estar bloqueado.
 *
 * **A janela é lida no evento, nunca capturada no efeito.** Os modais desta
 * base montam por `usePresenca`, que só liga `montado` num efeito próprio: no
 * commit em que `aberto` vira `true` o componente ainda devolve `null`, então
 * `ref.current` é `null` quando este efeito roda. Capturar o elemento ali
 * deixava o laço **nascer morto** — o `aberto` não muda de novo, o efeito não
 * reexecuta, e o Tab caía na tela de trás (achado do usuário na validação
 * manual, 2026-09-04).
 *
 * @param aberto Estado **lógico** da janela, não o de montagem: `usePresenca`
 * mantém o modal montado durante a animação de saída, e devolver o foco só no
 * desmonte o deixaria preso no nada por toda a animação. Diálogos que o pai
 * renderiza condicionalmente — existir já significa aberto — passam `true`.
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

    pilhaDeJanelas.push(janelaRef);

    const aoTeclar = (evento: KeyboardEvent): void => {
      if (evento.key !== 'Tab') {
        return;
      }
      // Só a janela do topo trata a tecla. As de baixo continuam inscritas
      // porque voltarão a mandar assim que a de cima fechar.
      if (pilhaDeJanelas.at(-1) !== janelaRef) {
        return;
      }

      const janela = janelaRef.current;
      if (janela === null) {
        return;
      }

      // Consultado a cada Tab, e não memorizado: a lista muda com a janela
      // aberta — botões de paginação alternam `disabled`, tabelas trocam de
      // linhas a cada busca, campos aparecem conforme o passo do formulário.
      const focaveis = Array.from(janela.querySelectorAll<HTMLElement>(SELETOR_FOCAVEL));
      const primeiro = focaveis[0];
      const ultimo = focaveis.at(-1);
      if (primeiro === undefined || ultimo === undefined) {
        return;
      }

      const ativo = document.activeElement;

      // Foco fora da janela — o backdrop, ou a tela por trás quando o modal
      // abriu sem `autoFocus`. O próximo Tab entra pelo começo em vez de
      // continuar de onde estava lá fora.
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

      const posicao = pilhaDeJanelas.lastIndexOf(janelaRef);
      if (posicao !== -1) {
        pilhaDeJanelas.splice(posicao, 1);
      }

      const anterior = focoAnterior.current;
      if (anterior === null || !anterior.isConnected) {
        return;
      }

      // Devolve o foco **só** se ninguém mais o tomou. É o caso real do seletor
      // de importação: escolher "Importar NFCe" fecha o seletor e abre a janela
      // de recuperação no mesmo commit, e o `autoFocus` do campo de busca já
      // rodou quando esta limpeza executa. Restaurar aqui arrancaria o foco do
      // campo recém-aberto e o jogaria de volta no atalho da faixa.
      //
      // A regra `exhaustive-deps` pede para copiar a ref para uma variável
      // dentro do efeito. Aqui isso está **errado de propósito**: a cópia
      // precoce é o defeito que este arquivo existe para não repetir — no
      // commit em que `aberto` vira `true`, `usePresenca` ainda não montou o
      // modal e a ref é `null`. O valor que interessa é o do momento da
      // limpeza, e `null` já é tratado logo abaixo.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const janela = janelaRef.current;
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

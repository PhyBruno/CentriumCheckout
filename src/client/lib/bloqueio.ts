import { gooeyToast } from 'goey-toast';

/**
 * Botão bloqueado que **explica** por que está bloqueado (pedido do usuário,
 * 2026-09-03).
 *
 * O `disabled` nativo não dispara evento nenhum: o operador clica e não recebe
 * resposta, e o motivo — que é a informação de que ele precisa para saber o que
 * fazer — fica só no `title`, alcançável apenas com o mouse parado sobre o
 * botão. Num PDV, onde o operador está com pressa e muitas vezes no toque, isso
 * é o mesmo que não informar.
 *
 * O padrão desta base é: **`aria-disabled` no lugar de `disabled`**, com o
 * clique chegando a um handler que emite a notificação com o motivo. Leitores
 * de tela continuam anunciando o controle como desabilitado, o botão segue
 * apagado (`aria-disabled:*` em `components/ui/button.tsx`) e focável — e
 * clicar passa a ensinar a saída em vez de não fazer nada.
 *
 * O motivo é sempre a **frase que o operador lê**, não um código: quem chama já
 * sabe por que bloqueou, e traduzir de novo aqui afastaria o texto da regra que
 * o produziu.
 */
export type MotivoBloqueio = string | null;

/**
 * Atributos do elemento bloqueado, para espalhar no JSX.
 *
 * Devolve `{}` quando não há bloqueio — e não `{ 'aria-disabled': false }` —
 * porque `exactOptionalPropertyTypes` recusa a propriedade explicitamente
 * indefinida, e um `aria-disabled="false"` no DOM é ruído para o leitor de tela.
 *
 * `tabIndex: -1` acompanha o bloqueio (pedido do usuário, 2026-09-08):
 * `aria-disabled`, ao contrário de `disabled`, não tira o elemento da ordem de
 * TAB — o botão continua focável e o teclado passaria por ele como se
 * estivesse ativo. Tirar da ordem de TAB não tira o clique: o mouse ainda
 * alcança o elemento e `acaoBloqueavel` continua explicando o motivo.
 */
export function atributosDeBloqueio(motivo: MotivoBloqueio): {
  'aria-disabled'?: true;
  tabIndex?: -1;
  title?: string;
} {
  return motivo === null ? {} : { 'aria-disabled': true, tabIndex: -1, title: motivo };
}

/**
 * Envolve a ação do botão: bloqueado, notifica o motivo e não executa nada.
 *
 * A checagem acontece **no clique**, não só na renderização — o estado pode
 * mudar entre uma coisa e outra, e é a mesma razão pela qual a recusa de
 * importação é reaplicada dentro da própria orquestração (AD-139).
 */
export function acaoBloqueavel(motivo: MotivoBloqueio, acao: () => void): () => void {
  return () => {
    if (motivo !== null) {
      gooeyToast.error(motivo);
      return;
    }
    acao();
  };
}

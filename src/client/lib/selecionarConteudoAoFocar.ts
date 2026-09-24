/**
 * Chegar a um campo seleciona o conteúdo inteiro dele (pedido do usuário,
 * 2026-09-24): a primeira tecla digitada **substitui** o que estava lá, como se
 * o operador tivesse dado três cliques no campo antes de digitar.
 *
 * É o ritmo do caixa: TAB até a quantidade e "3" vira três, sem apagar o "1"
 * antes; chegar ao valor recebido, que já vem com o faltante
 * (`EntradaPagamento`), e digitar "50" cobra cinquenta. Com o cursor no fim do
 * texto, o mesmo "3" virava "13".
 *
 * **No documento, e não campo a campo.** A regra vale para todo campo de
 * digitação da aplicação — valor, quantidade, preço, desconto, busca, documento
 * do cliente —, e um `onFocus` repetido em cada um seria uma regra a lembrar em
 * cada tela nova. Chamado uma vez no `main.tsx`, como `ancorarToastNaViewport`.
 *
 * Vale para qualquer chegada — TAB, toque, clique ou foco pedido pelo código —,
 * porque o pedido descreve o campo recebendo o operador, não a tecla que o
 * trouxe. Os dois detalhes que fazem isso funcionar nos navegadores:
 *
 * - **Seleção agendada** (`setTimeout` de 0): o foco chega antes de o React
 *   aplicar o que o `onFocus` do próprio campo decidiu — o faltante do valor
 *   recebido é escrito ali —, e antes de o navegador posicionar o cursor do
 *   toque ou do clique. Selecionar na hora selecionaria o texto antigo, ou seria
 *   desfeito pelo cursor em seguida.
 * - **O primeiro `mouseup` depois do foco é engolido**: no Chrome e no Safari,
 *   soltar o botão do mouse recolhe a seleção num cursor. Só esse primeiro — um
 *   segundo clique posiciona o cursor normalmente, para quem quer corrigir um
 *   dígito no meio.
 */

/** Tipos de `<input>` de texto livre — `select()` não se aplica aos demais. */
const TIPOS_SELECIONAVEIS: ReadonlySet<string> = new Set([
  'text',
  'search',
  'tel',
  'url',
  'email',
  'password',
  'number',
]);

/**
 * Campos cujo **próximo** foco não deve selecionar nada — ver
 * `preservarSelecaoNoProximoFoco`. `WeakSet` para não segurar elemento
 * desmontado.
 */
const preservados = new WeakSet<HTMLInputElement>();

/**
 * O próximo foco de `campo` mantém o cursor onde está, sem selecionar.
 *
 * Para quem refoca o campo **sem que o operador tenha chegado a ele**: o botão
 * ABC/123 do código de produto tira e devolve o foco só para o celular trocar
 * de teclado, com o operador no meio da digitação — selecionar ali faria a
 * próxima letra apagar o que ele já tinha digitado.
 */
export function preservarSelecaoNoProximoFoco(campo: HTMLInputElement): void {
  preservados.add(campo);
}

function aceitaSelecao(elemento: EventTarget | null): elemento is HTMLInputElement {
  return (
    elemento instanceof HTMLInputElement &&
    TIPOS_SELECIONAVEIS.has(elemento.type) &&
    !elemento.readOnly &&
    !elemento.disabled
  );
}

/** Instala a seleção ao focar e devolve como desfazê-la (usado pelos testes). */
export function selecionarConteudoAoFocar(): () => void {
  /**
   * Há um botão do mouse pressionado agora? Só um foco nascido de clique tem um
   * `mouseup` a caminho para engolir — num foco por TAB, marcar o campo faria o
   * **próximo** clique nele, talvez minutos depois, não posicionar o cursor.
   */
  let mousePressionado = false;
  let selecionadoNoFoco: HTMLInputElement | null = null;

  function aoPressionarMouse(): void {
    mousePressionado = true;
  }

  function aoFocar(evento: FocusEvent): void {
    const campo = evento.target;
    if (!aceitaSelecao(campo)) {
      return;
    }
    if (preservados.has(campo)) {
      preservados.delete(campo);
      return;
    }
    selecionadoNoFoco = mousePressionado ? campo : null;
    window.setTimeout(() => {
      // O foco pode ter saído no intervalo (TAB em rajada, validação que o
      // devolve a outro campo): selecionar um campo que já não é o ativo não
      // teria efeito visível e só confundiria o próximo foco.
      if (document.activeElement === campo) {
        campo.select();
      }
    }, 0);
  }

  function aoSoltarMouse(evento: MouseEvent): void {
    mousePressionado = false;
    if (selecionadoNoFoco !== null && evento.target === selecionadoNoFoco) {
      evento.preventDefault();
    }
    selecionadoNoFoco = null;
  }

  document.addEventListener('mousedown', aoPressionarMouse, true);
  document.addEventListener('focusin', aoFocar);
  document.addEventListener('mouseup', aoSoltarMouse, true);
  return () => {
    document.removeEventListener('mousedown', aoPressionarMouse, true);
    document.removeEventListener('focusin', aoFocar);
    document.removeEventListener('mouseup', aoSoltarMouse, true);
  };
}

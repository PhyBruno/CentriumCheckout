/**
 * Fechamento do teclado virtual do celular quando o operador passa para algo
 * que não se digita (pedido do usuário, 2026-09-24, em Android e iPhone).
 *
 * **Não existe API para "fechar o teclado".** O que o Chrome e o Safari fazem é
 * mostrá-lo enquanto houver um campo de digitação focado — então fechar é tirar
 * o foco desse campo (`blur`). Os três casos relatados são três jeitos de o foco
 * ficar num campo que o operador já deixou para trás:
 *
 * 1. **Enter/Ir que termina num botão.** O código pede foco num botão que nem
 *    sempre existe na tela — o "Finalizar" mora na etapa 3 do wizard, e o Enter
 *    que cobre a venda acontece na etapa 2 — ou que o Safari não aceita focar
 *    por script. O pedido não move nada e o campo continua focado. Quem move o
 *    foco para botão passa por `focarSemTeclado`, que tira o foco do campo antes.
 * 2. **Tocar fora do campo.** No iPhone, tocar num botão ou numa área vazia não
 *    tira o foco do campo (o Safari não foca botão no toque), e o teclado fica.
 *    `instalarFechamentoDoTecladoAoTocarFora` faz o que o Android já faz.
 * 3. **Trocar de etapa do wizard.** O campo focado some junto com a etapa, e o
 *    teclado nem sempre acompanha. O toque no botão de etapa já cai no caso 2;
 *    `MobileWizard.irPara` fecha explicitamente para não depender disso.
 */

/** Tipos de `<input>` que abrem o teclado virtual — os de data/hora abrem seletor. */
const TIPOS_DE_DIGITACAO: ReadonlySet<string> = new Set([
  'text',
  'search',
  'tel',
  'url',
  'email',
  'password',
  'number',
]);

/**
 * O elemento abre o teclado virtual quando focado?
 *
 * `readOnly` e `disabled` ficam de fora porque o navegador não abre teclado
 * para eles — e são justamente os campos bloqueados do padrão de
 * `lib/bloqueio.ts`, que aceitam foco só para explicar o motivo.
 */
export function ehCampoDeDigitacao(elemento: Element | null): elemento is HTMLElement {
  if (elemento instanceof HTMLTextAreaElement) {
    return !elemento.readOnly && !elemento.disabled;
  }
  if (elemento instanceof HTMLInputElement) {
    return (
      TIPOS_DE_DIGITACAO.has(elemento.type) &&
      !elemento.readOnly &&
      !elemento.disabled &&
      elemento.inputMode !== 'none'
    );
  }
  // `=== true`: onde a propriedade não existe (jsdom), ela vem `undefined`, e a
  // resposta precisa continuar sendo um booleano.
  return elemento instanceof HTMLElement && elemento.isContentEditable === true;
}

/** Tira o foco do campo de digitação ativo, se houver um — e com ele, o teclado. */
export function fecharTecladoVirtual(): void {
  const ativo = document.activeElement;
  if (ehCampoDeDigitacao(ativo)) {
    ativo.blur();
  }
}

/**
 * Leva o foco a um controle que não se digita (botão, combobox) fechando o
 * teclado antes — caso 1 do cabeçalho.
 *
 * Fecha mesmo quando o elemento não existe (`null`): é exatamente o caso do
 * "Finalizar" numa etapa desmontada, em que o pedido de foco não chega a lugar
 * nenhum e o campo ficaria focado.
 */
export function focarSemTeclado(elemento: HTMLElement | null): void {
  fecharTecladoVirtual();
  elemento?.focus();
}

/**
 * O toque caiu num campo de digitação — ou em algo que leva a ele?
 *
 * O `<label>` conta porque tocar no rótulo, no "R$" ao lado do valor ou na
 * moldura de um campo foca o próprio campo: fechar o teclado ali o faria
 * piscar, fechando e reabrindo no mesmo toque. É também o que protege o botão
 * ABC/123 do campo de código, que vive dentro do rótulo dele.
 */
function tocouCampoDeDigitacao(alvo: Element): boolean {
  if (ehCampoDeDigitacao(alvo)) {
    return true;
  }
  const rotulo = alvo.closest('label');
  return rotulo !== null && ehCampoDeDigitacao(rotulo.control);
}

/**
 * Até onde o dedo pode andar entre encostar e soltar para ainda ser um toque.
 * Além disso é rolagem — e rolar a etapa com o teclado aberto, para conferir
 * um item, não é sair do campo.
 */
const DESLOCAMENTO_MAXIMO_DO_TOQUE_PX = 10;

interface InicioDoToque {
  readonly id: number;
  readonly x: number;
  readonly y: number;
}

/**
 * Toque fora do campo fecha o teclado — caso 2 do cabeçalho.
 *
 * Só `pointerType === 'touch'`: é o único ponteiro que convive com o teclado
 * virtual. Um clique de mouse fora do campo segue o comportamento de sempre do
 * navegador, sem nenhuma interferência — inclusive no desktop.
 *
 * No **soltar**, não no encostar: o `pointerdown` também começa uma rolagem, e
 * só no `pointerup` dá para saber se o dedo ficou parado. Quando o navegador
 * assume o gesto como rolagem, ele manda `pointercancel` e o toque é esquecido.
 *
 * Captura no `document`, e não um handler por componente: todo botão, combobox
 * e área vazia da aplicação fica coberto, inclusive os que ainda não existem —
 * um ouvinte por controle seria uma regra a lembrar em cada tela nova.
 *
 * Chamado uma vez no `main.tsx`, como `ancorarToastNaViewport`. Devolve a função
 * que desinstala, para o teste desmontar o ouvinte entre casos.
 */
export function instalarFechamentoDoTecladoAoTocarFora(): () => void {
  let inicio: InicioDoToque | null = null;

  function aoEncostar(evento: PointerEvent): void {
    inicio =
      evento.pointerType === 'touch'
        ? { id: evento.pointerId, x: evento.clientX, y: evento.clientY }
        : null;
  }

  function aoSoltar(evento: PointerEvent): void {
    const toque = inicio;
    inicio = null;
    if (toque === null || toque.id !== evento.pointerId) {
      return;
    }
    const deslocamento = Math.hypot(evento.clientX - toque.x, evento.clientY - toque.y);
    if (deslocamento > DESLOCAMENTO_MAXIMO_DO_TOQUE_PX) {
      return;
    }
    const alvo = evento.target;
    if (!(alvo instanceof Element) || tocouCampoDeDigitacao(alvo)) {
      return;
    }
    fecharTecladoVirtual();
  }

  function aoCancelar(): void {
    inicio = null;
  }

  document.addEventListener('pointerdown', aoEncostar, true);
  document.addEventListener('pointerup', aoSoltar, true);
  document.addEventListener('pointercancel', aoCancelar, true);
  return () => {
    document.removeEventListener('pointerdown', aoEncostar, true);
    document.removeEventListener('pointerup', aoSoltar, true);
    document.removeEventListener('pointercancel', aoCancelar, true);
  };
}

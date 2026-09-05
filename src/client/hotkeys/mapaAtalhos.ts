import { useEffect, useRef } from 'react';

/**
 * Mapa central de atalhos de teclado da tela de venda (feature 013, T014).
 *
 * **Um lugar só, de propósito** (skill de projeto `react-hotkeys-pdv`): um
 * `keydown` solto dentro de um componente não é auditável — ninguém consegue
 * responder "quais teclas o PDV escuta?" sem varrer a base, e a próxima feature
 * que registrar uma tecla vai colidir com esta em silêncio. Todo atalho global
 * novo entra por aqui.
 *
 * ### Por que sem `react-hotkeys-hook`
 *
 * O `plan.md` da 013 previa a biblioteca, mas ela **não** está nas dependências
 * do projeto e nenhum outro atalho da base a usa — os modais tratam `Escape`
 * com `keydown` nativo. Trazer uma dependência nova para registrar quatro teclas
 * custaria mais do que resolve, ainda mais num projeto 100% Docker onde toda
 * dependência entra na imagem. O que a skill de fato exige — mapa central,
 * imunidade a digitação/bipagem e teste automatizado — está garantido aqui.
 *
 * ### O invariante que este módulo protege (`FR-014`, `SC-005`)
 *
 * Os atalhos ficam ativos **durante toda a venda**, então a não colisão com
 * digitação e com a bipagem do leitor de código de barras é requisito de
 * correção, não higiene. O leitor de código de barras se comporta como um
 * teclado muito rápido digitando dentro do campo de produto: a defesa correta é
 * ignorar o evento sempre que o foco estiver num campo de entrada, e não medir
 * intervalo entre teclas (que confundiria um operador rápido com um leitor).
 */

/** O que um atalho global precisa declarar. */
export interface AtalhoDeTeclado {
  /** `event.key`, comparado sem distinção de caixa (`'F6'`, `'Escape'`). */
  readonly tecla: string;
  readonly aoAcionar: () => void;
}

const ETIQUETAS_DE_ENTRADA = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/**
 * O foco está num lugar onde o operador **digita** — campo de busca de produto,
 * de quantidade, de valor, de código de vale, ou qualquer `contenteditable`.
 *
 * Nenhuma exceção por `type`: um `input[type=number]` de quantidade recebe
 * bipagem e digitação como qualquer outro, e a lista de exceções seria mais uma
 * coisa a manter sincronizada com a tela.
 */
export function ehCampoDeEntrada(alvo: EventTarget | null): boolean {
  if (!(alvo instanceof HTMLElement)) {
    return false;
  }
  return ETIQUETAS_DE_ENTRADA.has(alvo.tagName) || alvo.isContentEditable;
}

/**
 * O foco está dentro de uma janela modal.
 *
 * Atalho de venda rápida não dispara por cima de um modal aberto: a janela do
 * vale devolução, a do PIX e as confirmações destrutivas descrevem uma decisão
 * pendente, e lançar um pagamento por baixo delas produziria uma venda que o
 * operador não consegue explicar. O marcador é o mesmo que `useFocoDeModal`
 * assume em toda a base (`role="dialog"`).
 */
function dentroDeModal(alvo: EventTarget | null): boolean {
  return alvo instanceof HTMLElement && alvo.closest('[role="dialog"]') !== null;
}

/**
 * Registra atalhos globais enquanto o componente estiver montado.
 *
 * `ativo` desliga o mapa inteiro sem desmontar o componente — é o que permite à
 * dica de atalhos existir na árvore com a lista vazia sem escutar o teclado.
 *
 * Os atalhos ficam numa `ref` atualizada a cada render, e não no array de
 * dependências: o call site monta os handlers inline (fecham sobre o estado da
 * venda), então um efeito dependente deles se reinscreveria a cada render — e a
 * janela entre remover e adicionar o ouvinte é exatamente onde uma tecla se
 * perde.
 */
export function useAtalhosDeTeclado(atalhos: readonly AtalhoDeTeclado[], ativo = true): void {
  const atalhosRef = useRef<readonly AtalhoDeTeclado[]>(atalhos);
  atalhosRef.current = atalhos;

  useEffect(() => {
    if (!ativo) {
      return;
    }

    const aoTeclar = (evento: KeyboardEvent): void => {
      // Já tratado por alguém mais específico (um modal, um campo com
      // comportamento próprio): não há segundo dono para a mesma tecla.
      if (evento.defaultPrevented) {
        return;
      }
      // Combinação com modificador é outro atalho, não este.
      if (evento.ctrlKey || evento.altKey || evento.metaKey || evento.shiftKey) {
        return;
      }
      // Tecla segurada: um acionamento por pressionada, nunca por repetição
      // automática do sistema.
      if (evento.repeat) {
        return;
      }
      if (ehCampoDeEntrada(evento.target) || dentroDeModal(evento.target)) {
        return;
      }

      const alvo = atalhosRef.current.find(
        (atalho) => atalho.tecla.toUpperCase() === evento.key.toUpperCase(),
      );
      if (alvo === undefined) {
        return;
      }

      // F6–F9 têm comportamento nativo no navegador (F6 move o foco entre
      // painéis do Chrome): sem isto o atalho lançaria o pagamento **e** tiraria
      // o foco da tela de venda.
      evento.preventDefault();
      alvo.aoAcionar();
    };

    window.addEventListener('keydown', aoTeclar);
    return () => {
      window.removeEventListener('keydown', aoTeclar);
    };
  }, [ativo]);
}

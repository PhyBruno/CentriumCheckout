import { useMemo, useRef } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';

/**
 * Mapa central de atalhos de teclado da tela de venda (feature 013, T014).
 *
 * **Um lugar só, de propósito** (skill de projeto `react-hotkeys-pdv`): um
 * `keydown` solto dentro de um componente não é auditável — ninguém consegue
 * responder "quais teclas o PDV escuta?" sem varrer a base, e a próxima feature
 * que registrar uma tecla colide com esta em silêncio. Todo atalho global novo
 * entra por aqui.
 *
 * ### Por que `react-hotkeys-hook`, e não um `keydown` próprio
 *
 * Decisão do usuário (2026-09-05), que revogou a primeira implementação desta
 * feature: o PDV vai reservar **outras** teclas de função — F1, F2, F3 — para
 * ações futuras, e a partir daí o problema deixa de ser "escutar quatro teclas"
 * e passa a ser arbitragem entre vários donos. A biblioteca já resolve o que um
 * ouvinte artesanal reimplementaria errado aos poucos: registro por escopo,
 * combinações com modificador, sequências, ativação condicional e — o mais
 * importante aqui — a lista de tags de formulário em que um atalho **não** deve
 * disparar. Ver AD-172 em `.specs/project/STATE.md`.
 *
 * ### O invariante que este módulo protege (`FR-014`, `SC-005`)
 *
 * Os atalhos ficam ativos **durante toda a venda**, então a não colisão com
 * digitação e com a bipagem do leitor de código de barras é requisito de
 * correção, não higiene. O leitor se comporta como um teclado muito rápido
 * digitando dentro do campo de produto: a defesa correta é ignorar o evento
 * enquanto o foco estiver num campo de entrada, e **não** medir intervalo entre
 * teclas, que confundiria um operador rápido com um leitor.
 *
 * A exceção é o próprio campo de código do produto, que se declara transparente
 * aos atalhos — ver `ATRIBUTO_ATALHOS_PERMITIDOS` abaixo.
 */

/** O que um atalho global precisa declarar. */
export interface AtalhoDeTeclado {
  /** Nome da tecla como o navegador a reporta (`'F6'`), sem modificadores. */
  readonly tecla: string;
  readonly aoAcionar: () => void;
}

/**
 * Marca um campo de entrada como **transparente** aos atalhos globais: com o
 * foco nele, a tecla dispara em vez de ser engolida pela digitação.
 *
 * Espalhe no elemento: `<input {...ATRIBUTO_ATALHOS_PERMITIDOS} />`.
 *
 * Existe para o campo de código do produto (decisão do usuário, 2026-09-05).
 * É onde o operador de caixa passa a venda inteira — sai dali para bipar,
 * volta, bipa de novo —, e obrigá-lo a tirar o foco antes de fechar a venda
 * transformaria um toque em três gestos. É a **única** exceção à regra de
 * `FR-014`, e ela é segura pelo mesmo motivo que a regra existe: o leitor de
 * código de barras emite dígitos e `Enter`, nunca teclas de função.
 *
 * A exceção é declarada **no campo**, e não numa lista de seletores aqui
 * dentro: quem lê `EntradaRapidaProduto` vê que aquele input abre mão do
 * bloqueio, e um campo novo não herda a exceção por acidente de seletor.
 */
export const ATRIBUTO_ATALHOS_PERMITIDOS = { 'data-atalhos-globais': 'permitidos' } as const;

/** Etiquetas cujo foco pertence a quem digita, não ao atalho. */
const ETIQUETAS_DE_ENTRADA = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/**
 * Papéis ARIA que se comportam como campo ou como item de lista aberta.
 *
 * Espelha a lista que a biblioteca usa em `enableOnFormTags` — precisa ser
 * reproduzida aqui porque este módulo desliga aquela guarda (`enableOnFormTags:
 * true`) para poder abrir a exceção acima. Sem isto, um F6 pressionado com o
 * combobox de condição **aberto** lançaria o pagamento em vez de escolher a
 * opção sob o cursor.
 */
const PAPEIS_DE_ENTRADA = new Set([
  'searchbox',
  'slider',
  'spinbutton',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'radio',
  'textbox',
]);

/** O foco está num lugar onde a tecla pertence a quem digita. */
function ehCampoQueEngoleATecla(alvo: EventTarget | null): boolean {
  if (!(alvo instanceof HTMLElement)) {
    return false;
  }

  const ehEntrada =
    ETIQUETAS_DE_ENTRADA.has(alvo.tagName) ||
    alvo.isContentEditable ||
    PAPEIS_DE_ENTRADA.has(alvo.getAttribute('role') ?? '');

  return ehEntrada && alvo.dataset['atalhosGlobais'] !== 'permitidos';
}

/**
 * O foco está dentro de uma janela modal.
 *
 * Atalho de venda rápida não dispara por cima de um modal aberto: a janela do
 * vale devolução, a do PIX e as confirmações destrutivas descrevem uma decisão
 * pendente, e lançar um pagamento por baixo delas produziria uma venda que o
 * operador não consegue explicar. O marcador é o mesmo que `useFocoDeModal`
 * assume em toda a base (`role="dialog"`).
 *
 * Não cabe em `enableOnFormTags`: o botão "Confirmar" de um diálogo não é um
 * campo de formulário, e é justamente sobre ele que o foco costuma estar.
 */
function dentroDeModal(alvo: EventTarget | null): boolean {
  return alvo instanceof HTMLElement && alvo.closest('[role="dialog"]') !== null;
}

/**
 * Eventos que nunca são atalho, qualquer que seja a tecla.
 *
 * `repeat`: tecla segurada dispara um acionamento por pressionada, nunca pela
 * repetição automática do sistema — num atalho que lança pagamento, a diferença
 * é entre um lançamento e uma enxurrada deles.
 *
 * `defaultPrevented`: alguém mais específico (um modal, um campo com
 * comportamento próprio) já tratou a tecla; não há segundo dono para ela.
 */
function eventoIgnorado(evento: KeyboardEvent): boolean {
  return (
    evento.repeat ||
    evento.defaultPrevented ||
    dentroDeModal(evento.target) ||
    ehCampoQueEngoleATecla(evento.target)
  );
}

/**
 * Registra atalhos globais enquanto o componente estiver montado.
 *
 * `ativo` desliga o mapa inteiro sem desmontar o componente — é o que permite à
 * dica de atalhos existir na árvore com a lista vazia sem escutar o teclado.
 *
 * Os atalhos ficam numa `ref` atualizada a cada render, e não nas dependências
 * do hook: o call site monta os handlers inline (fecham sobre o estado da
 * venda), então passá-los adiante reinscreveria o ouvinte a cada render — e a
 * janela entre remover e adicionar é exatamente onde uma tecla se perde. O que
 * de fato muda a inscrição é a **lista de teclas**, e ela é uma string.
 */
export function useAtalhosDeTeclado(atalhos: readonly AtalhoDeTeclado[], ativo = true): void {
  const atalhosRef = useRef<readonly AtalhoDeTeclado[]>(atalhos);
  atalhosRef.current = atalhos;

  // Primitiva, não array: uma lista nova a cada render teria identidade nova e
  // faria o hook rebindar sem nada ter mudado.
  const teclas = useMemo(
    () => atalhos.map((atalho) => atalho.tecla.toLowerCase()).join(','),
    [atalhos],
  );

  useHotkeys(
    teclas,
    (evento) => {
      const alvo = atalhosRef.current.find(
        (atalho) => atalho.tecla.toUpperCase() === evento.key.toUpperCase(),
      );
      alvo?.aoAcionar();
    },
    {
      // Sem tecla registrada, o mapa não escuta nada — e um F6 sem cenário volta
      // a ser do navegador.
      enabled: ativo && atalhos.length > 0,
      /**
       * Casa por `event.key` (a tecla **lógica**), não por `event.code` (a
       * posição física), que é o padrão da biblioteca.
       *
       * É a semântica certa para este mapa: o que as features declaram são
       * nomes de tecla — `'F6'` hoje, `'F1'`/`'F2'` quando as ações futuras
       * chegarem —, e não posições num teclado. Nas teclas de função os dois
       * coincidem em hardware real; a diferença aparece em layout alternativo,
       * onde `code` responderia pela posição e trairia quem leu o cadastro.
       *
       * Tem também um efeito prático: o `user-event` não conhece teclas de
       * função no seu mapa padrão e emite `code: 'Unknown'` para elas, então
       * sem isto o atalho seria inverificável em teste de componente — e um
       * atalho que só o E2E alcança é um atalho sem rede de proteção.
       */
      useKey: true,
      /**
       * F6–F9 têm comportamento nativo (F6 move o foco entre painéis do
       * Chrome): sem isto o atalho lançaria o pagamento **e** tiraria o foco da
       * tela de venda.
       */
      preventDefault: true,
      /**
       * A guarda de campo de entrada é **nossa**, em `ignoreEventWhen`, e não a
       * da biblioteca. A regra de `FR-014` continua idêntica — com o foco num
       * campo a tecla pertence a quem digita —, mas ela precisa admitir uma
       * exceção declarada no próprio campo (`ATRIBUTO_ATALHOS_PERMITIDOS`), e o
       * `enableOnFormTags` da biblioteca é tudo-ou-nada.
       */
      enableOnFormTags: true,
      enableOnContentEditable: true,
      ignoreEventWhen: eventoIgnorado,
    },
  );
}

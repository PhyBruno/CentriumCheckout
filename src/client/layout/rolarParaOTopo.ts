/**
 * Leva a tela de volta ao topo — chamado por `lib/notificar.ts` a cada toast do
 * layout compacto (pedido do usuário, 2026-09-15: "quando há notificação, e a
 * tela está scrollada pra baixo, o scroll não é jogado pra cima, deveria, pois é
 * a única forma de o usuário ver a notificação").
 *
 * **Por que um toast `position: fixed` ainda some da vista no celular.** O
 * `GooeyToaster` nasce no canto superior direito e é fixo — contra a *layout
 * viewport*. No Chrome/Android a *visual viewport* se desloca por dentro dela
 * assim que o teclado virtual abre ou o operador aproxima a tela com os dedos, e
 * é nesse deslocamento que o toast fica desenhado acima da faixa realmente
 * visível: o operador bipa, ouve o "não" e não vê frase nenhuma. Rolar a coluna
 * do wizard para o topo é o gesto que o traz de volta ao mesmo enquadramento do
 * toast.
 *
 * **Só o que está marcado rola.** Varrer o documento atrás de qualquer elemento
 * com `scrollTop > 0` alcançaria listas internas que se posicionam de propósito
 * — `ListaPagamentosAplicados` rola para o **fim** ao aplicar uma forma —, e um
 * aviso qualquer desfaria esse posicionamento. Quem quer ser rolado se declara
 * com `data-rolagem-notificacao`.
 *
 * Fora de `lib/`, em `layout/`, porque a pergunta que responde é de layout ("o
 * que rola nesta tela"), não de notificação: `notificar` continua sabendo apenas
 * que existe uma função para chamar (Dependency Inversion, Constitution II).
 */

/**
 * Marca o container rolável que um toast deve trazer de volta ao topo.
 *
 * Constante, e não a string solta nos dois lados: o atributo é um contrato entre
 * este módulo e quem o veste, e uma divergência de grafia falharia em silêncio —
 * a varredura simplesmente não acharia nada, sem erro nenhum.
 */
export const ATRIBUTO_ROLAGEM_DE_NOTIFICACAO = 'data-rolagem-notificacao';

/**
 * Volta ao topo **deslizando**, não saltando (correção do usuário, 2026-09-15:
 * *"a notificação não tá suave, parece meio lagada"*).
 *
 * Um `scrollTop = 0` cru move a tela inteira num quadro só, no mesmo instante em
 * que o toast está entrando: são dois movimentos brutos somados, e o conjunto se
 * lê como engasgo. `scrollTo({ behavior: 'smooth' })` entrega a animação ao
 * navegador, que a roda fora do trabalho de layout do React.
 *
 * O `scrollTop` continua como desfecho para quem não tem `scrollTo` — é o caso
 * do jsdom, onde ele é a única via que os testes conseguem observar — e para
 * quem pediu menos movimento no sistema, que não deve receber uma animação a
 * mais por causa de um aviso.
 */
function levarAoTopo(elemento: Element): void {
  // `?.` porque nem todo ambiente de teste instala `matchMedia`, e um aviso não
  // pode virar exceção por causa da preferência de movimento do sistema.
  const preferePoucoMovimento =
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  if (!preferePoucoMovimento && typeof elemento.scrollTo === 'function') {
    elemento.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  elemento.scrollTop = 0;
}

export function rolarParaOTopo(): void {
  for (const elemento of document.querySelectorAll<HTMLElement>(
    `[${ATRIBUTO_ROLAGEM_DE_NOTIFICACAO}]`,
  )) {
    levarAoTopo(elemento);
  }

  // A página em si, para o caso de o estouro ter ido parar no documento — e por
  // `scrollingElement`, não `window.scrollTo`: é a mesma rolagem, sem a chamada
  // que o jsdom não implementa e que encheria a saída dos testes de "Not
  // implemented" a cada toast emitido.
  //
  // O `??` não é zelo excessivo: o tipo diz `Element | null`, mas o jsdom
  // devolve `undefined`, e sem o fallback todo toast do compacto derrubava o
  // teste com "Cannot set properties of undefined" — uma falha que só apareceria
  // na suíte, nunca no navegador.
  levarAoTopo(document.scrollingElement ?? document.documentElement);
}

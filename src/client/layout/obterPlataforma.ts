import { classificarLayout, type ModoLayout } from '../domain/layout/classificarLayout';

/**
 * O layout atual, lido **fora de React** (T004, AD-116).
 *
 * Não é um hook: existe para pontos de composição que não são componentes e não
 * podem obedecer às regras de hooks — o caso concreto é `capacidades().plataforma`
 * do `pagamentoSlice` (`specs/008-pagamento-geral/contracts/pagamento-domain-api.md`
 * §2), uma dependência injetada chamada como função plana. O contrato original
 * desta feature só expunha `useIsMobile()`, inutilizável nesse ponto.
 *
 * **Não duplica o limiar**: reaproveita `classificarLayout`, trocando só a fonte
 * da largura (`window.innerWidth` em vez de `matchMedia`) — equivalentes para
 * larguras inteiras de viewport, que é o caso de todo aparelho real.
 *
 * Sem estado e sem reatividade, de propósito: quem precisa reagir à mudança de
 * viewport usa `useIsMobile`; quem chama isto quer o veredito do instante.
 */
export function obterPlataforma(): ModoLayout {
  return classificarLayout(window.innerWidth);
}

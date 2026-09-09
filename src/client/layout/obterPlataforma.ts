import { classificarLayout, type ModoLayout } from '../domain/layout/classificarLayout';

/**
 * `any-pointer: fine` — existe algum ponteiro preciso (mouse, trackpad, caneta)?
 *
 * O `?.` não é defensividade decorativa: o jsdom não implementa `matchMedia`, e
 * vários specs que só querem emitir um toast chamam `obterPlataforma`
 * indiretamente. **O padrão é `true`** — a ausência de informação não pode
 * rebaixar um desktop legítimo para o wizard; quem não tem ponteiro preciso de
 * verdade é sempre um aparelho que sabe responder à consulta.
 */
function temPonteiroFino(): boolean {
  return window.matchMedia?.('(any-pointer: fine)').matches ?? true;
}

/**
 * O layout atual, lido **fora de React** (T004, AD-116).
 *
 * Não é um hook: existe para pontos de composição que não são componentes e não
 * podem obedecer às regras de hooks — os casos concretos são
 * `capacidades().plataforma` do `pagamentoSlice`
 * (`specs/008-pagamento-geral/contracts/pagamento-domain-api.md` §2), uma
 * dependência injetada chamada como função plana, e `lib/notificar.ts`, chamado
 * de stores e handlers. O contrato original desta feature só expunha
 * `useIsMobile()`, inutilizável nesses pontos.
 *
 * **Não duplica o critério**: reaproveita `classificarLayout`, trocando só a
 * fonte dos dois insumos (`window.innerWidth` e `matchMedia` em vez da consulta
 * composta) — equivalentes para larguras inteiras de viewport, que é o caso de
 * todo aparelho real.
 *
 * Sem estado e sem reatividade, de propósito: quem precisa reagir à mudança de
 * viewport usa `useIsMobile`; quem chama isto quer o veredito do instante.
 */
export function obterPlataforma(): ModoLayout {
  return classificarLayout({
    larguraViewportPx: window.innerWidth,
    temPonteiroFino: temPonteiroFino(),
  });
}

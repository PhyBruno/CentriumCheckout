import type { PlataformaVendaRapida } from '../domain/vendaRapida/tipos';
import { CONSULTA_LAYOUT_COMPACTO, useIsMobile } from './useIsMobile';

/**
 * O breakpoint deixou de morar aqui na feature 007: quem o define é
 * `domain/layout/classificarLayout.ts` (limiar puro) e quem o observa é
 * `useIsMobile` (`useIsMobile.ts`). Este módulo virou o **vocabulário** dos dois
 * consumidores anteriores, não uma segunda implementação.
 *
 * Reexportado porque os testes e o E2E da 013 já apontam para este nome; a
 * string em si é derivada do limiar, num lugar só.
 */
export { CONSULTA_LAYOUT_COMPACTO };

/**
 * O layout atual é o compacto? — alias histórico de `useIsMobile`.
 *
 * Mantido para não reescrever os call sites da 003/013 num mesmo commit em que
 * a árvore de layout inteira muda; `useIsMobile` é o nome do contrato
 * (`contracts/layout-domain-api.md` §2) e o que as tarefas novas devem usar.
 */
export function useLayoutCompacto(): boolean {
  return useIsMobile();
}

/**
 * A mesma leitura de layout, no vocabulário da feature 013 — a capacidade
 * `plataforma` que `projetarAtalhos` recebe como parâmetro (`FR-020`/D11,
 * mesmo padrão de capacidade injetada estreado por AD-074).
 *
 * Existe para que o domínio puro nunca precise ler `window`: quem consulta a
 * mídia é `useIsMobile`, na borda de React, e o domínio só recebe o veredito.
 */
export function usePlataforma(): PlataformaVendaRapida {
  return useIsMobile() ? 'mobile' : 'desktop';
}

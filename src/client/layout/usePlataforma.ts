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

/*
 * `usePlataforma` foi removido pela feature 016. Ele traduzia o layout para o
 * vocabulário da 013 (`'desktop' | 'mobile'`) só para `projetarAtalhos`, que
 * deixou de receber plataforma (`FR-011` da 016): sem consumidor, mantê-lo
 * seria deixar à mão uma porta para a venda rápida voltar a depender do
 * tamanho da tela.
 */

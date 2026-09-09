import { act, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement, ReactNode } from 'react';
import { CONSULTA_LAYOUT_COMPACTO } from '../../src/client/layout/useIsMobile';

/**
 * Duplo de `window.matchMedia` **controlável** para os testes da feature 007.
 *
 * jsdom não implementa `matchMedia`, e os stubs que já existiam espalhados pelos
 * specs devolvem `matches: false` fixo — servem para o componente montar, não
 * para alternar o layout no meio do teste, que é o que `SC-003` exige verificar
 * (o estado da venda sobrevive à travessia do breakpoint).
 *
 * Só a consulta de layout é controlada; qualquer outra (tema escuro, por
 * exemplo) devolve `false`, como antes.
 */
type OuvinteDeMidia = (evento: MediaQueryListEvent) => void;

const ouvintesDeLayout = new Set<OuvinteDeMidia>();
let layoutCompacto = false;

function listaDeMidia(query: string): MediaQueryList {
  const ehConsultaDeLayout = query === CONSULTA_LAYOUT_COMPACTO;
  const nada = (): void => {
    /* nada a fazer */
  };

  return {
    get matches(): boolean {
      return ehConsultaDeLayout && layoutCompacto;
    },
    media: query,
    onchange: null,
    addListener: nada,
    removeListener: nada,
    addEventListener: (_tipo: string, ouvinte: EventListenerOrEventListenerObject): void => {
      if (ehConsultaDeLayout && typeof ouvinte === 'function') {
        ouvintesDeLayout.add(ouvinte as OuvinteDeMidia);
      }
    },
    removeEventListener: (_tipo: string, ouvinte: EventListenerOrEventListenerObject): void => {
      if (typeof ouvinte === 'function') {
        ouvintesDeLayout.delete(ouvinte as OuvinteDeMidia);
      }
    },
    dispatchEvent: () => false,
  } as unknown as MediaQueryList;
}

/**
 * Instala o duplo. Atribuição direta no `window`: sob o vitest o `window` do
 * jsdom não é o mesmo objeto que `globalThis`, então `vi.stubGlobal` não o
 * alcança.
 */
export function instalarMatchMediaDeLayout(): void {
  window.matchMedia = listaDeMidia;
}

/** Estado inicial do layout, **antes** de montar a árvore (I1 do wizard). */
export function definirLayoutInicial(modo: 'mobile' | 'desktop'): void {
  layoutCompacto = modo === 'mobile';
  ouvintesDeLayout.clear();
}

/**
 * Cruza o breakpoint com a árvore já montada — o gesto de `SC-003`.
 *
 * Dispara o evento `change` da consulta, que é o que o navegador faz: `useIsMobile`
 * escuta `matchMedia`, nunca `resize`.
 */
export function cruzarBreakpointPara(modo: 'mobile' | 'desktop'): void {
  layoutCompacto = modo === 'mobile';
  const evento = {
    matches: layoutCompacto,
    media: CONSULTA_LAYOUT_COMPACTO,
  } as MediaQueryListEvent;

  act(() => {
    ouvintesDeLayout.forEach((ouvinte) => {
      ouvinte(evento);
    });
  });
}

/**
 * Monta uma árvore da tela de venda com o provedor de queries — o mínimo que
 * `AppShell` e as etapas do wizard precisam para montar como montam em produção.
 *
 * `retry: false` e `gcTime: 0`: nenhum teste daqui depende de rede, e uma query
 * pendurada entre casos vazaria estado de um teste para o seguinte.
 */
export function renderizarComProvedores(arvore: ReactNode): ReturnType<typeof render> {
  const cliente = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  return render(
    (<QueryClientProvider client={cliente}>{arvore}</QueryClientProvider>) as ReactElement,
  );
}

import { useEffect, useState } from 'react';
import type { PlataformaVendaRapida } from '../domain/vendaRapida/tipos';

/**
 * Breakpoint canônico de MOB-01 (`specs/007-layout-responsivo-mobile/plan.md`):
 * `768px`, expresso como `max-width: 767.98px` para não deixar buraco em telas
 * de largura fracionária.
 *
 * Provisório: a feature 007 substitui isto por um único `AppShell` que decide
 * entre `DesktopLayout` e `MobileWizard`. Até lá o valor mora **aqui**, e não
 * dentro de `App.tsx`, porque passou a ter um segundo consumidor: a venda
 * rápida (013) precisa da mesma resposta para aplicar `FR-020`, e duas cópias
 * do breakpoint criariam uma faixa de larguras em que as duas features
 * discordariam sobre qual árvore está montada.
 */
export const CONSULTA_LAYOUT_COMPACTO = '(max-width: 767.98px)';

export function useLayoutCompacto(): boolean {
  const [compacto, setCompacto] = useState(
    () => window.matchMedia(CONSULTA_LAYOUT_COMPACTO).matches,
  );

  useEffect(() => {
    const consulta = window.matchMedia(CONSULTA_LAYOUT_COMPACTO);
    const aoMudar = (evento: MediaQueryListEvent): void => {
      setCompacto(evento.matches);
    };

    // Reavalia na montagem: a largura pode ter mudado entre o estado inicial e
    // o efeito (o próprio E2E redimensiona a janela antes de navegar).
    setCompacto(consulta.matches);
    consulta.addEventListener('change', aoMudar);
    return () => {
      consulta.removeEventListener('change', aoMudar);
    };
  }, []);

  return compacto;
}

/**
 * A mesma leitura de layout, no vocabulário da feature 013 — a capacidade
 * `plataforma` que `projetarAtalhos` recebe como parâmetro (`FR-020`/D11,
 * mesmo padrão de capacidade injetada estreado por AD-074).
 *
 * Existe para que o domínio puro nunca precise ler `window`: quem consulta a
 * mídia é este hook, na borda de React, e o domínio só recebe o veredito.
 */
export function usePlataforma(): PlataformaVendaRapida {
  return useLayoutCompacto() ? 'mobile' : 'desktop';
}

import { useEffect, useState } from 'react';
import { LARGURA_MINIMA_DESKTOP_PX } from '../domain/layout/classificarLayout';

/**
 * Consulta de mídia equivalente a `classificarLayout` (T006, `research.md` D1,
 * AD-198).
 *
 * Derivada do limiar, e não escrita à mão: `1365.98px` é `1366 - 0.02`, a folga
 * que fecha o buraco em telas de largura fracionária (mesmo padrão que
 * frameworks CSS usam para "abaixo de N"). Escrever o número solto aqui criaria
 * a segunda cópia do breakpoint que `classificarLayout` existe para evitar.
 *
 * **É a negação da condição de desktop, não uma condição de mobile própria.**
 * O desktop exige as duas coisas — largura suficiente *e* ponteiro preciso —,
 * então o compacto é tudo que falha em qualquer uma delas. Escrever
 * `(max-width: …) or (any-pointer: coarse)` daria quase o mesmo resultado e
 * erraria no aparelho sem ponteiro nenhum (`any-pointer: none`), que não é
 * `coarse` e mesmo assim não tem como operar a tela única.
 */
export const CONSULTA_LAYOUT_COMPACTO = `not all and (min-width: ${LARGURA_MINIMA_DESKTOP_PX - 0.02}px) and (any-pointer: fine)`;

/**
 * O layout atual é o compacto (mobile)? — a **única** casca reativa entre
 * `classificarLayout` e o navegador.
 *
 * `matchMedia`, não um ouvinte de `resize`: o navegador já debounça no nível da
 * consulta (dispara só no cruzamento do limiar, nunca a cada pixel), é nativo —
 * sem dependência nova para embrulhar algo que o browser resolve — e é mockável
 * direto no teste, sem sintetizar eventos de redimensionamento. É também o
 * único jeito de reagir à chegada de um mouse num tablet, que nenhum evento de
 * `resize` anunciaria.
 *
 * **Quem chama isto**: `AppShell` (`research.md` D3), o único ponto do projeto
 * que decide *quais* componentes existem na tela, e
 * `sincronizarLayoutNoDocumento`, que espelha o mesmo veredito no `<html>` para
 * o CSS. Um componente de domínio pode consultá-lo para variar sua própria
 * apresentação interna (densidade de grid, por exemplo), mas nunca para decidir
 * composição de tela — essa decisão é exclusiva do `AppShell`, e é o que mantém
 * a checagem de breakpoint fora de dezenas de componentes (Open/Closed).
 */
export function useIsMobile(): boolean {
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

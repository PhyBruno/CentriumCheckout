import type { ReactElement } from 'react';
import { LoadingSkeleton } from '../features/session-bootstrap/LoadingSkeleton';
import { CarregamentoMobile } from './mobile/CarregamentoMobile';
import { useIsMobile } from './useIsMobile';

/**
 * Qual tela de carregamento do bootstrap montar — a mesma bifurcação do
 * `AppShell`, um passo antes dele.
 *
 * Mora em `layout/` pelo mesmo motivo do `AppShell` (`research.md` D3,
 * `semDuplicacaoRegra.spec.ts`): só esta pasta consulta o layout. O `App` não
 * pode perguntar, e o `LoadingSkeleton` também não — então quem pergunta é quem
 * já tem a informação, e cada tela de carregamento continua sem saber que a
 * outra existe.
 */
export function TelaDeCarregamento(): ReactElement {
  return useIsMobile() ? <CarregamentoMobile /> : <LoadingSkeleton />;
}

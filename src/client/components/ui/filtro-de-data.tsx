import { CalendarDays } from 'reicon-react';
import type { ReactElement } from 'react';
import { CampoData, type CampoDataProps } from '@/components/ui/campo-data';

export interface FiltroDeDataProps
  extends Pick<CampoDataProps, 'minimo' | 'maximo' | 'motivoForaDoLimite'> {
  /** Texto visível dentro da pílula ("Data inicial", "Data final"). */
  readonly etiqueta: string;
  /** Nome acessível do campo, que a etiqueta curta sozinha não daria. */
  readonly rotulo: string;
  readonly testId: string;
  /** `YYYY-MM-DD`. */
  readonly valor: string;
  readonly onChange: (iso: string) => void;
}

/**
 * Uma pílula de data da faixa de filtros das janelas de importação (DAV e
 * NFCe, AD-237) — a forma do nó "Filtro data emissão DAV" do Pencil: altura
 * 36, raio total, superfície secundária, ícone `calendar-days`.
 *
 * Saiu de `ModalImportacaoDav.tsx` quando a janela de NFCe ganhou o mesmo par
 * de pílulas: o Pencil só desenha o filtro de data na janela de DAV, e as duas
 * janelas são um par (AD-222).
 */
export function FiltroDeData({
  etiqueta,
  rotulo,
  testId,
  valor,
  onChange,
  ...limites
}: FiltroDeDataProps): ReactElement {
  return (
    <div className="flex h-9 shrink-0 items-center gap-xs rounded-full bg-secondary px-sm text-xs font-semibold text-foreground">
      <CalendarDays className="size-[15px] shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="shrink-0">{etiqueta}</span>
      <CampoData
        rotulo={rotulo}
        testId={testId}
        valor={valor}
        onChange={onChange}
        {...limites}
      />
    </div>
  );
}

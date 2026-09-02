import type { ReactElement, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface PainelMensagemProps {
  readonly titulo: string;
  readonly texto: string;
  readonly variante?: 'informacao' | 'alerta';
  readonly acoes?: ReactNode;
}

/**
 * Painel central de mensagem em tela cheia — componente puramente
 * apresentacional, sem nenhuma regra de sessão. Quem decide o que mostrar são
 * `ErrorRetry` (AUTH-07) e `SessionExpiredWarning` (AUTH-06).
 */
export function PainelMensagem({
  titulo,
  texto,
  variante = 'informacao',
  acoes,
}: PainelMensagemProps): ReactElement {
  return (
    <div className="flex min-h-screen items-center justify-center p-lg bg-muted">
      <section
        role="alert"
        className="flex w-full max-w-[440px] flex-col gap-sm rounded-xl border border-border bg-background p-xl text-center"
      >
        <div
          className={cn(
            'size-10 self-center rounded-full bg-primary',
            variante === 'alerta' && 'bg-[var(--cc-color-accent-yellow)]',
          )}
        />
        <h1 className="m-0 text-xl font-semibold text-foreground">{titulo}</h1>
        <p className="m-0 text-md text-muted-foreground">{texto}</p>
        {acoes !== undefined && <div className="mt-xs flex justify-center gap-sm">{acoes}</div>}
      </section>
    </div>
  );
}

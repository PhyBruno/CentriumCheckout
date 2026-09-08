import type { ReactElement, ReactNode } from 'react';
import { ShoppingCart } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PainelMensagemProps {
  readonly titulo: string;
  /** Detalhe abaixo do título. Omitido quando o título já diz tudo. */
  readonly texto?: string;
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
        {/* Mesmo símbolo da marca da barra superior (nó `ZyzZc` do Pencil):
            círculo `$cb-blue` com o carrinho do Lucide. Antes era um círculo
            vazio, que na tela de erro parecia um placeholder por carregar. */}
        <div
          className={cn(
            'flex size-10 items-center justify-center self-center rounded-full bg-primary',
            variante === 'alerta' && 'bg-[var(--cc-color-accent-yellow)]',
          )}
        >
          <ShoppingCart
            className={cn(
              'size-5 text-primary-foreground',
              variante === 'alerta' && 'text-foreground',
            )}
            aria-hidden
          />
        </div>
        <h1 className="m-0 text-xl font-semibold text-foreground">{titulo}</h1>
        {texto !== undefined && <p className="m-0 text-md text-muted-foreground">{texto}</p>}
        {acoes !== undefined && <div className="mt-xs flex justify-center gap-sm">{acoes}</div>}
      </section>
    </div>
  );
}

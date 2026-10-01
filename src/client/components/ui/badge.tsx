import type { ReactElement } from 'react';
import { cn } from '@/lib/utils';

/**
 * Badge do Pencil (componente reutilizável "Badge", nó `hKvqW`): pílula com
 * ponto de 7px na cor da família, rótulo Inter 12/600 na cor `-ink` e fundo
 * `-soft`, folga 5/12 e vão de 6.
 *
 * O tom é a família de cor, não o significado: quem usa decide o que cada tom
 * quer dizer (a janela de DAV mapeia tipo de documento → tom, AD-258). Assim o
 * componente não muda quando um uso novo aparecer.
 */
export type TomBadge = 'info' | 'aviso' | 'sucesso' | 'neutro';

const CLASSES_DO_TOM: Readonly<Record<TomBadge, { fundo: string; texto: string; ponto: string }>> =
  {
    info: {
      fundo: 'bg-[var(--cc-color-info-soft)]',
      texto: 'text-[var(--cc-color-info-ink)]',
      ponto: 'bg-[var(--cc-color-primary)]',
    },
    aviso: {
      fundo: 'bg-[var(--cc-color-warning-soft)]',
      texto: 'text-[var(--cc-color-warning-ink)]',
      ponto: 'bg-[var(--cc-color-accent-yellow)]',
    },
    sucesso: {
      fundo: 'bg-[var(--cc-color-up-soft)]',
      texto: 'text-[var(--cc-color-up-ink)]',
      ponto: 'bg-[var(--cc-color-up)]',
    },
    neutro: {
      fundo: 'bg-secondary',
      texto: 'text-[var(--cc-color-body)]',
      ponto: 'bg-[var(--cc-color-muted)]',
    },
  };

export interface BadgeProps {
  readonly tom: TomBadge;
  readonly children: string;
  readonly className?: string;
  readonly testId?: string;
}

export function Badge({ tom, children, className, testId }: BadgeProps): ReactElement {
  const classes = CLASSES_DO_TOM[tom];
  return (
    <span
      data-testid={testId}
      data-tom={tom}
      className={cn(
        'inline-flex shrink-0 items-center gap-[6px] rounded-full px-sm py-[3px] text-sm font-semibold whitespace-nowrap',
        classes.fundo,
        classes.texto,
        className,
      )}
    >
      <span className={cn('size-[7px] shrink-0 rounded-full', classes.ponto)} aria-hidden="true" />
      {children}
    </span>
  );
}

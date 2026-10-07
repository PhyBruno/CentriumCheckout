import type { ReactElement, ReactNode, RefObject } from 'react';
import { cn } from '@/lib/utils';

/**
 * A moldura das janelas do TEF — cabeçalho `H4DCf`, corpo e rodapé `Ttsy4` do
 * modal `uHAyW` (`design/CentriumCheckout.pen`, lido pelo MCP em 2026-10-02) —
 * e as peças do corpo que as duas janelas repetem: badge (`hEB6G`) e bloco de
 * valor (`SJmhL`). O cartão "Detalhes da transação" (`CDhv3`/`vjHCo`) saiu em
 * 2026-10-07 (AD-269).
 *
 * Existe porque a janela de **estorno** não tem nó no Pencil (item 66 de
 * `PENDENCIES.md`) e o plano a manda reusar a moldura do modal TEF
 * (`plan.md` § Referência visual). Copiar o JSX nas duas janelas faria a
 * primeira correção visual valer só para uma delas.
 *
 * Só apresentação: nenhuma regra, nenhum estado. Quem decide o que aparece é a
 * janela que a usa.
 */

export type TomTef = 'info' | 'sucesso' | 'alerta';

const FUNDO_DO_DISCO: Record<TomTef, string> = {
  info: 'bg-[var(--cc-color-info-soft)]',
  sucesso: 'bg-[var(--cc-color-up-soft)]',
  alerta: 'bg-[var(--cc-color-warning-soft)]',
};

const TEXTO_DO_SUBTITULO: Record<TomTef, string> = {
  info: 'text-muted-foreground',
  sucesso: 'text-[var(--cc-color-up-ink)]',
  alerta: 'text-[var(--cc-color-warning-ink)]',
};

interface MolduraJanelaTefProps {
  readonly testId: string;
  readonly titulo: string;
  readonly subtitulo: string;
  readonly tom: TomTef;
  /** O ícone de 20px do disco de 42px do cabeçalho. */
  readonly icone: ReactNode;
  readonly janelaRef: RefObject<HTMLDivElement | null>;
  readonly botaoFechar: ReactNode;
  readonly rodape: ReactNode;
  /** Diálogo de confirmação que abre **por cima** da janela (`z-[60]`). */
  readonly sobreposicao?: ReactNode;
  readonly children: ReactNode;
}

/**
 * As medidas do `.pen` (78px de cabeçalho, 60 de rodapé, 32/24 de folga) são de
 * um cartão de 480px no balcão. No celular elas encolhem, como no `ModalPix`
 * (AD-233), e `md:` — que desde AD-198 é a árvore desktop, não a largura —
 * devolve os valores exatos do desenho.
 */
export function MolduraJanelaTef({
  testId,
  titulo,
  subtitulo,
  tom,
  icone,
  janelaRef,
  botaoFechar,
  rodape,
  sobreposicao,
  children,
}: MolduraJanelaTefProps): ReactElement {
  return (
    <div
      className="cc-backdrop-entra fixed inset-0 z-50 flex items-start justify-center bg-[color-mix(in_srgb,var(--cc-color-ink)_40%,transparent)] px-base pt-3 md:px-lg md:pt-9"
      data-testid={testId}
    >
      <div
        ref={janelaRef}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="cc-modal-entra flex max-h-full w-full max-w-[480px] flex-col overflow-hidden rounded-3xl border border-border bg-background shadow-lg"
      >
        <header className="flex h-16 shrink-0 items-center gap-sm border-b border-border px-base md:h-[78px] md:px-lg">
          <span
            className={cn(
              'flex size-[42px] shrink-0 items-center justify-center rounded-full',
              FUNDO_DO_DISCO[tom],
            )}
          >
            {icone}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
            <h2 className="text-xl leading-[1.2] font-semibold text-foreground">{titulo}</h2>
            <p
              className={cn('text-base leading-[1.2] font-medium', TEXTO_DO_SUBTITULO[tom])}
              data-testid="tef-subtitulo"
            >
              {subtitulo}
            </p>
          </div>
          {botaoFechar}
        </header>

        <div className="flex flex-col items-center gap-3 overflow-y-auto px-base py-4 md:gap-lg md:px-lg md:py-xl">
          {children}
        </div>

        <footer className="flex h-14 shrink-0 items-center justify-center gap-[10px] border-t border-border px-base md:h-[60px] md:px-lg">
          {rodape}
        </footer>
      </div>

      {sobreposicao}
    </div>
  );
}

const BADGE: Record<TomTef, { fundo: string; ponto: string; texto: string }> = {
  info: {
    fundo: 'bg-[var(--cc-color-info-soft)]',
    ponto: 'bg-primary',
    texto: 'text-[var(--cc-color-info-ink)]',
  },
  sucesso: {
    fundo: 'bg-[var(--cc-color-up-soft)]',
    ponto: 'bg-[var(--cc-color-up)]',
    texto: 'text-[var(--cc-color-up-ink)]',
  },
  alerta: {
    fundo: 'bg-[var(--cc-color-warning-soft)]',
    ponto: 'bg-[var(--cc-color-accent-yellow)]',
    texto: 'text-[var(--cc-color-warning-ink)]',
  },
};

/** Instância do componente `Badge` (`hKvqW`): ponto de 7px e texto 12/600. */
export function BadgeTef({
  tom,
  testId,
  children,
}: {
  readonly tom: TomTef;
  readonly testId: string;
  readonly children: ReactNode;
}): ReactElement {
  const cores = BADGE[tom];
  return (
    <span
      className={cn('flex items-center gap-[6px] rounded-full px-sm py-[5px]', cores.fundo)}
      data-testid={testId}
    >
      <span className={cn('size-[7px] shrink-0 rounded-full', cores.ponto)} aria-hidden="true" />
      <span className={cn('text-sm font-semibold whitespace-nowrap', cores.texto)}>{children}</span>
    </span>
  );
}

/** Bloco escuro `SJmhL`: rótulo 13/400 e valor em Geist Mono 32/600. */
export function BlocoValorTef({
  rotulo,
  valor,
}: {
  readonly rotulo: string;
  readonly valor: string;
}): ReactElement {
  return (
    <div className="flex w-full flex-col items-center gap-[6px] rounded-[20px] bg-[var(--cc-color-surface-dark)] p-3 md:p-base">
      <span className="text-base text-[var(--cc-color-on-dark-muted)]">{rotulo}</span>
      <span
        className="font-mono text-2xl leading-[1.05] font-semibold tabular-nums text-[var(--cc-color-on-primary)]"
        data-testid="tef-valor"
      >
        {valor}
      </span>
    </div>
  );
}

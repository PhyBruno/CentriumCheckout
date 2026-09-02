import type { ReactElement } from 'react';
import { Skeleton, configureBoneyard } from 'boneyard-js/react';
import { cn } from '@/lib/utils';

// Cor e ângulo do shimmer são configuração global do Boneyard, não props do
// `<Skeleton>`. Os valores são os do frame `BIu92` do Pencil, lidos dos tokens.
configureBoneyard({
  animate: 'shimmer',
  color: 'var(--cc-skeleton-base)',
  shimmerColor: 'var(--cc-skeleton-highlight)',
  shimmerAngle: -99.778,
});

const SHIMMER_PILL = 'cc-shimmer motion-reduce:animate-none motion-reduce:bg-none motion-reduce:bg-[var(--cc-skeleton-base)]';

/**
 * Tela de carregamento bloqueante do bootstrap (T025, AUTH-05 / FR-004).
 *
 * O shimmer é gerado pelo Boneyard em runtime, a partir da estrutura de layout
 * real desta tela — não há um desenho separado do skeleton. A estrutura replica
 * o frame "PDV Online Web - Skeleton Carregamento" (`data-pencil-id="BIu92"`)
 * do design aprovado no Pencil.
 *
 * A barra superior fica fora do `<Skeleton>` de propósito: no design ela já
 * aparece com marca e identidade do PDV visíveis, e só os indicadores de status
 * entram em shimmer.
 */
export function LoadingSkeleton(): ReactElement {
  return (
    <div
      className="flex min-h-screen flex-col bg-muted"
      data-testid="skeleton-carregamento"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Carregando a configuração do ponto de venda…</span>

      <header className="flex h-18 shrink-0 items-center justify-between border-b border-border bg-background px-7">
        <div className="flex flex-row items-center gap-3.5">
          <div className="size-10 rounded-full bg-primary" />
          <div className="flex flex-col gap-xxs">
            <strong className="text-md font-semibold text-foreground">Centrium Checkout</strong>
            <span className="text-sm text-muted-foreground">Preparando o ponto de venda…</span>
          </div>
        </div>

        <div className="flex flex-row items-center gap-sm">
          <div className={cn('h-8.5 rounded-full', SHIMMER_PILL)} style={{ width: 92 }} />
          <div className={cn('h-8.5 rounded-full', SHIMMER_PILL)} style={{ width: 110 }} />
          <div className="size-10 rounded-full bg-secondary" />
          <div className="size-10 rounded-full bg-secondary" />
        </div>
      </header>

      <Skeleton name="pdv-venda" loading fallback={<EstruturaTelaVenda aria-hidden />}>
        <EstruturaTelaVenda />
      </Skeleton>
    </div>
  );
}

/**
 * Estrutura de layout da tela de venda usada como fonte do snapshot do
 * Boneyard. Quando as telas de venda reais existirem (features 003+), elas
 * passam a ser os `children` do `<Skeleton>` e esta estrutura sai.
 */
function EstruturaTelaVenda(props: { 'aria-hidden'?: boolean }): ReactElement {
  return (
    <div className="flex flex-1 flex-row gap-md pt-md px-lg pb-lg" aria-hidden={props['aria-hidden']}>
      <div className="flex flex-1 flex-col gap-base">
        <section className="h-38 rounded-xl border border-border bg-background p-base">
          <div className="flex flex-col gap-sm">
            <div className="h-4.5 rounded-sm bg-secondary" style={{ width: '30%' }} />
            <div className="h-4.5 rounded-sm bg-secondary" style={{ width: '70%' }} />
            <div className="h-4.5 rounded-sm bg-secondary" style={{ width: '55%' }} />
          </div>
        </section>

        <section className="h-30.5 rounded-xl border border-border bg-background p-base">
          <div className="flex flex-col gap-sm">
            <div className="h-4.5 rounded-sm bg-secondary" style={{ width: '45%' }} />
            <div className="h-4.5 rounded-sm bg-secondary" style={{ width: '85%' }} />
          </div>
        </section>

        <section className="h-103.5 overflow-hidden rounded-xl border border-border bg-background p-base">
          <div className="flex flex-col gap-sm">
            {Array.from({ length: 7 }, (_, indice) => (
              <div
                key={indice}
                className="h-4.5 rounded-sm bg-secondary"
                style={{ width: `${95 - indice * 6}%` }}
              />
            ))}
          </div>
        </section>

        <div className="flex h-11 flex-row items-center gap-2.5">
          {Array.from({ length: 5 }, (_, indice) => (
            <div key={indice} className="h-8 w-24 rounded-full bg-secondary" />
          ))}
        </div>
      </div>

      <aside className="flex w-98 shrink-0 flex-col gap-md rounded-xl border border-border bg-background p-base">
        {[
          'Condição de pagamento',
          'Desconto e acréscimo',
          'Forma de pagamento',
          'Valor recebido',
        ].map((rotulo) => (
          <div className="flex flex-col gap-xs" key={rotulo}>
            <span className="text-sm text-muted-foreground">{rotulo}</span>
            <div className="h-10 rounded-lg bg-secondary" />
          </div>
        ))}

        <div className="flex flex-col gap-xs rounded-[20px] bg-[var(--cc-color-surface-dark)] p-3.5 text-[var(--cc-color-on-dark)]">
          <span className="text-sm text-[var(--cc-color-on-dark-soft)]">Total da venda</span>
          <strong className="text-2xl font-normal">R$ 0,00</strong>
        </div>

        <div className="h-12 rounded-full bg-secondary" />
      </aside>
    </div>
  );
}

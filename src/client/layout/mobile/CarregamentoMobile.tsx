import type { ReactElement } from 'react';
import { CartShopping } from 'reicon-react';
import { cn } from '@/lib/utils';
import { NOME_DO_PRODUTO } from '../../domain/sessao/identidadePdv';
import {
  MolduraDeCarregamento,
  SHIMMER_PILL,
} from '../../features/session-bootstrap/LoadingSkeleton';

/**
 * Carregamento do bootstrap no layout compacto — o esqueleto do `MobileWizard`.
 *
 * O Pencil não tem um frame de carregamento compacto, então a estrutura espelha
 * os nós do wizard já traduzidos em `MobileWizard.tsx` (`IQloN`, cabeçalho
 * `fA5ib`): mesma moldura do `AppShell` (`h-screen`, `$surface-soft`) e mesmas
 * medidas do cabeçalho, do indicador de etapa, do cartão escuro do total e da
 * navegação. Quando o bootstrap termina, o wizard ocupa exatamente o lugar do
 * esqueleto e a tela não pula.
 *
 * Existe porque o celular recebia a tela de carregamento do desktop (achado em
 * 2026-09-15): a página se alargava para 956px num aparelho de 412px, o
 * navegador reduzia o zoom para caber e toda recarga — inclusive a das telas de
 * falha de acesso e de bootstrap, que passam por aqui — mostrava uma miniatura
 * da tela única antes do wizard.
 *
 * Sem o `<Skeleton>` do Boneyard: os bones capturados de `pdv-venda` são a
 * geometria do desktop. O shimmer vem da mesma `cc-shimmer` das pílulas da
 * barra superior.
 */
export function CarregamentoMobile(): ReactElement {
  return (
    <MolduraDeCarregamento className="h-screen overflow-hidden bg-[var(--cc-color-surface-soft)]">
      <div className="flex min-h-0 flex-1 flex-col" data-testid="skeleton-compacto">
        <header className="flex shrink-0 items-center justify-between gap-xs border-b border-border bg-background px-base py-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <div className="flex size-[38px] shrink-0 items-center justify-center rounded-full bg-primary">
              <CartShopping className="size-[19px] text-primary-foreground" aria-hidden="true" />
            </div>
            <div className="flex min-w-0 flex-col gap-[1px]">
              <strong className="truncate text-[17px] leading-[1.15] font-bold text-foreground">
                {NOME_DO_PRODUTO}
              </strong>
              <span className="truncate text-sm leading-[1.2] font-semibold text-muted-foreground">
                Preparando o ponto de venda…
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-xs" aria-hidden="true">
            <div className={cn('h-8 w-20 rounded-full', SHIMMER_PILL)} />
            <div className="size-9 rounded-full bg-secondary" />
          </div>
        </header>

        <div
          className="flex min-h-0 flex-1 flex-col gap-xs overflow-hidden px-base pt-2.5 pb-2.5"
          aria-hidden="true"
        >
          <section className="flex shrink-0 flex-col gap-1.5 rounded-[14px] border border-border bg-card px-sm py-2">
            <div className="flex items-center justify-between gap-xs">
              <div className={cn('h-4 w-36 rounded-sm', SHIMMER_PILL)} />
              <div className="h-3 w-6 rounded-sm bg-secondary" />
            </div>
            <div className="flex items-center gap-1">
              {Array.from({ length: 3 }, (_, indice) => (
                <span key={indice} className="h-[5px] min-w-0 flex-1 rounded-full bg-secondary" />
              ))}
            </div>
          </section>

          <div className="flex w-full shrink-0 flex-col gap-xs rounded-[20px] bg-[var(--cc-color-surface-dark)] p-2.5">
            <div className="flex items-baseline justify-between gap-xs">
              <span className="text-base font-semibold text-[var(--cc-color-on-dark-strong)]">
                Total a pagar
              </span>
              <strong className="font-mono text-xl leading-8 font-semibold tabular-nums text-[var(--cc-color-on-dark)]">
                R$ 0,00
              </strong>
            </div>
            <div className="flex w-full items-start gap-xs">
              {Array.from({ length: 2 }, (_, indice) => (
                <div
                  key={indice}
                  className="h-10 flex-1 rounded-[14px] bg-[var(--cc-color-surface-dark-elevated)]"
                />
              ))}
            </div>
          </div>

          {[
            { chave: 'cliente', larguras: ['30%', '75%'] },
            { chave: 'produto', larguras: ['40%', '90%'] },
          ].map(({ chave, larguras }) => (
            <section
              key={chave}
              className="flex shrink-0 flex-col gap-sm rounded-xl border border-border bg-background p-base"
            >
              {larguras.map((largura) => (
                <div
                  key={largura}
                  className={cn('h-4.5 rounded-sm', SHIMMER_PILL)}
                  style={{ width: largura }}
                />
              ))}
            </section>
          ))}

          <section className="flex min-h-0 flex-1 flex-col gap-sm overflow-hidden rounded-xl border border-border bg-background p-base">
            {Array.from({ length: 4 }, (_, indice) => (
              <div
                key={indice}
                className="h-4.5 shrink-0 rounded-sm bg-secondary"
                style={{ width: `${90 - indice * 12}%` }}
              />
            ))}
          </section>

          <div className="h-[50px] w-full shrink-0 rounded-full bg-secondary" />
        </div>
      </div>
    </MolduraDeCarregamento>
  );
}

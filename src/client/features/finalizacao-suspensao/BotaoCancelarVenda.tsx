import { CloseSquare } from 'reicon-react';
import type { ReactElement } from 'react';
import { acaoBloqueavel, atributosDeBloqueio, type MotivoBloqueio } from '@/lib/bloqueio';
import { cn } from '@/lib/utils';

/**
 * Botão "Cancelar venda" — suspende a venda em digitação (T025, AD-089).
 *
 * Duas superfícies desenhadas no Pencil (`design/CentriumCheckout.pen`), não
 * uma só reaproveitada:
 *
 * - **Desktop** — nó "Atalho Cancelar venda", na faixa "Atalhos da venda":
 *   pílula de 36px, fundo branco com hairline `#DEE1E6` (`--border`), ícone de
 *   16px em `#5B616E` (`--cc-color-body`) e rótulo Inter 12px peso 600,
 *   ocupando uma fração da faixa (`flex: 1 1 0`).
 * - **Mobile** — nó "Cancelar venda mobile", na barra superior: quadrado de
 *   38px com raio de pílula, fundo `#EEF0F3` (`--secondary`), só o ícone de
 *   19px em `#CF202F` (`--destructive`), disponível em **todas** as etapas do
 *   wizard (AD-089).
 *
 * **O ícone é o mesmo nas duas superfícies, e isso é um desvio deliberado do
 * Pencil** (pedido do usuário, 2026-09-09). O desenho dá um ícone diferente a
 * cada superfície — `panel-right-open` no desktop, `trash-2` no mobile —, o que
 * fazia a mesma ação parecer duas: uma gaveta que abre e uma exclusão. As duas
 * passaram a usar `CloseSquare` (reicon, ver AD-201): um só desenho para uma só
 * operação, em qualquer largura. Só o ícone mudou — medidas, cores e o vermelho
 * do mobile continuam sendo os do desenho.
 *
 * "Cancelar" é o rótulo do operador; a operação enviada ao ERP é `SUSPENDER`
 * (`FR-002`) — a venda continua existindo como rascunho do lado do servidor.
 */
export interface BotaoCancelarVendaProps {
  readonly onCancelar: () => void;
  /** Layout compacto (mobile): só o ícone, sem rótulo. */
  readonly compacto?: boolean;
  /**
   * Por que a suspensão não está disponível — a **frase que o operador lê** —,
   * ou `null` quando está. Os motivos são decididos pelo call site: envio em
   * andamento, nenhuma linha na venda (nada a suspender) ou pagamento aprovado
   * não removível (`FR-005`, AD-042).
   *
   * É texto, e não um booleano, por causa do padrão de bloqueio explicativo
   * desta base (`lib/bloqueio.ts`): o botão fica `aria-disabled` e clicar nele
   * informa o motivo, em vez de não fazer nada (pedido do usuário,
   * 2026-09-03).
   */
  readonly bloqueado?: MotivoBloqueio;
}

const ROTULO = 'Cancelar venda';

export function BotaoCancelarVenda({
  onCancelar,
  compacto = false,
  bloqueado = null,
}: BotaoCancelarVendaProps): ReactElement {
  const desabilitado = bloqueado !== null;
  const aoClicar = acaoBloqueavel(bloqueado, onCancelar);

  if (compacto) {
    return (
      <button
        type="button"
        data-testid="botao-cancelar-venda"
        aria-label={ROTULO}
        {...atributosDeBloqueio(bloqueado)}
        onClick={aoClicar}
        className={cn(
          'flex size-[38px] shrink-0 items-center justify-center rounded-full bg-secondary',
          'outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
          desabilitado
            ? 'cursor-not-allowed text-[var(--cc-color-muted-soft)]'
            : 'text-destructive',
        )}
      >
        <CloseSquare className="size-[19px]" aria-hidden="true" />
      </button>
    );
  }

  return (
    <button
      type="button"
      data-testid="botao-cancelar-venda"
      {...atributosDeBloqueio(bloqueado)}
      onClick={aoClicar}
      className={cn(
        'flex h-9 flex-1 items-center justify-center gap-xs rounded-full border border-border bg-card',
        'text-sm font-semibold whitespace-nowrap outline-none',
        'focus-visible:ring-[3px] focus-visible:ring-ring/50',
        desabilitado ? 'cursor-not-allowed text-[var(--cc-color-muted-soft)]' : 'text-foreground',
      )}
    >
      <CloseSquare
        className={cn('size-4', desabilitado ? '' : 'text-[var(--cc-color-body)]')}
        aria-hidden="true"
      />
      {ROTULO}
    </button>
  );
}

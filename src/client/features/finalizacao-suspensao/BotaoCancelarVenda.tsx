import { PanelRightOpen, Trash2 } from 'lucide-react';
import type { ReactElement } from 'react';
import { cn } from '@/lib/utils';

/**
 * Botão "Cancelar venda" — suspende a venda em digitação (T025, AD-089).
 *
 * Duas superfícies desenhadas no Pencil (`design/CentriumCheckout.pen`), não
 * uma só reaproveitada:
 *
 * - **Desktop** — nó "Atalho Cancelar venda", na faixa "Atalhos da venda":
 *   pílula de 36px, fundo branco com hairline `#DEE1E6` (`--border`), ícone
 *   `panel-right-open` de 16px em `#5B616E` (`--cc-color-body`) e rótulo Inter
 *   12px peso 600, ocupando uma fração da faixa (`flex: 1 1 0`).
 * - **Mobile** — nó "Cancelar venda mobile", na barra superior: quadrado de
 *   38px com raio de pílula, fundo `#EEF0F3` (`--secondary`), só o ícone
 *   `trash-2` de 19px em `#CF202F` (`--destructive`), disponível em **todas**
 *   as etapas do wizard (AD-089).
 *
 * "Cancelar" é o rótulo do operador; a operação enviada ao ERP é `SUSPENDER`
 * (`FR-002`) — a venda continua existindo como rascunho do lado do servidor.
 */
export interface BotaoCancelarVendaProps {
  readonly onCancelar: () => void;
  /** Layout compacto (mobile): só o ícone de lixeira. */
  readonly compacto?: boolean;
  readonly enviando?: boolean;
  /** Há pagamento aprovado não removível (`FR-005`, AD-042). */
  readonly bloqueado?: boolean;
}

const ROTULO = 'Cancelar venda';

export function BotaoCancelarVenda({
  onCancelar,
  compacto = false,
  enviando = false,
  bloqueado = false,
}: BotaoCancelarVendaProps): ReactElement {
  const desabilitado = enviando || bloqueado;

  if (compacto) {
    return (
      <button
        type="button"
        data-testid="botao-cancelar-venda"
        aria-label={ROTULO}
        disabled={desabilitado}
        onClick={onCancelar}
        className={cn(
          'flex size-[38px] shrink-0 items-center justify-center rounded-full bg-secondary',
          'outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
          desabilitado ? 'text-[var(--cc-color-muted-soft)]' : 'text-destructive',
        )}
      >
        <Trash2 className="size-[19px]" aria-hidden="true" />
      </button>
    );
  }

  return (
    <button
      type="button"
      data-testid="botao-cancelar-venda"
      disabled={desabilitado}
      onClick={onCancelar}
      className={cn(
        'flex h-9 flex-1 items-center justify-center gap-xs rounded-full border border-border bg-card',
        'text-sm font-semibold whitespace-nowrap outline-none',
        'focus-visible:ring-[3px] focus-visible:ring-ring/50',
        desabilitado ? 'text-[var(--cc-color-muted-soft)]' : 'text-foreground',
      )}
    >
      <PanelRightOpen
        className={cn('size-4', desabilitado ? '' : 'text-[var(--cc-color-body)]')}
        aria-hidden="true"
      />
      {ROTULO}
    </button>
  );
}

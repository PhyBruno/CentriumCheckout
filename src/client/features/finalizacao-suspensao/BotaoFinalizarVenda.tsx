import { CircleCheck } from 'lucide-react';
import type { ReactElement } from 'react';
import { cn } from '@/lib/utils';

/**
 * Botão "Finalizar venda" (T018, AD-089).
 *
 * Réplica do nó "Botão finalizar venda" do frame "PDV Online Web - Valor
 * Faltante"/"…- Pagamento" do Pencil (`design/CentriumCheckout.pen`, export em
 * `design/HTML - Pencil/CentriumCheckout.html`): pílula de 48px de altura,
 * largura total, ícone `circle-check` de 20px à esquerda, rótulo Inter 15px
 * peso 700, gap de 9px.
 *
 * Estado habilitado e desabilitado são **dois estados desenhados**, não uma
 * opacidade: habilitado é `#2563EB`/branco (`--primary`/`--primary-foreground`);
 * desabilitado é `#EEF0F3`/`#7C828A` (`--secondary`/`--cc-color-muted`) — foi
 * assim que os dois frames do Pencil desenharam o botão, e é o que comunica ao
 * operador que falta algo para a venda poder ser emitida (`FR-014`).
 *
 * Presentacional de propósito: quem possui a máquina de estados é
 * `AcoesFinaisVenda`, para não existirem duas instâncias do hook orquestrador
 * disputando a mesma venda.
 */
export interface BotaoFinalizarVendaProps {
  readonly onFinalizar: () => void;
  /** Envio em curso — evita o segundo clique antes do re-render. */
  readonly enviando?: boolean;
  /** Sem veredito favorável vigente da validação prévia (`FR-014`, AD-113). */
  readonly bloqueado?: boolean;
}

export function BotaoFinalizarVenda({
  onFinalizar,
  enviando = false,
  bloqueado = false,
}: BotaoFinalizarVendaProps): ReactElement {
  const desabilitado = enviando || bloqueado;

  return (
    <button
      type="button"
      data-testid="botao-finalizar-venda"
      disabled={desabilitado}
      aria-busy={enviando}
      onClick={onFinalizar}
      className={cn(
        'flex h-12 w-full shrink-0 items-center justify-center gap-[9px] rounded-full',
        'text-[15px] font-bold transition-colors outline-none',
        'focus-visible:ring-[3px] focus-visible:ring-ring/50',
        desabilitado
          ? 'bg-secondary text-[var(--cc-color-muted)]'
          : 'bg-primary text-primary-foreground hover:bg-[var(--cc-color-primary-active)]',
      )}
    >
      <CircleCheck className="size-5" aria-hidden="true" />
      {enviando ? 'Finalizando…' : 'Finalizar venda'}
    </button>
  );
}

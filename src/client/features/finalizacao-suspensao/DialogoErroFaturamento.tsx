import { AlertTriangle, XCircle } from 'lucide-react';
import type { ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { useFocoDeModal } from '@/lib/useFocoDeModal';

/**
 * Erro de transmissão da NFCe (pedido do usuário, 2026-09-02).
 *
 * Substitui o texto que antes ficava embaixo do botão de finalizar: uma venda
 * **não emitida** é o desfecho mais grave do fluxo, e uma linha de texto ao pé
 * do botão é fácil demais de não ver — o operador podia achar que finalizou.
 *
 * É o estado `falha-negocio` da máquina: o ERP **respondeu** recusando, então a
 * primeira tentativa provadamente não gerou NFCe e o reenvio é livre
 * (`research.md`, D2). Por isso não há confirmação a dar aqui — o operador
 * fecha, corrige o que o ERP apontou e aciona "Finalizar venda" de novo. A
 * venda continua intacta no carrinho (`FR-012`).
 *
 * Distinto de `DialogoConfirmarReenvio`, que trata a falha **sem resposta** e
 * cobra confirmação explícita antes de qualquer novo envio (`FR-004`/AD-038).
 *
 * Mesma anatomia do "Modal pagamento aprovado TEF" (`A9MNZI`) do Pencil, na
 * família de erro.
 */
export interface DialogoErroFaturamentoProps {
  readonly mensagem: string;
  readonly onFechar: () => void;
}

export function DialogoErroFaturamento({
  mensagem,
  onFechar,
}: DialogoErroFaturamentoProps): ReactElement {
  // `true`: sem prop de abertura — o pai só renderiza este diálogo aberto.
  const janelaRef = useFocoDeModal<HTMLDivElement>(true);

  return (
    <div
      className="cc-backdrop-entra fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-lg"
      data-testid="dialogo-erro-faturamento"
    >
      <div
        ref={janelaRef}
        role="alertdialog"
        aria-modal="true"
        aria-label="Falha ao emitir a NFCe"
        className="cc-modal-entra flex w-full max-w-[480px] flex-col overflow-hidden rounded-3xl border border-border bg-card"
      >
        <header className="flex h-[78px] shrink-0 items-center gap-sm border-b border-border px-lg">
          <span className="flex size-[42px] shrink-0 items-center justify-center rounded-full bg-[var(--cc-color-down-soft)]">
            <XCircle className="size-5 text-destructive" aria-hidden="true" />
          </span>
          <span className="flex flex-col gap-[2px]">
            <strong className="text-md font-semibold text-foreground">NFCe não emitida</strong>
            <span className="text-sm text-destructive">A venda não foi transmitida</span>
          </span>
        </header>

        <div className="flex flex-col items-center gap-lg px-lg py-xl">
          <span className="flex size-24 items-center justify-center rounded-full bg-[var(--cc-color-down-soft)]">
            <XCircle className="size-14 text-destructive" aria-hidden="true" />
          </span>

          <span className="flex flex-col items-center gap-xs text-center">
            <strong className="text-lg font-semibold text-foreground">
              O ERP recusou a emissão
            </strong>
            <span className="text-sm text-[var(--cc-color-body)]">
              A venda continua aberta no caixa. Corrija o que o ERP apontou e finalize de novo.
            </span>
          </span>

          <p
            role="alert"
            data-testid="erro-finalizacao"
            className="flex w-full items-start gap-xs rounded-2xl border border-border bg-[var(--cc-color-surface-soft)] p-base text-sm text-[var(--cc-color-body)]"
          >
            <AlertTriangle
              className="mt-[2px] size-4 shrink-0 text-destructive"
              aria-hidden="true"
            />
            {mensagem}
          </p>
        </div>

        <footer className="flex h-[60px] shrink-0 items-center justify-center border-t border-border px-lg">
          <Button
            variant="secondary"
            className="h-9 rounded-full px-lg"
            onClick={onFechar}
            data-testid="fechar-erro-faturamento"
          >
            Entendi
          </Button>
        </footer>
      </div>
    </div>
  );
}

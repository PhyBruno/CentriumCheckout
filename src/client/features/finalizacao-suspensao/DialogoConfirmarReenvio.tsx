import { AlertTriangle } from 'lucide-react';
import type { ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import type { SuspenderOuFaturar } from '../../domain/venda/montarRetratoVenda';

/**
 * Confirmação manual de reenvio após falha de rede (T020, `FR-004`, AD-038).
 *
 * O sistema **não** reenvia sozinho: sem resposta do ERP, não há como saber se
 * a primeira tentativa foi processada, e um reenvio automático poderia gerar um
 * segundo documento fiscal para a mesma venda (SC-003). Quem decide é o
 * operador, que é quem consegue verificar se o cupom saiu.
 *
 * Este diálogo não tem botão de "tentar de novo automaticamente" nem contagem
 * regressiva de propósito — as duas coisas reintroduziriam o reenvio automático
 * por outro nome.
 *
 * Mesma anatomia de modal do "Modal pagamento aprovado TEF" (`A9MNZI`) do
 * Pencil, na família de alerta: cabeçalho de 78px com hairline, corpo de 32/24
 * com ícone circular de 96px e rodapé de 60px com borda superior.
 */
export interface DialogoConfirmarReenvioProps {
  readonly operacao: SuspenderOuFaturar;
  readonly onConfirmar: () => void;
  readonly onCancelar: () => void;
  readonly enviando?: boolean;
}

const NOME_DA_OPERACAO: Record<SuspenderOuFaturar, string> = {
  FATURAR: 'finalização',
  SUSPENDER: 'suspensão',
};

export function DialogoConfirmarReenvio({
  operacao,
  onConfirmar,
  onCancelar,
  enviando = false,
}: DialogoConfirmarReenvioProps): ReactElement {
  const nome = NOME_DA_OPERACAO[operacao];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-lg"
      data-testid="dialogo-confirmar-reenvio"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label="Confirmar reenvio"
        className="flex w-full max-w-[480px] flex-col overflow-hidden rounded-3xl border border-border bg-card"
      >
        <header className="flex h-[78px] shrink-0 items-center gap-sm border-b border-border px-lg">
          <span className="flex size-[42px] shrink-0 items-center justify-center rounded-full bg-[var(--cc-color-warning-soft)]">
            <AlertTriangle
              className="size-5 text-[var(--cc-color-accent-yellow)]"
              aria-hidden="true"
            />
          </span>
          <span className="flex flex-col gap-[2px]">
            <strong className="text-md font-semibold text-foreground">
              Sem resposta do servidor
            </strong>
            <span className="text-sm text-[var(--cc-color-body)]">
              A {nome} pode ou não ter sido processada
            </span>
          </span>
        </header>

        <div className="flex flex-col items-center gap-lg px-lg py-xl">
          <span className="flex size-24 items-center justify-center rounded-full bg-[var(--cc-color-warning-soft)]">
            <AlertTriangle
              className="size-14 text-[var(--cc-color-accent-yellow)]"
              aria-hidden="true"
            />
          </span>

          <span className="flex flex-col items-center gap-xs text-center">
            <strong className="text-lg font-semibold text-foreground">
              Confirme no ERP antes de reenviar
            </strong>
            <span className="text-sm text-[var(--cc-color-body)]">
              A {nome} foi enviada, mas nenhuma resposta chegou. Daqui não é possível saber se ela
              já foi processada.
            </span>
          </span>

          <p className="w-full rounded-2xl border border-border bg-[var(--cc-color-surface-soft)] p-base text-center text-sm font-semibold text-foreground">
            Reenviar uma venda já processada emite um segundo documento fiscal.
          </p>
        </div>

        <footer className="flex h-[60px] shrink-0 items-center justify-center gap-sm border-t border-border px-lg">
          <Button
            variant="secondary"
            className="h-9 rounded-full px-lg"
            onClick={onCancelar}
            data-testid="cancelar-reenvio"
          >
            Agora não
          </Button>
          <Button
            className="h-9 rounded-full px-lg"
            onClick={onConfirmar}
            disabled={enviando}
            aria-busy={enviando}
            data-testid="confirmar-reenvio"
          >
            {enviando ? 'Reenviando…' : 'Já verifiquei, reenviar'}
          </Button>
        </footer>
      </div>
    </div>
  );
}

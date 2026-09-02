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
        className="flex w-full max-w-[440px] flex-col gap-base rounded-3xl bg-background p-lg shadow-lg"
      >
        <header className="flex items-center gap-sm">
          <span className="flex size-[42px] shrink-0 items-center justify-center rounded-full bg-secondary">
            <AlertTriangle className="size-5 text-[var(--cc-color-accent-yellow)]" aria-hidden />
          </span>
          <h2 className="text-lg font-semibold">Sem resposta do servidor</h2>
        </header>

        <div className="flex flex-col gap-xs text-[var(--cc-color-body)]">
          <p>
            A {nome} foi enviada, mas nenhuma resposta chegou. Não é possível saber, daqui, se ela
            já foi processada.
          </p>
          <p className="font-semibold text-foreground">
            Confirme no ERP antes de reenviar: reenviar uma venda já processada emite um segundo
            documento fiscal.
          </p>
        </div>

        <footer className="flex justify-end gap-xs">
          <Button variant="secondary" onClick={onCancelar} data-testid="cancelar-reenvio">
            Agora não
          </Button>
          <Button
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

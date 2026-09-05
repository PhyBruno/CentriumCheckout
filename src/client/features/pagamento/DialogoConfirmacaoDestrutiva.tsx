import { AlertTriangle } from 'lucide-react';
import { useEffect, type ReactElement } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Confirmação de um gesto cujo estrago acontece **fora** do Checkout e que ele
 * não sabe desfazer (itens 1.1, 2 e 3 do usuário, 2026-09-04).
 *
 * **Um componente, cinco call sites.** Quatro deles são a cobrança PIX que
 * segue viva no banco depois do gesto:
 *
 * 1. `ModalPix` — desistir de uma cobrança ainda não paga;
 * 2. `ListaPagamentosAplicados` — remover uma forma PIX já aplicada;
 * 3. `PainelPagamentoETotais` — "Limpar" com PIX na venda;
 * 4. `AcoesFinaisVenda` — "Cancelar venda" com PIX na venda.
 *
 * O quinto (AD-169) não tem nada a ver com PIX, e é o motivo de este arquivo
 * ter saído de `pix/`: "Limpar" sobre um pagamento que veio no documento
 * retomado descarta o registro de um valor **já recebido**, gravado no
 * documento dentro do ERP. Mesma anatomia, mesma pergunta ao operador — "o
 * Checkout não desfaz isto lá fora, seguimos?" —, gatilho diferente.
 *
 * Parametrizado por texto em vez de por "tipo de confirmação" (Open/Closed,
 * Constitution II): um `variante: 'remocao' | 'suspensao' | …` obrigaria este
 * arquivo a mudar a cada novo gesto, e a tabela de textos aqui dentro
 * inevitavelmente divergiria do que cada tela de fato faz. Foi o que permitiu
 * ao quinto call site entrar sem tocar numa linha daqui.
 *
 * Anatomia idêntica à do `DialogoConfirmarReenvio` (família de alerta do Pencil,
 * derivada do nó "Modal pagamento aprovado TEF" `A9MNZI`): cabeçalho de 78px com
 * hairline, corpo de 32/24 com disco de 96px e rodapé de 60px com borda
 * superior. Reaproveitar a anatomia — e não o componente — é deliberado: aquele
 * diálogo tem regra própria (reenvio duplica documento fiscal) e generalizá-lo
 * misturaria duas decisões que não têm nada em comum além da aparência.
 *
 * `z-[60]`, acima do `z-50` de `ModalPix`: quando o gatilho é a própria janela do
 * PIX, a confirmação precisa cobri-la, não aparecer por baixo.
 */
export interface DialogoConfirmacaoDestrutivaProps {
  /** Título do cabeçalho — o gesto, na voz do operador. */
  readonly titulo: string;
  /** Subtítulo do cabeçalho — o estado da venda que torna o gesto delicado. */
  readonly subtitulo: string;
  /** Chamada central: o fato que o operador precisa aceitar. */
  readonly chamada: string;
  /** Uma ou duas frases explicando por que o Checkout não resolve sozinho. */
  readonly explicacao: string;
  /** Frase em caixa — a consequência, escrita para sobreviver a uma leitura apressada. */
  readonly destaque: string;
  readonly rotuloConfirmar: string;
  readonly rotuloCancelar?: string;
  readonly onConfirmar: () => void;
  readonly onCancelar: () => void;
  /** `data-testid` do backdrop — cada call site nomeia o seu. */
  readonly testId: string;
}

export function DialogoConfirmacaoDestrutiva({
  titulo,
  subtitulo,
  chamada,
  explicacao,
  destaque,
  rotuloConfirmar,
  rotuloCancelar = 'Voltar',
  onConfirmar,
  onCancelar,
  testId,
}: DialogoConfirmacaoDestrutivaProps): ReactElement {
  // ESC cancela — nunca confirma. Numa tela de caixa a tecla de escape é o gesto
  // reflexo de "sai daqui", e mapeá-la para o desfecho destrutivo seria a pior
  // inversão possível. Ouvinte de `window`, como nos demais modais desta base:
  // um `onKeyDown` no backdrop só dispara com o foco dentro do diálogo.
  useEffect(() => {
    const aoTeclar = (evento: globalThis.KeyboardEvent): void => {
      if (evento.key === 'Escape') {
        onCancelar();
      }
    };
    window.addEventListener('keydown', aoTeclar);
    return () => {
      window.removeEventListener('keydown', aoTeclar);
    };
  }, [onCancelar]);

  return (
    <div
      className="cc-backdrop-entra fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-lg"
      data-testid={testId}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={titulo}
        className="cc-modal-entra flex w-full max-w-[480px] flex-col overflow-hidden rounded-3xl border border-border bg-card"
      >
        <header className="flex h-[78px] shrink-0 items-center gap-sm border-b border-border px-lg">
          <span className="flex size-[42px] shrink-0 items-center justify-center rounded-full bg-[var(--cc-color-warning-soft)]">
            <AlertTriangle
              className="size-5 text-[var(--cc-color-accent-yellow)]"
              aria-hidden="true"
            />
          </span>
          <span className="flex flex-col gap-[2px]">
            <strong className="text-md font-semibold text-foreground">{titulo}</strong>
            <span className="text-sm text-[var(--cc-color-body)]">{subtitulo}</span>
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
            <strong className="text-lg font-semibold text-foreground">{chamada}</strong>
            <span className="text-sm text-[var(--cc-color-body)]">{explicacao}</span>
          </span>

          <p className="w-full rounded-2xl border border-border bg-[var(--cc-color-surface-soft)] p-base text-center text-sm font-semibold text-foreground">
            {destaque}
          </p>
        </div>

        <footer className="flex h-[60px] shrink-0 items-center justify-center gap-sm border-t border-border px-lg">
          {/* "Voltar" primeiro e com o foco natural: o desfecho seguro é o que o
              operador alcança sem mirar. */}
          <Button
            variant="secondary"
            className="h-9 rounded-full px-lg"
            onClick={onCancelar}
            data-testid={`${testId}-cancelar`}
          >
            {rotuloCancelar}
          </Button>
          <Button
            className="h-9 rounded-full px-lg"
            onClick={onConfirmar}
            data-testid={`${testId}-confirmar`}
          >
            {rotuloConfirmar}
          </Button>
        </footer>
      </div>
    </div>
  );
}

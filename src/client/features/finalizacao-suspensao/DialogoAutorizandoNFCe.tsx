import { FileText } from 'reicon-react';
import { useRef, type ReactElement } from 'react';
import { useFocoDeModal } from '@/lib/useFocoDeModal';

/**
 * Espera da autorização da NFCe (pedido do usuário, 2026-09-17 — AD-244).
 *
 * Entre o clique em "Finalizar" e a resposta do ERP há o tempo da SEFAZ, e a
 * tela ficava parada — o botão só trocava o rótulo, e o operador lia como
 * travamento. Este diálogo cobre exatamente o estado `enviando` de `FATURAR` e
 * sai de cena quando a resposta chega, dando lugar ao desfecho de sempre
 * (impressão, PDF ou erro). Suspender não passa por aqui: não há SEFAZ a
 * esperar, e o desfecho já é um toast.
 *
 * **Sem botão e sem ESC, de propósito.** O `FaturarNFCe` já partiu e não há
 * como retirá-lo; fechar a janela só devolveria a tela a um estado em que o
 * operador acha que pode mexer na venda enquanto a nota é emitida.
 *
 * **Recebe o foco.** Com o foco no botão de finalizar, uma bipagem durante a
 * espera iria para a tela de trás; com ele na janela, as teclas ficam aqui, e as
 * fixas da 016 já recusam por `haJanelaAberta()`.
 *
 * **Anatomia**: o Pencil não desenha esta espera (confirmado pelo usuário,
 * 2026-09-17). Segue a mesma moldura do "Modal pagamento aprovado TEF"
 * (`A9MNZI`) que os outros diálogos da finalização usam, sem o rodapé — não há
 * ação a oferecer.
 */
export function DialogoAutorizandoNFCe(): ReactElement {
  const janelaRef = useRef<HTMLDivElement | null>(null);
  const refDoLaco = useFocoDeModal<HTMLDivElement>(true, { focoInicial: janelaRef });

  return (
    // Fundo **sem** fade de entrada: esta janela também nasce logo depois do
    // diálogo de reenvio, e um fade a partir de zero faria o escurecimento
    // piscar na troca. Só o cartão anima.
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-lg"
      data-testid="dialogo-autorizando-nfce"
    >
      <div
        ref={(elemento) => {
          janelaRef.current = elemento;
          refDoLaco.current = elemento;
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Autorizando NFCe"
        aria-busy="true"
        tabIndex={-1}
        className="cc-modal-entra flex w-full max-w-[480px] flex-col overflow-hidden rounded-3xl border border-border bg-card outline-none"
      >
        <header className="flex h-[78px] shrink-0 items-center gap-sm border-b border-border px-lg">
          <span className="flex size-[42px] shrink-0 items-center justify-center rounded-full bg-secondary">
            <FileText className="size-5 text-[var(--cc-color-body)]" aria-hidden="true" />
          </span>
          <span className="flex flex-col gap-[2px]">
            <strong className="text-md font-semibold text-foreground">Finalizando venda</strong>
            <span className="text-sm text-[var(--cc-color-body)]">Aguardando o retorno do ERP</span>
          </span>
        </header>

        <div className="flex flex-col items-center gap-lg px-lg py-xl">
          {/* Ícone de 96px com o anel girando por cima: o anel é só um contorno
              com um trecho em `primary`, e é ele que diz "ainda trabalhando". */}
          <span className="relative flex size-24 items-center justify-center rounded-full bg-secondary">
            <span
              aria-hidden="true"
              data-testid="anel-autorizando"
              className="cc-giro absolute inset-0 rounded-full border-4 border-border border-t-primary"
            />
            <FileText className="size-12 text-[var(--cc-color-body)]" aria-hidden="true" />
          </span>

          <span role="status" className="flex flex-col items-center gap-xs text-center">
            <strong className="text-lg font-semibold text-foreground">Autorizando NFCe</strong>
            <span className="text-sm text-[var(--cc-color-body)]">
              Aguarde a autorização da SEFAZ. Não feche nem recarregue esta tela.
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

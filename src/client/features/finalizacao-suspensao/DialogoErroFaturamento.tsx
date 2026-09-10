import { AlertTriangle, XCircle } from 'reicon-react';
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
 * Cobre os **dois** desfechos ruins de `FaturarNFCe`, que têm a mesma anatomia
 * e instruções opostas (ver `Desfecho` abaixo). O que muda entre eles é só a
 * cópia: um diálogo separado duplicaria moldura, foco e acessibilidade para
 * trocar quatro frases, e as duas cópias divergiriam no primeiro ajuste visual.
 *
 * Distinto de `DialogoConfirmarReenvio`, que trata a falha **sem resposta** e
 * cobra confirmação explícita antes de qualquer novo envio (`FR-004`/AD-038).
 *
 * Mesma anatomia do "Modal pagamento aprovado TEF" (`A9MNZI`) do Pencil, na
 * família de erro. O Pencil não desenha um nó próprio para a rejeição
 * (verificado no `.pen` em 2026-09-10): a variante reusa esta moldura.
 */
export type Desfecho =
  /**
   * Estado `falha-negocio`: o ERP **respondeu** recusando, então a primeira
   * tentativa provadamente não gerou NFCe e o reenvio é livre (`research.md`,
   * D2). O operador fecha, corrige o que o ERP apontou e aciona "Finalizar
   * venda" de novo — a venda continua intacta no carrinho (`FR-012`).
   */
  | 'NAO_EMITIDA'
  /**
   * Estado `nfce-rejeitada`: o ERP **gravou** a NFCe e a autorização não saiu
   * (correção do usuário, 2026-09-10). Não há o que corrigir e reenviar daqui —
   * a nota já existe do outro lado, e fechar este aviso libera o caixa para a
   * próxima venda. A instrução precisa dizer isso, porque é o oposto da outra.
   */
  | 'REJEITADA';

/** Identificação da nota que o ERP gravou — só existe em `REJEITADA`. */
export interface DocumentoRejeitado {
  readonly numeroNota: number | null;
  readonly serieNota: string | null;
}

interface CopiaDoDesfecho {
  readonly rotuloAcessivel: string;
  readonly tituloCabecalho: string;
  readonly subtituloCabecalho: string;
  readonly chamada: string;
  readonly explicacao: string;
  readonly rotuloBotao: string;
}

const COPIA: Record<Desfecho, CopiaDoDesfecho> = {
  NAO_EMITIDA: {
    rotuloAcessivel: 'Falha ao emitir a NFCe',
    tituloCabecalho: 'NFCe não emitida',
    subtituloCabecalho: 'A venda não foi transmitida',
    chamada: 'O ERP recusou a emissão',
    explicacao: 'A venda continua aberta no caixa. Corrija o que o ERP apontou e finalize de novo.',
    rotuloBotao: 'Entendi',
  },
  REJEITADA: {
    rotuloAcessivel: 'NFCe rejeitada pelo ERP',
    tituloCabecalho: 'NFCe rejeitada',
    subtituloCabecalho: 'O documento já ficou registrado no ERP',
    chamada: 'A NFCe não foi autorizada',
    // Anuncia a limpeza **antes** de ela acontecer: o operador precisa saber que
    // vai perder a tela ao fechar, e que isso é o comportamento correto e não
    // uma venda perdida por engano.
    explicacao:
      'A nota já está gravada no ERP como rejeitada, então esta venda não pode ser reenviada daqui. Ao fechar, o caixa fica livre para uma nova NFCe.',
    rotuloBotao: 'Fechar e liberar o caixa',
  },
};

/** `NFCe 9001 · série 1`, com o que o ERP tiver mandado — ou nada. */
function identificacaoDaNota(documento: DocumentoRejeitado | undefined): string | null {
  if (documento === undefined) {
    return null;
  }

  const partes: string[] = [];
  // `0` é o "sem número" do contrato: anunciá-lo mandaria o operador procurar
  // uma nota que não existe com esse número no ERP.
  if (documento.numeroNota !== null && documento.numeroNota !== 0) {
    partes.push(`NFCe ${String(documento.numeroNota)}`);
  }
  if (documento.serieNota !== null) {
    partes.push(`série ${documento.serieNota}`);
  }

  return partes.length === 0 ? null : partes.join(' · ');
}

export interface DialogoErroFaturamentoProps {
  readonly mensagem: string;
  readonly onFechar: () => void;
  /** Default `NAO_EMITIDA`: o desfecho que este diálogo já cobria sozinho. */
  readonly desfecho?: Desfecho;
  readonly documento?: DocumentoRejeitado;
}

export function DialogoErroFaturamento({
  mensagem,
  onFechar,
  desfecho = 'NAO_EMITIDA',
  documento,
}: DialogoErroFaturamentoProps): ReactElement {
  const copia = COPIA[desfecho];
  const identificacao = identificacaoDaNota(documento);
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
        aria-label={copia.rotuloAcessivel}
        className="cc-modal-entra flex w-full max-w-[480px] flex-col overflow-hidden rounded-3xl border border-border bg-card"
      >
        <header className="flex h-[78px] shrink-0 items-center gap-sm border-b border-border px-lg">
          <span className="flex size-[42px] shrink-0 items-center justify-center rounded-full bg-[var(--cc-color-down-soft)]">
            <XCircle className="size-5 text-destructive" aria-hidden="true" />
          </span>
          <span className="flex flex-col gap-[2px]">
            <strong className="text-md font-semibold text-foreground">
              {copia.tituloCabecalho}
            </strong>
            <span className="text-sm text-destructive">{copia.subtituloCabecalho}</span>
          </span>
        </header>

        <div className="flex flex-col items-center gap-lg px-lg py-xl">
          <span className="flex size-24 items-center justify-center rounded-full bg-[var(--cc-color-down-soft)]">
            <XCircle className="size-14 text-destructive" aria-hidden="true" />
          </span>

          <span className="flex flex-col items-center gap-xs text-center">
            <strong className="text-lg font-semibold text-foreground">{copia.chamada}</strong>
            <span className="text-sm text-[var(--cc-color-body)]">{copia.explicacao}</span>
            {/* Número e série da nota gravada: sem eles o operador não tem por
                onde achar no ERP a NFCe que acabou de ser rejeitada. Em
                `font-mono` como todo valor tabular do produto. */}
            {identificacao !== null && (
              <span
                data-testid="documento-rejeitado"
                className="font-mono text-sm text-[var(--cc-color-body)]"
              >
                {identificacao}
              </span>
            )}
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
            {copia.rotuloBotao}
          </Button>
        </footer>
      </div>
    </div>
  );
}

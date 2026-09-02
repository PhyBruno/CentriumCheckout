import { AlertTriangle, CircleCheck, FileText, Printer } from 'lucide-react';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import {
  decidirMecanismoImpressao,
  type TipoImpressao,
} from '../../domain/finalizacaoVenda/decidirMecanismoImpressao';
import {
  imprimirNFCeLocal,
  HOST_IMPRESSAO_PADRAO,
  type ImpressaoDeps,
  type ResultadoImpressao,
} from '../../services/impressao/imprimirNFCeLocal';
import type { NotaFiscalResposta } from '../../../shared/schemas/faturarNFCe.schema';

/**
 * Entrega do documento fiscal ao operador (T019, `FR-007` a `FR-009`).
 *
 * O caminho é decidido pela configuração do ambiente, nunca pelo operador a
 * cada venda (`FR-008`): `TipoImpressao = 'E'` tenta a impressão direta pelo
 * serviço local do PDV; `'P'` apresenta o PDF já gerado pelo ERP.
 *
 * Quando a impressão direta falha, o diálogo **nunca** falha em silêncio
 * (`FR-009`): mostra a causa — serviço indisponível vs. bloqueio de navegador,
 * que têm remediações completamente diferentes (`research.md`, D5) — e oferece
 * o mesmo PDF como alternativa.
 *
 * Só aparece em `FATURAR`: suspender não emite documento fiscal.
 */
export interface DialogoDocumentoFiscalProps {
  readonly notaFiscal: NotaFiscalResposta;
  /** `SessaoUsuario.TipoImpressao` (feature 002). */
  readonly tipoImpressao: TipoImpressao;
  /** `SessaoUsuario.CadMaqHost`; vazio cai no default do PDV atual. */
  readonly cadMaqHost: string;
  readonly onFechar: () => void;
  /** Injetável para o teste não tocar a rede local do PDV. */
  readonly impressaoDeps?: ImpressaoDeps;
}

type EstadoApresentacao =
  | { readonly tipo: 'imprimindo' }
  | { readonly tipo: 'impresso'; readonly avisoDeHost: string | null }
  /** Caminho do PDF: escolhido por configuração (`'P'`) ou por fallback. */
  | { readonly tipo: 'pdf'; readonly falhaDaImpressao: string | null };

function avisoDeHostPadrao(resultado: ResultadoImpressao): string | null {
  return resultado.usouHostPadrao
    ? `O PDV não tem host de impressão configurado; foi usado o padrão ${HOST_IMPRESSAO_PADRAO}.`
    : null;
}

export function DialogoDocumentoFiscal({
  notaFiscal,
  tipoImpressao,
  cadMaqHost,
  onFechar,
  impressaoDeps,
}: DialogoDocumentoFiscalProps): ReactElement {
  const mecanismo = decidirMecanismoImpressao(tipoImpressao);

  const [estado, setEstado] = useState<EstadoApresentacao>(
    mecanismo === 'direta' ? { tipo: 'imprimindo' } : { tipo: 'pdf', falhaDaImpressao: null },
  );

  // A impressão direta é um efeito colateral que só pode acontecer **uma vez**
  // por nota: sem esta trava, a remontagem do StrictMode mandaria o mesmo XML
  // duas vezes ao serviço local e sairiam dois cupons.
  const jaImprimiu = useRef(false);

  useEffect(() => {
    if (mecanismo !== 'direta' || jaImprimiu.current) {
      return;
    }
    jaImprimiu.current = true;

    let cancelado = false;

    void imprimirNFCeLocal(notaFiscal.XMLImpressao, cadMaqHost, impressaoDeps).then((resultado) => {
      if (cancelado) {
        return;
      }
      setEstado(
        resultado.estado === 'impresso'
          ? { tipo: 'impresso', avisoDeHost: avisoDeHostPadrao(resultado) }
          : { tipo: 'pdf', falhaDaImpressao: resultado.mensagem },
      );
    });

    return () => {
      cancelado = true;
    };
  }, [cadMaqHost, impressaoDeps, mecanismo, notaFiscal.XMLImpressao]);

  const pdfHref = `data:application/pdf;base64,${notaFiscal.PDFImpressao}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-lg"
      data-testid="dialogo-documento-fiscal"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Documento fiscal"
        className="flex w-full max-w-[440px] flex-col gap-base rounded-3xl bg-background p-lg shadow-lg"
      >
        <header className="flex items-center gap-sm">
          <span className="flex size-[42px] shrink-0 items-center justify-center rounded-full bg-secondary">
            {estado.tipo === 'impresso' ? (
              <CircleCheck className="size-5 text-[var(--cc-color-up)]" aria-hidden="true" />
            ) : (
              <FileText className="size-5 text-[var(--cc-color-body)]" aria-hidden="true" />
            )}
          </span>
          <h2 className="text-lg font-semibold">Venda finalizada</h2>
        </header>

        {estado.tipo === 'imprimindo' && (
          <p className="flex items-center gap-xs text-[var(--cc-color-body)]">
            <Printer className="size-4" aria-hidden="true" />
            Enviando o cupom para a impressora do caixa…
          </p>
        )}

        {estado.tipo === 'impresso' && (
          <div className="flex flex-col gap-xs">
            <p className="text-[var(--cc-color-body)]">Cupom enviado para impressão.</p>
            {estado.avisoDeHost !== null && (
              <p className="text-sm text-[var(--cc-color-muted)]">{estado.avisoDeHost}</p>
            )}
          </div>
        )}

        {estado.tipo === 'pdf' && (
          <div className="flex flex-col gap-sm">
            {estado.falhaDaImpressao !== null && (
              <p
                role="alert"
                className="flex items-start gap-xs rounded-lg bg-secondary p-sm text-[var(--cc-color-down)]"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {estado.falhaDaImpressao}
              </p>
            )}
            <p className="text-[var(--cc-color-body)]">
              O documento fiscal está pronto para visualização ou download.
            </p>
            <a
              href={pdfHref}
              download="nfce.pdf"
              data-testid="link-pdf-documento-fiscal"
              className="flex h-10 items-center justify-center gap-xs rounded-full bg-primary text-md font-semibold text-primary-foreground"
            >
              <FileText className="size-4" aria-hidden="true" />
              Abrir/baixar o PDF
            </a>
          </div>
        )}

        <footer className="flex justify-end">
          <Button variant="secondary" onClick={onFechar} data-testid="fechar-documento-fiscal">
            Concluir
          </Button>
        </footer>
      </div>
    </div>
  );
}

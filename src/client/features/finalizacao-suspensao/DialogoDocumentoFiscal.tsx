import { AlertTriangle, Check, FileText, Printer } from 'lucide-react';
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
 * **Anatomia**: o Pencil não desenhou um modal próprio para o documento fiscal;
 * este segue nó a nó o "Modal pagamento aprovado TEF" (`A9MNZI`), que é o modal
 * de "operação concluída" do produto — cartão de 480px com raio 24 e hairline,
 * cabeçalho de 78px com borda inferior, corpo de 32/24 com ícone circular de
 * 96px, e rodapé de 60px com borda superior e ação centralizada.
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

  // ESC fecha o modal (pedido do usuário, 2026-09-02). Só aqui: fechar é uma
  // saída segura — a venda já foi emitida e o PDF continua disponível pelo
  // ERP. O diálogo de reenvio não ganha o mesmo atalho de propósito; lá a
  // tecla precisa ser uma decisão consciente do operador (`FR-004`).
  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent): void => {
      if (evento.key === 'Escape') {
        onFechar();
      }
    };
    window.addEventListener('keydown', aoTeclar);
    return () => {
      window.removeEventListener('keydown', aoTeclar);
    };
  }, [onFechar]);

  const pdfHref = `data:application/pdf;base64,${notaFiscal.PDFImpressao}`;
  const houveFalha = estado.tipo === 'pdf' && estado.falhaDaImpressao !== null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-lg"
      data-testid="dialogo-documento-fiscal"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Documento fiscal"
        className="flex w-full max-w-[480px] flex-col overflow-hidden rounded-3xl border border-border bg-card"
      >
        <header className="flex h-[78px] shrink-0 items-center gap-sm border-b border-border px-lg">
          <span
            className={
              houveFalha
                ? 'flex size-[42px] shrink-0 items-center justify-center rounded-full bg-[var(--cc-color-warning-soft)]'
                : 'flex size-[42px] shrink-0 items-center justify-center rounded-full bg-[var(--cc-color-up-soft)]'
            }
          >
            {houveFalha ? (
              <AlertTriangle
                className="size-5 text-[var(--cc-color-accent-yellow)]"
                aria-hidden="true"
              />
            ) : (
              <Check className="size-5 text-[var(--cc-color-up)]" aria-hidden="true" />
            )}
          </span>
          <span className="flex flex-col gap-[2px]">
            <strong className="text-md font-semibold text-foreground">Venda finalizada</strong>
            <span className="text-sm text-[var(--cc-color-up)]">NFCe autorizada com sucesso</span>
          </span>
        </header>

        <div className="flex flex-col items-center gap-lg px-lg py-xl">
          <span
            className={
              houveFalha
                ? 'flex size-24 items-center justify-center rounded-full bg-[var(--cc-color-warning-soft)]'
                : 'flex size-24 items-center justify-center rounded-full bg-[var(--cc-color-up-soft)]'
            }
          >
            {estado.tipo === 'imprimindo' && (
              <Printer className="size-14 text-[var(--cc-color-body)]" aria-hidden="true" />
            )}
            {estado.tipo === 'impresso' && (
              <Check className="size-14 text-[var(--cc-color-up)]" aria-hidden="true" />
            )}
            {estado.tipo === 'pdf' && (
              <FileText
                className={
                  houveFalha
                    ? 'size-14 text-[var(--cc-color-accent-yellow)]'
                    : 'size-14 text-[var(--cc-color-up)]'
                }
                aria-hidden="true"
              />
            )}
          </span>

          <span className="flex flex-col items-center gap-xs text-center">
            <strong className="text-lg font-semibold text-foreground">
              {estado.tipo === 'imprimindo' && 'Enviando para a impressora'}
              {estado.tipo === 'impresso' && 'Cupom enviado para impressão'}
              {estado.tipo === 'pdf' && 'Documento fiscal disponível'}
            </strong>

            {estado.tipo === 'imprimindo' && (
              <span className="text-sm text-[var(--cc-color-body)]">
                Aguarde o cupom sair na impressora do caixa.
              </span>
            )}
            {estado.tipo === 'impresso' && estado.avisoDeHost !== null && (
              <span className="text-sm text-[var(--cc-color-muted)]">{estado.avisoDeHost}</span>
            )}
            {estado.tipo === 'pdf' && (
              <span className="text-sm text-[var(--cc-color-body)]">
                O documento fiscal está pronto para visualização ou download.
              </span>
            )}
          </span>

          {estado.tipo === 'pdf' && estado.falhaDaImpressao !== null && (
            <p
              role="alert"
              className="flex w-full items-start gap-xs rounded-2xl border border-border bg-[var(--cc-color-surface-soft)] p-base text-sm text-[var(--cc-color-body)]"
            >
              <AlertTriangle
                className="mt-[2px] size-4 shrink-0 text-[var(--cc-color-accent-yellow)]"
                aria-hidden="true"
              />
              {estado.falhaDaImpressao}
            </p>
          )}

          {estado.tipo === 'pdf' && (
            <a
              href={pdfHref}
              download="nfce.pdf"
              data-testid="link-pdf-documento-fiscal"
              className="flex h-11 w-full items-center justify-center gap-xs rounded-full bg-primary text-md font-semibold text-primary-foreground"
            >
              <FileText className="size-4" aria-hidden="true" />
              Abrir/baixar o PDF
            </a>
          )}
        </div>

        <footer className="flex h-[60px] shrink-0 items-center justify-center border-t border-border px-lg">
          <Button
            variant="secondary"
            className="h-9 rounded-full px-lg"
            onClick={onFechar}
            data-testid="fechar-documento-fiscal"
          >
            Concluir
          </Button>
        </footer>
      </div>
    </div>
  );
}

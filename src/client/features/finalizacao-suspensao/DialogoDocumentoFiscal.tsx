import { AlertTriangle, ExternalLink, FileText, Printer } from 'lucide-react';
import { gooeyToast } from 'goey-toast';
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import {
  decidirMecanismoImpressao,
  type TipoImpressao,
} from '../../domain/finalizacaoVenda/decidirMecanismoImpressao';
import { abrirPdfNFCe } from '../../services/impressao/abrirPdfNFCe';
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
 * serviço local do PDV; `'P'` abre o PDF numa aba nova.
 *
 * **O caminho feliz não tem modal** (pedido do usuário, 2026-09-02). Fechar um
 * diálogo que só diz "deu certo" é trabalho que o operador de caixa faz dezenas
 * de vezes por turno sem receber nada em troca. O modal aparece só quando ele
 * precisa **decidir ou saber** de algo:
 *
 * 1. enquanto o serviço de impressão local não respondeu (a venda já foi
 *    emitida, e o operador precisa saber por que a tela ainda não liberou);
 * 2. quando a impressão direta falhou — aí ele escolhe abrir o PDF
 *    (`FR-009`: nunca falhar em silêncio);
 * 3. quando o navegador recusou a aba do PDF, que exige um clique de verdade.
 *
 * Erro de transmissão da própria NFCe não passa por aqui: é `falha-negocio` da
 * máquina de estados, e quem o mostra é `DialogoErroFaturamento`.
 *
 * **Anatomia**: o Pencil não desenhou um modal próprio para o documento fiscal;
 * este segue nó a nó o "Modal pagamento aprovado TEF" (`A9MNZI`) — cartão de
 * 480px com raio 24 e hairline, cabeçalho de 78px com borda inferior, corpo de
 * 32/24 com ícone circular de 96px, e rodapé de 60px com borda superior.
 */
export interface DialogoDocumentoFiscalProps {
  readonly notaFiscal: NotaFiscalResposta;
  /** `SessaoUsuario.TipoImpressao` (feature 002). */
  readonly tipoImpressao: TipoImpressao;
  /** `SessaoUsuario.CadMaqHost`; vazio cai no default do PDV atual. */
  readonly cadMaqHost: string;
  /** Encerra a entrega e devolve a máquina de estados a `ocioso`. */
  readonly onFechar: () => void;
  /** Injetável para o teste não tocar a rede local do PDV. */
  readonly impressaoDeps?: ImpressaoDeps;
  /** Injetável para o teste não abrir aba de verdade. */
  readonly abrirPdf?: typeof abrirPdfNFCe;
}

type EstadoEntrega =
  /** Conversando com a impressora — único estado de espera com modal. */
  | { readonly tipo: 'imprimindo' }
  /** Impressão direta falhou: o operador decide se abre o PDF (`FR-009`). */
  | { readonly tipo: 'falha-impressao'; readonly mensagem: string }
  /** A aba do PDF foi recusada pelo navegador; precisa de um clique real. */
  | { readonly tipo: 'pdf-bloqueado' }
  /** Entregue — nada a mostrar. */
  | { readonly tipo: 'concluida' };

function avisoDeHostPadrao(resultado: ResultadoImpressao): string | null {
  return resultado.usouHostPadrao
    ? `O PDV não tem host de impressão configurado; foi usado o padrão ${HOST_IMPRESSAO_PADRAO}.`
    : null;
}

const MENSAGEM_PDF_INVALIDO =
  'O ERP devolveu um PDF que o navegador não conseguiu abrir. A venda foi emitida; ' +
  'reimprima o cupom pelo próprio ERP.';

export function DialogoDocumentoFiscal({
  notaFiscal,
  tipoImpressao,
  cadMaqHost,
  onFechar,
  impressaoDeps,
  abrirPdf = abrirPdfNFCe,
}: DialogoDocumentoFiscalProps): ReactElement | null {
  const mecanismo = decidirMecanismoImpressao(tipoImpressao);

  const [estado, setEstado] = useState<EstadoEntrega>(
    mecanismo === 'direta' ? { tipo: 'imprimindo' } : { tipo: 'concluida' },
  );

  // A entrega é um efeito colateral que só pode acontecer **uma vez** por nota:
  // sem esta trava, a remontagem do StrictMode mandaria o mesmo XML duas vezes
  // ao serviço local (dois cupons) ou abriria duas abas do mesmo PDF.
  const jaEntregou = useRef(false);

  const abrirEmNovaAba = useCallback((): void => {
    const resultado = abrirPdf(notaFiscal.PDFImpressao);

    if (resultado.estado === 'aberto') {
      setEstado({ tipo: 'concluida' });
      onFechar();
      return;
    }
    if (resultado.estado === 'pdf-invalido') {
      gooeyToast.error(MENSAGEM_PDF_INVALIDO);
      setEstado({ tipo: 'concluida' });
      onFechar();
      return;
    }
    setEstado({ tipo: 'pdf-bloqueado' });
  }, [abrirPdf, notaFiscal.PDFImpressao, onFechar]);

  useEffect(() => {
    if (jaEntregou.current) {
      return;
    }
    jaEntregou.current = true;

    // `'P'`: abre a aba e sai de cena, sem modal nenhum.
    if (mecanismo === 'pdf') {
      abrirEmNovaAba();
      return;
    }

    let cancelado = false;

    void imprimirNFCeLocal(notaFiscal.XMLImpressao, cadMaqHost, impressaoDeps).then((resultado) => {
      if (cancelado) {
        return;
      }

      if (resultado.estado === 'impresso') {
        // Cupom saiu: nada a decidir, nada a fechar. O aviso de host default
        // vira toast — é informação útil de configuração, não um passo do
        // fluxo que mereça segurar o operador.
        const aviso = avisoDeHostPadrao(resultado);
        if (aviso !== null) {
          gooeyToast.warning(aviso);
        }
        setEstado({ tipo: 'concluida' });
        onFechar();
        return;
      }

      setEstado({ tipo: 'falha-impressao', mensagem: resultado.mensagem });
    });

    return () => {
      cancelado = true;
    };
  }, [abrirEmNovaAba, cadMaqHost, impressaoDeps, mecanismo, notaFiscal.XMLImpressao, onFechar]);

  // ESC fecha o modal (pedido do usuário, 2026-09-02): a venda já foi emitida e
  // o PDF continua disponível pelo ERP, então sair é seguro. O diálogo de
  // reenvio não ganha o mesmo atalho — lá a tecla precisa ser uma decisão
  // consciente do operador (`FR-004`).
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

  if (estado.tipo === 'concluida') {
    return null;
  }

  const emEspera = estado.tipo === 'imprimindo';

  return (
    <div
      className="cc-backdrop-entra fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-lg"
      data-testid="dialogo-documento-fiscal"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Documento fiscal"
        className="cc-modal-entra flex w-full max-w-[480px] flex-col overflow-hidden rounded-3xl border border-border bg-card"
      >
        <header className="flex h-[78px] shrink-0 items-center gap-sm border-b border-border px-lg">
          <span
            className={
              emEspera
                ? 'flex size-[42px] shrink-0 items-center justify-center rounded-full bg-secondary'
                : 'flex size-[42px] shrink-0 items-center justify-center rounded-full bg-[var(--cc-color-warning-soft)]'
            }
          >
            {emEspera ? (
              <Printer className="size-5 text-[var(--cc-color-body)]" aria-hidden="true" />
            ) : (
              <AlertTriangle
                className="size-5 text-[var(--cc-color-accent-yellow)]"
                aria-hidden="true"
              />
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
              emEspera
                ? 'flex size-24 items-center justify-center rounded-full bg-secondary'
                : 'flex size-24 items-center justify-center rounded-full bg-[var(--cc-color-warning-soft)]'
            }
          >
            {emEspera ? (
              <Printer className="size-14 text-[var(--cc-color-body)]" aria-hidden="true" />
            ) : (
              <FileText
                className="size-14 text-[var(--cc-color-accent-yellow)]"
                aria-hidden="true"
              />
            )}
          </span>

          <span className="flex flex-col items-center gap-xs text-center">
            <strong className="text-lg font-semibold text-foreground">
              {estado.tipo === 'imprimindo' && 'Enviando para a impressora'}
              {estado.tipo === 'falha-impressao' && 'Não foi possível imprimir'}
              {estado.tipo === 'pdf-bloqueado' && 'O navegador bloqueou a aba do PDF'}
            </strong>
            <span className="text-sm text-[var(--cc-color-body)]">
              {estado.tipo === 'imprimindo' && 'Aguarde o cupom sair na impressora do caixa.'}
              {estado.tipo === 'falha-impressao' &&
                'A venda foi emitida normalmente. Abra o PDF para conferir ou reimprimir.'}
              {estado.tipo === 'pdf-bloqueado' &&
                'A venda foi emitida normalmente. Abra o PDF pelo botão abaixo.'}
            </span>
          </span>

          {estado.tipo === 'falha-impressao' && (
            <p
              role="alert"
              className="flex w-full items-start gap-xs rounded-2xl border border-border bg-[var(--cc-color-surface-soft)] p-base text-sm text-[var(--cc-color-body)]"
            >
              <AlertTriangle
                className="mt-[2px] size-4 shrink-0 text-[var(--cc-color-accent-yellow)]"
                aria-hidden="true"
              />
              {estado.mensagem}
            </p>
          )}

          {!emEspera && (
            <button
              type="button"
              onClick={abrirEmNovaAba}
              data-testid="abrir-pdf-documento-fiscal"
              className="flex h-11 w-full items-center justify-center gap-xs rounded-full bg-primary text-md font-semibold text-primary-foreground"
            >
              <ExternalLink className="size-4" aria-hidden="true" />
              Abrir o PDF em outra aba
            </button>
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

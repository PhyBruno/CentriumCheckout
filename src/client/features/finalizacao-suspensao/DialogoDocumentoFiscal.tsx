import { AlertTriangle, FileText, LinkSquare, Printer } from 'reicon-react';
import { notificar } from '@/lib/notificar';
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { useFocoDeModal } from '@/lib/useFocoDeModal';
import { cn } from '@/lib/utils';
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
import { identificacaoDaNota } from './identificacaoDaNota';

/**
 * Entrega do documento fiscal ao operador (T019, `FR-007` a `FR-009`).
 *
 * O caminho é decidido pela configuração do ambiente, nunca pelo operador a
 * cada venda (`FR-008`): `TipoImpressao = 'E'` tenta a impressão direta pelo
 * serviço local do PDV; `'P'` abre o PDF numa aba nova.
 *
 * **O PDF (`'P'`) segue sem modal** (pedido do usuário, 2026-09-02): fechar um
 * diálogo que só diz "deu certo" é trabalho que o operador faz dezenas de vezes
 * por turno. A impressão direta **passou a ter** (AD-246, abaixo), mas um que
 * fecha sozinho. O modal aparece quando o operador precisa **decidir ou saber**
 * de algo:
 *
 * 1. quando o cupom foi enviado à impressora direta (`'E'`) — ver abaixo;
 * 2. quando a impressão direta falhou — aí ele escolhe abrir o PDF
 *    (`FR-009`: nunca falhar em silêncio);
 * 3. quando o navegador recusou a aba do PDF, que exige um clique de verdade.
 *
 * **Enviado, não impresso** (correção do usuário, 2026-09-17, AD-246): o
 * serviço local só aceita o XML — não devolve se o cupom de fato saiu. Por
 * isso a impressão direta sempre mostra "Enviado para a impressora", que fecha
 * sozinho em `FECHAMENTO_AUTOMATICO_MS` ou no ESC, e o rodapé oferece **sempre**
 * o PDF em nova aba (no lugar do antigo "Concluir"): é o backup do cupom para
 * o cliente quando a impressora não imprimiu.
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
  /**
   * O fundo escuro já está na tela — o "Autorizando NFCe" acabou de sair
   * (AD-244). Dispensa o fade de entrada, que partiria de zero e piscaria.
   */
  readonly fundoJaVisivel?: boolean;
}

/** Tempo até "Enviado para a impressora" fechar sozinho (AD-246). */
export const FECHAMENTO_AUTOMATICO_MS = 10_000;

type EstadoEntrega =
  /**
   * XML entregue (ou sendo entregue) ao serviço local. Não há confirmação de
   * que o cupom saiu — o modal diz "enviado" e fecha sozinho (AD-246).
   */
  | { readonly tipo: 'enviado' }
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
  fundoJaVisivel = false,
}: DialogoDocumentoFiscalProps): ReactElement | null {
  const mecanismo = decidirMecanismoImpressao(tipoImpressao);
  // `true`: sem prop de abertura — o pai só renderiza este diálogo aberto.
  const janelaRef = useFocoDeModal<HTMLDivElement>(true);

  const [estado, setEstado] = useState<EstadoEntrega>(
    mecanismo === 'direta' ? { tipo: 'enviado' } : { tipo: 'concluida' },
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
      notificar.erro(MENSAGEM_PDF_INVALIDO);
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
        // O serviço aceitou o XML — o que **não** prova que o cupom saiu
        // (AD-246). O modal "Enviado" continua na tela e fecha sozinho. O aviso
        // de host default vira toast: é informação de configuração, não um
        // passo do fluxo.
        const aviso = avisoDeHostPadrao(resultado);
        if (aviso !== null) {
          notificar.aviso(aviso);
        }
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

  // "Enviado" fecha sozinho (AD-246): sem retorno da impressora não há o que o
  // operador confirmar. A dependência é o **tipo**, não o objeto: a falha que
  // chegar antes do prazo troca o tipo e o cleanup cancela o fechamento — a
  // falha precisa ficar na tela até o operador decidir.
  const enviado = estado.tipo === 'enviado';
  useEffect(() => {
    if (!enviado) {
      return;
    }
    const temporizador = setTimeout(onFechar, FECHAMENTO_AUTOMATICO_MS);
    return () => {
      clearTimeout(temporizador);
    };
  }, [enviado, onFechar]);

  if (estado.tipo === 'concluida') {
    return null;
  }

  const emEspera = enviado;
  const identificacao = identificacaoDaNota({
    numeroNota: notaFiscal.NumeroNota,
    serieNota: notaFiscal.SerieNota,
  });

  return (
    <div
      className={cn(
        !fundoJaVisivel && 'cc-backdrop-entra',
        'fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-lg',
      )}
      data-testid="dialogo-documento-fiscal"
    >
      <div
        ref={janelaRef}
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
              {estado.tipo === 'enviado' && 'Enviado para a impressora'}
              {estado.tipo === 'falha-impressao' && 'Não foi possível imprimir'}
              {estado.tipo === 'pdf-bloqueado' && 'O navegador bloqueou a aba do PDF'}
            </strong>
            <span className="text-sm text-[var(--cc-color-body)]">
              {estado.tipo === 'enviado' &&
                'O cupom foi enviado à impressora do caixa. Se ele não sair, abra o PDF pelo botão abaixo. Esta janela fecha sozinha em 10 segundos.'}
              {estado.tipo === 'falha-impressao' &&
                'A venda foi emitida normalmente. Abra o PDF para conferir ou reimprimir.'}
              {estado.tipo === 'pdf-bloqueado' &&
                'A venda foi emitida normalmente. Abra o PDF pelo botão abaixo.'}
            </span>
            {/* Número e série da nota emitida (AD-238), no mesmo formato e
                estilo da nota rejeitada — omitida quando o ERP não os manda. */}
            {identificacao !== null && (
              <span
                data-testid="documento-emitido"
                className="font-mono text-sm text-[var(--cc-color-body)]"
              >
                {identificacao}
              </span>
            )}
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
        </div>

        {/* O PDF é **sempre** oferecido, no lugar do antigo "Concluir" (AD-246):
            sem retorno da impressora, é o backup do cupom para o cliente. Sair
            sem abrir continua sendo o ESC — e, no "Enviado", o prazo de 10s. */}
        <footer className="flex h-[60px] shrink-0 items-center justify-center border-t border-border px-lg">
          <Button
            className="h-9 gap-xs rounded-full px-lg"
            onClick={abrirEmNovaAba}
            data-testid="abrir-pdf-documento-fiscal"
          >
            <LinkSquare className="size-4" aria-hidden="true" />
            Abrir o PDF em outra aba
          </Button>
        </footer>
      </div>
    </div>
  );
}

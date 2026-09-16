import { AlertTriangle, LinkSquare, Sparkles, XCircle } from 'reicon-react';
import type { ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { urlExternaSegura } from '@/lib/urlExterna';
import { useFocoDeModal } from '@/lib/useFocoDeModal';
import { identificacaoDaNota } from './identificacaoDaNota';

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

/**
 * Retorno estruturado da rejeição (contrato de 2026-09-14, AD-238). Tudo
 * opcional: o desfecho `N` e o ERP anterior ao contrato não trazem sugestão nem
 * link.
 */
export interface RetornoDaSefaz {
  readonly codigoErro: number | null;
  /** Texto da CentriumIA — exibido **só como texto**, nunca como HTML. */
  readonly sugestaoIA: string | null;
  /** Revalidado aqui (`urlExternaSegura`) antes de virar `href`. */
  readonly urlChamadas: string | null;
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

export interface DialogoErroFaturamentoProps {
  readonly mensagem: string;
  readonly onFechar: () => void;
  /** Default `NAO_EMITIDA`: o desfecho que este diálogo já cobria sozinho. */
  readonly desfecho?: Desfecho;
  readonly documento?: DocumentoRejeitado;
  /** Só em `REJEITADA` (AD-238). */
  readonly retorno?: RetornoDaSefaz;
}

export function DialogoErroFaturamento({
  mensagem,
  onFechar,
  desfecho = 'NAO_EMITIDA',
  documento,
  retorno,
}: DialogoErroFaturamentoProps): ReactElement {
  const copia = COPIA[desfecho];
  const identificacao = identificacaoDaNota(documento);
  const rejeitada = desfecho === 'REJEITADA';
  const codigoErro = retorno?.codigoErro ?? null;
  const sugestao = (retorno?.sugestaoIA ?? '').trim() === '' ? null : (retorno?.sugestaoIA ?? null);
  // Segunda checagem, além da do mapper: o `href` só existe se esta função o
  // aprovar aqui, qualquer que seja o caminho por onde a URL chegou.
  const linkDoErp = urlExternaSegura(retorno?.urlChamadas);
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
        className="cc-modal-entra flex max-h-full w-full max-w-[480px] flex-col overflow-hidden rounded-3xl border border-border bg-card"
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

        {/* Rola por dentro: a sugestão da IA pode ter vários parágrafos, e o
            rodapé com o botão de fechar não pode sair da tela. */}
        <div className="flex min-h-0 flex-col items-center gap-lg overflow-y-auto px-lg py-xl">
          <span className="flex size-24 shrink-0 items-center justify-center rounded-full bg-[var(--cc-color-down-soft)]">
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

          {/* Bloco do motivo. Em `REJEITADA` ele ganha título e o código da
              SEFAZ em campo próprio (AD-238); o Pencil não desenha esse estado,
              então reaproveita a caixa de mensagem que já existia. */}
          <div
            role="alert"
            data-testid="erro-finalizacao"
            className="flex w-full items-start gap-xs rounded-2xl border border-border bg-[var(--cc-color-surface-soft)] p-base text-sm text-[var(--cc-color-body)]"
          >
            <AlertTriangle
              className="mt-[2px] size-4 shrink-0 text-destructive"
              aria-hidden="true"
            />
            <span className="flex min-w-0 flex-col gap-[2px]">
              {rejeitada && (
                <strong className="font-semibold text-foreground">Retorno da SEFAZ</strong>
              )}
              {codigoErro !== null && (
                <span data-testid="codigo-sefaz" className="font-mono">
                  Código {codigoErro}
                </span>
              )}
              {/* Texto puro: o mapper já tirou o HTML (pendência 50), e o
                  React escapa o que sobrar. */}
              <span className="whitespace-pre-line break-words">{mensagem}</span>
            </span>
          </div>

          {rejeitada && sugestao !== null && (
            <section
              data-testid="sugestao-ia"
              aria-label="Sugestão de correção"
              className="flex w-full items-start gap-xs rounded-2xl border border-border bg-secondary p-base text-sm text-[var(--cc-color-body)]"
            >
              <Sparkles className="mt-[2px] size-4 shrink-0 text-primary" aria-hidden="true" />
              <span className="flex min-w-0 flex-col gap-[2px]">
                <strong className="font-semibold text-foreground">Sugestão de correção</strong>
                {/* **Nunca** `dangerouslySetInnerHTML`: o texto vem de uma IA e
                    é exibido como texto. `whitespace-pre-line` mantém as
                    quebras de linha que ela escreveu. */}
                <span data-testid="sugestao-ia-texto" className="whitespace-pre-line break-words">
                  {sugestao}
                </span>
              </span>
            </section>
          )}

          {rejeitada && linkDoErp !== null && (
            <a
              href={linkDoErp}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-xs text-sm font-semibold text-primary underline-offset-4 hover:underline"
            >
              <LinkSquare className="size-4 shrink-0" aria-hidden="true" />
              Abrir no ERP
            </a>
          )}
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

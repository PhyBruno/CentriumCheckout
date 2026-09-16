import { AlertTriangle, LinkSquare, Sparkles, XCircle } from 'reicon-react';
import { useEffect, type ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { urlExternaSegura } from '@/lib/urlExterna';
import { useFocoDeModal } from '@/lib/useFocoDeModal';
import { identificacaoDoRascunho } from './identificacaoDaNota';

/**
 * Desfechos ruins do envio da venda ao ERP (pedido do usuário, 2026-09-02;
 * reorganizado em 2026-09-16, AD-239).
 *
 * Substitui o texto que antes ficava embaixo do botão de finalizar: uma venda
 * **não emitida** é o desfecho mais grave do fluxo, e uma linha de texto ao pé
 * do botão é fácil demais de não ver.
 *
 * Um componente só para os quatro desfechos porque a anatomia é a mesma —
 * moldura, foco, bloco de motivo, botão — e o que muda é a cópia e o que
 * acontece ao fechar. Quatro diálogos duplicariam acessibilidade e layout para
 * trocar frases, e divergiriam no primeiro ajuste visual.
 *
 * Mesma anatomia do "Modal pagamento aprovado TEF" (`A9MNZI`) do Pencil, na
 * família de erro. O Pencil não desenha nó próprio para nenhum destes estados
 * (app fechado em 2026-09-16; conferido no `.pen` em 2026-09-10): a variante
 * reusa esta moldura.
 */
export type Desfecho =
  /**
   * Falha **técnica** com resposta do ERP (HTTP, sessão, corpo sem desfecho): a
   * primeira tentativa provadamente não gerou NFCe (`research.md`, D2), e o
   * reenvio é livre.
   */
  | 'NAO_EMITIDA'
  /**
   * O ERP **validou e recusou** a venda — saldo, regra de NFCe (AD-239). Não é
   * erro na nota: é a venda que, como está, não passa. Tom de aviso, e não de
   * erro, porque nada quebrou e o operador tem o que fazer.
   */
  | 'VENDA_RECUSADA'
  /**
   * O ERP **gravou** a NFCe e a SEFAZ não autorizou. Não há o que corrigir e
   * reenviar daqui: a nota já existe do outro lado, e fechar libera o caixa.
   */
  | 'REJEITADA'
  /**
   * Cenário tributário não encontrado (AD-239): cadastro fiscal do ERP. Como na
   * rejeição, fechar libera o caixa — não há correção possível no Checkout.
   */
  | 'CENARIO_TRIBUTARIO';

/** Onde a recusa aconteceu — decide o verbo da cópia (AD-239). */
export type ContextoDoDesfecho = 'FATURAR' | 'SUSPENDER' | 'PAGAMENTO';

/** Rascunho no ERP: é por ele que o operador acha o documento lá (AD-239). */
export interface RascunhoNoErp {
  readonly numeroRascunho: number | null;
  readonly serieRascunho: string | null;
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
  readonly tituloDoMotivo: string;
  readonly rotuloBotao: string;
}

/** O verbo da ação que o operador repete, por contexto. */
const TENTAR_DE_NOVO: Record<ContextoDoDesfecho, string> = {
  FATURAR: 'finalize a venda de novo',
  SUSPENDER: 'cancele a venda de novo',
  PAGAMENTO: 'informe o pagamento de novo',
};

const MOTIVO_DO_ERP = 'Motivo apontado pelo ERP';

function copiaDoDesfecho(desfecho: Desfecho, contexto: ContextoDoDesfecho): CopiaDoDesfecho {
  switch (desfecho) {
    case 'NAO_EMITIDA':
      return {
        rotuloAcessivel:
          contexto === 'SUSPENDER' ? 'Falha ao suspender a venda' : 'Falha ao emitir a NFCe',
        tituloCabecalho: contexto === 'SUSPENDER' ? 'Venda não suspensa' : 'NFCe não emitida',
        subtituloCabecalho: 'O envio não foi concluído',
        chamada: 'A venda continua aberta no checkout',
        explicacao: `Confira o que o ERP respondeu e ${TENTAR_DE_NOVO[contexto]}.`,
        tituloDoMotivo: 'Resposta do ERP',
        rotuloBotao: 'Entendi',
      };

    case 'VENDA_RECUSADA':
      return {
        rotuloAcessivel:
          contexto === 'PAGAMENTO' ? 'Pagamento recusado pelo ERP' : 'Venda recusada pelo ERP',
        tituloCabecalho:
          contexto === 'PAGAMENTO' ? 'Pagamento não aceito' : 'Venda não aceita pelo ERP',
        subtituloCabecalho:
          contexto === 'PAGAMENTO' ? 'A forma não foi aplicada' : 'A venda precisa de ajuste',
        chamada: 'A venda continua aberta no checkout',
        explicacao: `Ajuste o que o ERP apontou e ${TENTAR_DE_NOVO[contexto]}.`,
        tituloDoMotivo: MOTIVO_DO_ERP,
        rotuloBotao: 'Entendi',
      };

    case 'REJEITADA':
      return {
        rotuloAcessivel: 'NFCe rejeitada pelo ERP',
        tituloCabecalho: 'NFCe rejeitada',
        subtituloCabecalho: 'A SEFAZ não autorizou a nota',
        chamada: 'Corrija a nota no ERP',
        // Anuncia a limpeza **antes** de ela acontecer: o operador precisa saber
        // que vai perder a tela ao fechar, e que isso é o comportamento correto.
        explicacao:
          'Localize o rascunho abaixo no ERP para corrigir e transmitir de novo. Ao fechar, o checkout fica livre para a próxima venda.',
        tituloDoMotivo: 'Motivo da rejeição',
        rotuloBotao: 'Fechar e iniciar uma nova venda',
      };

    case 'CENARIO_TRIBUTARIO':
      return {
        rotuloAcessivel: 'Cenário tributário não encontrado',
        tituloCabecalho: 'Cenário tributário não encontrado',
        subtituloCabecalho: 'Correção no cadastro fiscal do ERP',
        chamada: 'Não há o que corrigir no Checkout',
        explicacao:
          'O ERP precisa do cenário tributário cadastrado para emitir esta venda. Ao fechar, o checkout fica livre para a próxima venda.',
        tituloDoMotivo: MOTIVO_DO_ERP,
        rotuloBotao: 'Fechar e iniciar uma nova venda',
      };
  }
}

export interface DialogoErroFaturamentoProps {
  /** Um motivo, ou vários — o ERP recusa a validação com uma lista (`FR-005` da 014). */
  readonly mensagem: string | readonly string[];
  readonly onFechar: () => void;
  /** Default `NAO_EMITIDA`: o desfecho que este diálogo cobria sozinho. */
  readonly desfecho?: Desfecho;
  /** Default `FATURAR`. */
  readonly contexto?: ContextoDoDesfecho;
  /** Rascunho a procurar no ERP — só nos desfechos que mandam o operador lá. */
  readonly rascunho?: RascunhoNoErp;
  /** Só em `REJEITADA` (AD-238). */
  readonly retorno?: RetornoDaSefaz;
}

export function DialogoErroFaturamento({
  mensagem,
  onFechar,
  desfecho = 'NAO_EMITIDA',
  contexto = 'FATURAR',
  rascunho,
  retorno,
}: DialogoErroFaturamentoProps): ReactElement {
  const copia = copiaDoDesfecho(desfecho, contexto);
  const motivos = typeof mensagem === 'string' ? [mensagem] : mensagem;
  const identificacao = identificacaoDoRascunho(rascunho);
  const rejeitada = desfecho === 'REJEITADA';
  // Aviso, e não erro: a validação recusada é a venda que precisa de ajuste —
  // nada quebrou, e o vermelho de falha treinaria o operador a ignorá-lo.
  const tomDeAviso = desfecho === 'VENDA_RECUSADA';
  const Icone = tomDeAviso ? AlertTriangle : XCircle;
  const corDoIcone = tomDeAviso ? 'text-[var(--cc-color-accent-yellow)]' : 'text-destructive';
  const fundoDoIcone = tomDeAviso
    ? 'bg-[var(--cc-color-warning-soft)]'
    : 'bg-[var(--cc-color-down-soft)]';
  const codigoErro = retorno?.codigoErro ?? null;
  const sugestao = (retorno?.sugestaoIA ?? '').trim() === '' ? null : (retorno?.sugestaoIA ?? null);
  // Segunda checagem, além da do mapper: o `href` só existe se esta função o
  // aprovar aqui, qualquer que seja o caminho por onde a URL chegou.
  const linkDoErp = urlExternaSegura(retorno?.urlChamadas);
  // `true`: sem prop de abertura — o pai só renderiza este diálogo aberto.
  const janelaRef = useFocoDeModal<HTMLDivElement>(true);

  // ESC fecha, nos quatro desfechos (pedido do usuário, 2026-09-16). Fechar é o
  // **único** desfecho deste diálogo: não há ação destrutiva escondida atrás do
  // botão — nos dois que liberam o caixa, a limpeza é a consequência anunciada
  // no próprio texto, e obrigar o mouse para ela não protege ninguém. Ouvinte de
  // `window` como nos demais modais desta base: um `onKeyDown` no backdrop só
  // dispararia com o foco dentro da janela.
  useEffect(() => {
    const aoTeclar = (evento: globalThis.KeyboardEvent): void => {
      if (evento.key === 'Escape') {
        onFechar();
      }
    };
    window.addEventListener('keydown', aoTeclar);
    return () => {
      window.removeEventListener('keydown', aoTeclar);
    };
  }, [onFechar]);

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
          <span
            className={cn(
              'flex size-[42px] shrink-0 items-center justify-center rounded-full',
              fundoDoIcone,
            )}
          >
            <Icone className={cn('size-5', corDoIcone)} aria-hidden="true" />
          </span>
          <span className="flex flex-col gap-[2px]">
            <strong className="text-md font-semibold text-foreground">
              {copia.tituloCabecalho}
            </strong>
            <span
              className={cn(
                'text-sm',
                tomDeAviso ? 'text-[var(--cc-color-body)]' : 'text-destructive',
              )}
            >
              {copia.subtituloCabecalho}
            </span>
          </span>
        </header>

        {/* Rola por dentro: a sugestão da IA pode ter vários parágrafos, e o
            rodapé com o botão de fechar não pode sair da tela. */}
        <div className="flex min-h-0 flex-col items-center gap-lg overflow-y-auto px-lg py-xl">
          <span
            className={cn(
              'flex size-24 shrink-0 items-center justify-center rounded-full',
              fundoDoIcone,
            )}
          >
            <Icone className={cn('size-14', corDoIcone)} aria-hidden="true" />
          </span>

          <span className="flex flex-col items-center gap-xs text-center">
            <strong className="text-lg font-semibold text-foreground">{copia.chamada}</strong>
            <span className="text-sm text-[var(--cc-color-body)]">{copia.explicacao}</span>
            {/* Rascunho e série: é por eles que o operador acha o documento no
                ERP — a rejeição volta com `NumeroNota: 0` (AD-239). Em
                `font-mono` como todo valor tabular do produto. */}
            {identificacao !== null && (
              <span
                data-testid="rascunho-no-erp"
                className="font-mono text-sm font-semibold text-foreground"
              >
                {identificacao}
              </span>
            )}
          </span>

          {/* Bloco do motivo, com o código da SEFAZ em campo próprio quando a
              rejeição o traz (AD-238). */}
          <div
            role="alert"
            data-testid="erro-finalizacao"
            className="flex w-full items-start gap-xs rounded-2xl border border-border bg-[var(--cc-color-surface-soft)] p-base text-sm text-[var(--cc-color-body)]"
          >
            <AlertTriangle
              className={cn('mt-[2px] size-4 shrink-0', corDoIcone)}
              aria-hidden="true"
            />
            <span className="flex min-w-0 flex-col gap-[2px]">
              <strong className="font-semibold text-foreground">{copia.tituloDoMotivo}</strong>
              {codigoErro !== null && (
                <span data-testid="codigo-sefaz" className="font-mono">
                  Código {codigoErro}
                </span>
              )}
              {/* Texto puro: o mapper já tirou o HTML (pendência 50), e o
                  React escapa o que sobrar. */}
              {motivos.map((motivo) => (
                <span key={motivo} className="whitespace-pre-line break-words">
                  {motivo}
                </span>
              ))}
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
              Consultar solução detalhada
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

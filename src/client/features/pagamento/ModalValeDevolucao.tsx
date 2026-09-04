import { Ticket, TicketCheck, TriangleAlert, X } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { acaoBloqueavel, atributosDeBloqueio, type MotivoBloqueio } from '@/lib/bloqueio';
import { cn } from '@/lib/utils';
import { DURACAO_SAIDA_MODAL_MS, usePresenca } from '@/lib/usePresenca';
import type { FormaPagamento } from '../../domain/pagamento/formaPagamento';
import { formatarCentavos } from '../../domain/precificacao/dinheiro';
import type { ExcedenteDeVale } from '../../stores/slices/pagamentoSlice';
import { useVendaStore } from '../../stores/vendaStore';

/**
 * Janela de aplicação de vale devolução a um pagamento (T040, `FR-008`/`FR-010`).
 *
 * **Desvio consciente do processo de design, declarado**: *não existe nó de vale
 * devolução no Pencil*. O `.pen` foi varrido inteiro e os únicos frames de modal
 * são DAV, cliente, vendedor, produto, menu gerencial, TEF, TEF Aprovado, PIX,
 * cadastro de cliente, recuperação de NFCe e menu de importação — nenhum vale.
 * Como não há desenho a replicar, esta janela herda o **padrão de modal já
 * estabelecido nesta base**, lido de `features/cliente/ModalBuscaCliente.tsx` e
 * `features/dav/ModalImportacaoDav.tsx`, que por sua vez derivam do nó "Modal
 * consulta de cliente" (linha 12495 do export): overlay `$ink` a 40%, cartão
 * branco de raio 24 com hairline, cabeçalho de 78px com ícone lucide de 20px num
 * disco `$surface-strong` de 42px, corpo com 24px de folga lateral, rodapé de
 * 60px com as ações à direita, e as animações `cc-backdrop-entra`/`cc-modal-entra`
 * via `usePresenca`. Nenhum valor visual aqui foi escolhido por conta própria:
 * todos vêm desse padrão herdado.
 *
 * A largura é a única medida sem precedente direto — 480px, porque o conteúdo é
 * um campo só. Os modais existentes (960/1120px) são tabelas de resultado, e
 * esticar um campo de código por 960px produziria uma faixa vazia.
 *
 * **Quando esta janela existe** (AD-149/`FR-008`): só quando a forma escolhida
 * é a de vale devolução (`FpgUtiCar = 'VDV'`). Quem decide é quem a monta
 * (`PainelPagamentoETotais`), então aqui não há estado de "forma inelegível" —
 * a janela não chega a abrir para uma forma comum.
 *
 * **Duas etapas, um só ida ao ERP** (`FR-026`): validado o ticket, se ele valer
 * mais do que falta pagar, o corpo troca para um painel de confirmação com os
 * três números (vale, faltante, perda) e o rodapé passa a oferecer "Aplicar
 * mesmo assim". A espera é feita com um `Promise` resolvido por clique, para o
 * slice decidir tudo numa passagem — sem revalidar o ticket depois da resposta.
 *
 * **Nenhuma rede aqui**: `aplicarValeDevolucao` chama `ValidaTicketDevolucao`
 * exatamente uma vez por vale (`FR-009`/`PAY-06`). O componente aciona a action,
 * responde à pergunta do excedente e lê o desfecho.
 */
export interface ModalValeDevolucaoProps {
  readonly aberto: boolean;
  readonly onFechar: () => void;
  /** Forma de vale devolução escolhida (`FpgUtiCar = 'VDV'`). */
  readonly forma: FormaPagamento;
}

export function ModalValeDevolucao({
  aberto,
  onFechar,
  forma,
}: ModalValeDevolucaoProps): ReactElement | null {
  const [codigo, setCodigo] = useState('');
  const [enviando, setEnviando] = useState(false);
  /** `null` = sem pergunta pendente; preenchido = painel de confirmação em tela. */
  const [excedente, setExcedente] = useState<ExcedenteDeVale | null>(null);
  const resolverExcedente = useRef<((confirmado: boolean) => void) | null>(null);
  const refDialogo = useRef<HTMLDivElement>(null);

  const aplicarValeDevolucao = useVendaStore((estado) => estado.aplicarValeDevolucao);

  const [abertoAnterior, setAbertoAnterior] = useState(aberto);
  if (aberto !== abertoAnterior) {
    setAbertoAnterior(aberto);
    if (aberto) {
      setCodigo('');
      setEnviando(false);
    }
  }

  // Ouvinte de `window`, como no modal de DAV: um `onKeyDown` no backdrop só
  // dispara com o foco dentro do modal, e bastaria um clique no fundo para a
  // tecla parar de funcionar. Nada foi aplicado enquanto o modal está aberto, e
  // um vale já aplicado não é desfeito ao fechar — sair é sempre seguro.
  useEffect(() => {
    if (!aberto) {
      return;
    }
    const aoTeclar = (evento: globalThis.KeyboardEvent): void => {
      if (evento.key === 'Escape') {
        onFechar();
      }
    };
    window.addEventListener('keydown', aoTeclar);
    return () => {
      window.removeEventListener('keydown', aoTeclar);
    };
  }, [aberto, onFechar]);

  const { montado, saindo } = usePresenca(aberto, DURACAO_SAIDA_MODAL_MS);

  if (!montado) {
    return null;
  }

  const codigoLimpo = codigo.trim();
  const motivoBloqueio = excedente === null ? motivoBloqueioAplicacao(codigoLimpo, enviando) : null;

  /**
   * Fecha **só quando o pagamento entrou**. Se o ERP recusar o ticket (vencido,
   * já utilizado, inexistente) o toast do slice explica e o modal permanece
   * aberto com o campo pronto — o operador quase sempre tem outro código na mão,
   * e fechar o obrigaria a reabrir para tentar de novo.
   */
  async function aplicar(): Promise<void> {
    setEnviando(true);
    let aplicado = false;
    try {
      aplicado = await aplicarValeDevolucao(forma, codigoLimpo, pedirConfirmacaoDoExcedente);
    } finally {
      setEnviando(false);
      setExcedente(null);
      resolverExcedente.current = null;
    }
    if (aplicado) {
      onFechar();
    } else {
      setCodigo('');
    }
  }

  /**
   * Mostra o painel de confirmação e **suspende** a aplicação até o operador
   * responder. O `Promise` fica pendurado num `ref` porque a resposta chega por
   * clique, num render posterior: é o padrão de "confirm como promessa", e é o
   * que permite ao slice manter a decisão numa única passagem — com o ticket já
   * validado, sem uma segunda ida ao ERP.
   */
  function pedirConfirmacaoDoExcedente(dados: ExcedenteDeVale): Promise<boolean> {
    setExcedente(dados);
    return new Promise<boolean>((resolve) => {
      resolverExcedente.current = resolve;
    });
  }

  function responderExcedente(confirmado: boolean): void {
    resolverExcedente.current?.(confirmado);
    resolverExcedente.current = null;
    setExcedente(null);
  }

  const confirmar = acaoBloqueavel(motivoBloqueio, () => {
    void aplicar();
  });

  /**
   * Prende o foco no diálogo enquanto ele está aberto (requisito de
   * acessibilidade desta feature). Tab a partir do último focável volta ao
   * primeiro, e Shift+Tab do primeiro vai ao último — sem isso o foco escapa
   * para a tela de venda por baixo, que está inerte para o operador.
   */
  function prenderFoco(evento: KeyboardEvent<HTMLDivElement>): void {
    if (evento.key !== 'Tab') {
      return;
    }
    const raiz = refDialogo.current;
    if (raiz === null) {
      return;
    }
    const focaveis = raiz.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];
    if (primeiro === undefined || ultimo === undefined) {
      return;
    }
    if (evento.shiftKey && document.activeElement === primeiro) {
      evento.preventDefault();
      ultimo.focus();
      return;
    }
    if (!evento.shiftKey && document.activeElement === ultimo) {
      evento.preventDefault();
      primeiro.focus();
    }
  }

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-start justify-center bg-[color-mix(in_srgb,var(--cc-color-ink)_40%,transparent)] p-lg',
        saindo ? 'cc-backdrop-sai' : 'cc-backdrop-entra',
      )}
      data-testid="modal-vale-devolucao"
    >
      <div
        ref={refDialogo}
        role="dialog"
        aria-modal="true"
        aria-label="Vale devolução"
        className={cn(
          'flex max-h-full w-full max-w-[480px] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-lg',
          saindo ? 'cc-modal-sai' : 'cc-modal-entra',
        )}
        onKeyDown={prenderFoco}
      >
        <header className="flex h-[78px] shrink-0 items-center justify-between gap-sm border-b border-border px-lg">
          <div className="flex items-center gap-sm">
            <span className="flex size-[42px] shrink-0 items-center justify-center rounded-full bg-secondary">
              <Ticket className="size-5 text-primary" aria-hidden="true" />
            </span>
            <div className="flex flex-col gap-[2px]">
              <h2 className="text-xl font-semibold text-foreground">Vale devolução</h2>
              <p className="text-sm font-medium text-muted-foreground">{forma.descricao}</p>
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="icon-lg"
            className="shrink-0 rounded-full"
            aria-label="Fechar"
            onClick={onFechar}
          >
            <X className="size-4.5" aria-hidden="true" />
          </Button>
        </header>

        <div className="flex flex-col gap-sm px-lg py-base">
          <label className="flex h-11 items-center gap-xs rounded-full bg-secondary px-base text-md font-medium text-foreground">
            <TicketCheck className="size-4.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">Código do vale devolução</span>
            <input
              className="h-full w-full bg-transparent font-mono tabular-nums outline-none placeholder:font-sans placeholder:text-muted-foreground"
              data-testid="campo-codigo-vale"
              autoComplete="off"
              autoFocus
              placeholder="Código do vale"
              value={codigo}
              onChange={(evento) => {
                setCodigo(evento.target.value);
              }}
              onKeyDown={(evento) => {
                // Enter confirma — o operador digita o código com o leitor
                // ou pelo teclado e não deveria precisar tirar a mão dele.
                // Passa pelo mesmo `acaoBloqueavel` do botão: bloqueado por
                // teclado explica o motivo igual a bloqueado por clique.
                if (evento.key === 'Enter') {
                  evento.preventDefault();
                  confirmar();
                }
              }}
            />
          </label>
          {excedente === null ? (
            <p className="text-sm font-medium text-muted-foreground">
              O valor do vale é validado no ERP e abatido desta forma de pagamento.
            </p>
          ) : (
            /* `FR-026`. O painel diz os três números — o que o vale vale, o que
               falta pagar e o que se perde — porque "não gera troco" sozinho não
               deixa o operador medir a consequência antes de decidir por um
               cliente que está na frente dele. */
            <div
              className="flex flex-col gap-xs rounded-lg bg-[var(--cc-color-warning-soft)] px-sm py-sm"
              data-testid="confirmar-excedente-vale"
              role="alert"
            >
              <div className="flex items-start gap-xs">
                <TriangleAlert
                  className="mt-[2px] size-4.5 shrink-0 text-[var(--cc-color-accent-yellow)]"
                  aria-hidden="true"
                />
                <p className="text-base font-semibold text-foreground">
                  Vale devolução não gera troco.
                </p>
              </div>
              <p className="text-sm font-medium text-muted-foreground">
                O vale é de{' '}
                <strong className="font-mono tabular-nums text-foreground">
                  {formatarCentavos(excedente.valorTicket)}
                </strong>{' '}
                e faltam{' '}
                <strong className="font-mono tabular-nums text-foreground">
                  {formatarCentavos(excedente.saldoRestante)}
                </strong>{' '}
                nesta venda. A diferença de{' '}
                <strong
                  className="font-mono tabular-nums text-destructive"
                  data-testid="excedente-perdido"
                >
                  {formatarCentavos(excedente.excedente)}
                </strong>{' '}
                será perdida: o ERP baixa o ticket inteiro no faturamento, e não há devolução do que
                sobra.
              </p>
            </div>
          )}
        </div>

        <footer className="flex h-[60px] shrink-0 items-center justify-end gap-[10px] border-t border-border px-lg">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-9 w-28 gap-xs rounded-full text-sm font-semibold"
            data-testid="cancelar-vale-devolucao"
            // Com a pergunta do excedente em tela, "Cancelar" responde **não** e
            // devolve o operador ao campo, em vez de fechar a janela: ele acabou
            // de digitar o código e a saída provável é tentar outro, não desistir
            // do vale.
            onClick={() => {
              if (excedente === null) {
                onFechar();
              } else {
                responderExcedente(false);
              }
            }}
          >
            <X className="size-3.5" aria-hidden="true" />
            Cancelar
          </Button>
          {excedente === null ? (
            <Button
              type="button"
              className="h-11 w-[156px] gap-xs rounded-full text-md font-bold"
              data-testid="confirmar-vale-devolucao"
              {...atributosDeBloqueio(motivoBloqueio)}
              onClick={confirmar}
            >
              <TicketCheck className="size-4.5" aria-hidden="true" />
              Aplicar vale
            </Button>
          ) : (
            <Button
              type="button"
              className="h-11 gap-xs rounded-full px-base text-md font-bold"
              data-testid="confirmar-excedente-vale-devolucao"
              onClick={() => {
                responderExcedente(true);
              }}
            >
              <TicketCheck className="size-4.5" aria-hidden="true" />
              Aplicar mesmo assim
            </Button>
          )}
        </footer>
      </div>
    </div>
  );
}

/**
 * Um só motivo por vez, na ordem em que o operador consegue agir: primeiro o que
 * exige digitar, depois o que exige esperar. Devolver `null` é o que libera a
 * ação (`lib/bloqueio.ts`).
 *
 * Não há mais motivo de "forma inelegível": o modal **só existe** quando a forma
 * escolhida é a de vale devolução (`FpgUtiCar = 'VDV'`), e quem decide isso é
 * quem o monta. As recusas do ERP — vencido, ainda não emitido, já utilizado no
 * documento N, inexistente — chegam por toast com a mensagem do próprio ERP,
 * porque só ele as distingue.
 */
function motivoBloqueioAplicacao(codigoLimpo: string, enviando: boolean): MotivoBloqueio {
  if (codigoLimpo === '') {
    return 'Informe o código do vale devolução.';
  }
  if (enviando) {
    return 'O vale informado está sendo validado no ERP. Aguarde o resultado.';
  }
  return null;
}

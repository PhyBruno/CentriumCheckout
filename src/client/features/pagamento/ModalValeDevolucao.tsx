import { CircleCheck, Ticket, TicketCheck, X } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { acaoBloqueavel, atributosDeBloqueio, type MotivoBloqueio } from '@/lib/bloqueio';
import { cn } from '@/lib/utils';
import { DURACAO_SAIDA_MODAL_MS, usePresenca } from '@/lib/usePresenca';
import type { FormaPagamento } from '../../domain/pagamento/formaPagamento';
import { ehElegivelParaVale } from '../../domain/pagamento/valeDevolucao';
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
 * **Elegibilidade (AD-048/`FR-010`)**: `fpgUtiCar` vazio significa **elegível**.
 * Forma inelegível não deixa o controle inerte — ele fica bloqueado
 * *explicando o motivo* (`lib/bloqueio.ts`), porque `disabled` nativo não emite
 * evento e o operador ficaria sem saber por que o clique não fez nada.
 *
 * **Nenhuma rede aqui**: `aplicarValeDevolucao` é a única action assíncrona do
 * slice e chama `ValidaTicketDevolucao` exatamente uma vez por vale
 * (`FR-009`/`PAY-06`). O componente aciona a action e lê o resultado no estado.
 */
export interface ModalValeDevolucaoProps {
  readonly aberto: boolean;
  readonly onFechar: () => void;
  /** Forma do pagamento alvo — é ela que decide a elegibilidade (AD-048). */
  readonly forma: FormaPagamento;
  /** Pagamento que recebe o vale; o vínculo é feito pelo slice. */
  readonly idPagamento: string;
}

export function ModalValeDevolucao({
  aberto,
  onFechar,
  forma,
  idPagamento,
}: ModalValeDevolucaoProps): ReactElement | null {
  const [codigo, setCodigo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const refDialogo = useRef<HTMLDivElement>(null);

  const aplicarValeDevolucao = useVendaStore((estado) => estado.aplicarValeDevolucao);
  // O desfecho é lido do estado, não de um retorno: `aplicarValeDevolucao`
  // devolve `Promise<void>` e já emite o toast do vale inválido. Quem afirma que
  // deu certo é o `ticketDevolucao` gravado no pagamento — a mesma informação
  // que a finalização vai enviar ao ERP, não uma cópia paralela dela.
  const ticketAplicado =
    useVendaStore(
      (estado) =>
        estado.pagamentos.find((pagamento) => pagamento.idPagamento === idPagamento)
          ?.ticketDevolucao,
    ) ?? null;

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

  const elegivel = ehElegivelParaVale(forma);
  const codigoLimpo = codigo.trim();
  const motivoBloqueio = motivoBloqueioAplicacao(forma, elegivel, codigoLimpo, enviando);

  async function aplicar(): Promise<void> {
    setEnviando(true);
    try {
      await aplicarValeDevolucao(codigoLimpo, idPagamento);
    } finally {
      setEnviando(false);
    }
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
          {ticketAplicado === null ? (
            <>
              {elegivel ? null : (
                <p
                  className="rounded-lg bg-muted px-sm py-xs text-sm font-medium text-destructive"
                  data-testid="vale-forma-inelegivel"
                >
                  {MOTIVO_FORMA_INELEGIVEL}
                </p>
              )}
              <label className="flex h-11 items-center gap-xs rounded-full bg-secondary px-base text-md font-medium text-foreground">
                <TicketCheck
                  className="size-4.5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
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
              <p className="text-sm font-medium text-muted-foreground">
                O valor do vale é validado no ERP e abatido desta forma de pagamento.
              </p>
            </>
          ) : (
            <div
              className="flex items-center gap-sm rounded-lg bg-muted px-sm py-sm"
              data-testid="vale-aplicado"
            >
              <CircleCheck className="size-5 shrink-0 text-primary" aria-hidden="true" />
              <div className="flex min-w-0 flex-col">
                <span className="text-base font-semibold text-foreground">
                  Vale devolução aplicado
                </span>
                <span className="truncate font-mono text-sm font-medium tabular-nums text-muted-foreground">
                  {ticketAplicado}
                </span>
              </div>
            </div>
          )}
        </div>

        <footer className="flex h-[60px] shrink-0 items-center justify-end gap-[10px] border-t border-border px-lg">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-9 w-28 gap-xs rounded-full text-sm font-semibold"
            onClick={onFechar}
          >
            <X className="size-3.5" aria-hidden="true" />
            {ticketAplicado === null ? 'Cancelar' : 'Fechar'}
          </Button>
          {ticketAplicado === null ? (
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
          ) : null}
        </footer>
      </div>
    </div>
  );
}

/**
 * `FR-010`/AD-048 — ausência de configuração é elegibilidade, então este texto
 * só aparece quando `fpgUtiCar` traz um valor **explicitamente** diferente de
 * vale devolução. Ele nomeia a regra do ERP, não um código de erro: o operador
 * precisa saber que a saída é trocar de forma, não insistir no código.
 */
const MOTIVO_FORMA_INELEGIVEL =
  'Esta forma de pagamento não aceita vale devolução no cadastro do ERP. Escolha outra forma para usar o vale.';

/**
 * Um só motivo por vez, na ordem em que o operador consegue agir: primeiro o que
 * exige trocar de forma, depois o que exige digitar, por último o que exige
 * esperar. Devolver `null` é o que libera a ação (`lib/bloqueio.ts`).
 */
function motivoBloqueioAplicacao(
  forma: FormaPagamento,
  elegivel: boolean,
  codigoLimpo: string,
  enviando: boolean,
): MotivoBloqueio {
  if (!elegivel) {
    return MOTIVO_FORMA_INELEGIVEL;
  }
  if (codigoLimpo === '') {
    return `Informe o código do vale devolução para aplicá-lo em ${forma.descricao}.`;
  }
  if (enviando) {
    return 'O vale informado está sendo validado no ERP. Aguarde o resultado.';
  }
  return null;
}

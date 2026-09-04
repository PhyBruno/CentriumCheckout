import { Ticket, Trash2 } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { acaoBloqueavel, atributosDeBloqueio, type MotivoBloqueio } from '@/lib/bloqueio';
import type { FormaPagamento, MeioPagtoNFe } from '../../domain/pagamento/formaPagamento';
import type { PagamentoAplicado, StatusPagamento } from '../../domain/pagamento/saldoPagamento';
import { ehElegivelParaVale } from '../../domain/pagamento/valeDevolucao';
import { formatarCentavos } from '../../domain/precificacao/dinheiro';
import { useVendaStore } from '../../stores/vendaStore';
import { ICONE_POR_MEIO } from './iconePorMeio';
import { ModalValeDevolucao } from './ModalValeDevolucao';

/**
 * Bloco "Pagamentos aplicados" do cartão de pagamento (T028, `FR-011`/`FR-012`)
 * — réplica do nó `COoLE` do Pencil (`design/HTML - Pencil/CentriumCheckout.html`,
 * linhas 2830–2923), filho do cartão "Pagamento e totais" (`OzP7o`).
 *
 * Estrutura do nó, item a item: coluna de 360px com `gap: 4px`; cabeçalho
 * (`N2JOw`) com o título à esquerda (Inter 13/600, `uBHDr`) e o "Texto restante"
 * à direita (Inter 12/600 em `$danger`, `s6VSY`, texto literal "Faltante R$ …");
 * cada forma aplicada (`vmqVn`) é uma faixa de 34px, raio 12, fundo `$surface-soft`,
 * `padding: 0 12px`, com nome+ícone à esquerda (`pvAYq`, gap 8, ícone lucide de
 * 16px) e, à direita (`tNCgL`, gap 6), o valor em Geist Mono 13/600 (`AYBpH`) e
 * o botão remover de 26×26 com raio total, fundo `$surface-strong` e ícone
 * `trash-2` de 14px (`EB08g`/`cQBj5`).
 *
 * **Três decisões sem nó correspondente no `.pen`**, todas por o desenho
 * modelar um único estado (uma forma PIX aprovada, saldo ainda em aberto):
 *
 * 1. **Estado vazio: o bloco inteiro não é renderizado.** Sem pagamento não há
 *    o que listar, e um título com lista vazia por baixo é a "lista fantasma"
 *    que o desenho não desenha. O saldo em aberto continua visível — ele também
 *    é a métrica "Faltante" do bloco escuro (`TotalDaVenda`), então esconder
 *    este bloco não esconde informação nenhuma do operador.
 * 2. **"Texto restante" some quando o saldo está coberto.** O nó só existe no
 *    estado "falta pagar"; escrever "Faltante R$ 0,00" seria afirmar uma falta
 *    que não existe.
 * 3. **Todo meio tem ícone**, vindo de `iconePorMeio.ts` — o mesmo mapa que o
 *    combobox de forma usa. O Pencil só nomeia três (`qr-code`, `banknote`,
 *    `credit-card`, no nó "Métodos de pagamento rápidos"); os outros 18 são
 *    inferidos, por decisão do usuário (2026-09-04). A versão anterior deixava
 *    os inferidos **sem ícone**, o que produzia faixas visualmente diferentes na
 *    mesma lista sem que a diferença dissesse nada ao operador.
 */
export function ListaPagamentosAplicados(): ReactElement | null {
  const pagamentos = useVendaStore((estado) => estado.pagamentos);
  const removerPagamento = useVendaStore((estado) => estado.removerPagamento);
  // Só o campo, não o objeto `SaldoPagamento`: `saldo()` monta um objeto novo a
  // cada chamada, e devolvê-lo do seletor daria uma referência diferente por
  // render — o Zustand v5 trataria como mudança e o componente entraria em laço.
  const saldoRestante = useVendaStore((estado) => estado.saldo().saldoRestante);
  const condicaoSelecionada = useVendaStore((estado) => estado.condicaoSelecionada);
  const temValeAplicado = useVendaStore((estado) => estado.valeDevolucao !== null);

  /**
   * Pagamento cujo modal de vale está aberto — identidade, não índice: remover
   * outro pagamento reordena o array e o modal passaria a apontar para a forma
   * errada, vinculando o ticket a um pagamento que o operador não escolheu.
   */
  const [idPagamentoDoVale, setIdPagamentoDoVale] = useState<string | null>(null);

  if (pagamentos.length === 0) {
    return null;
  }

  /**
   * A forma vem do **catálogo da condição vigente**, não do `PagamentoAplicado`.
   *
   * O pagamento guarda uma cópia congelada só do que o payload precisa
   * (`meioPagtoNFe`, `integracaoCartao`, `entrada` — `data-model.md` §2), e
   * `fpgUtiCar`, que é o campo que decide a elegibilidade do vale (AD-048), não
   * está entre eles. `null` quando a condição foi trocada depois — aí o vale
   * fica bloqueado com motivo, em vez de assumir elegibilidade.
   */
  function formaDoPagamento(pagamento: PagamentoAplicado): FormaPagamento | null {
    return condicaoSelecionada?.formas.find((f) => f.codigo === pagamento.formaCodigo) ?? null;
  }

  const pagamentoDoVale = pagamentos.find((p) => p.idPagamento === idPagamentoDoVale) ?? null;
  const formaDoVale = pagamentoDoVale === null ? null : formaDoPagamento(pagamentoDoVale);

  return (
    <section className="flex w-full flex-col gap-xxs" data-testid="pagamentos-aplicados">
      <header className="flex w-full items-center justify-between">
        <h3 className="text-base font-semibold text-foreground">Pagamentos aplicados</h3>
        {saldoRestante > 0 ? (
          <span
            className="text-sm font-semibold text-destructive"
            data-testid="pagamentos-saldo-restante"
          >
            Faltante {formatarCentavos(saldoRestante)}
          </span>
        ) : null}
      </header>

      <ul className="flex w-full flex-col gap-xxs">
        {pagamentos.map((pagamento) => (
          <ItemPagamentoAplicado
            key={pagamento.idPagamento}
            pagamento={pagamento}
            forma={formaDoPagamento(pagamento)}
            temValeAplicado={temValeAplicado}
            onRemover={removerPagamento}
            onAbrirVale={setIdPagamentoDoVale}
          />
        ))}
      </ul>

      {/* O modal vive aqui, e não dentro da faixa: montá-lo por item colocaria N
          diálogos no DOM, cada um com o seu ouvinte de ESC e o seu foco preso —
          e o operador aplica um vale por vez. `forma` não é anulável no contrato
          do modal, então ele só é montado quando a forma foi de fato resolvida. */}
      {pagamentoDoVale !== null && formaDoVale !== null && (
        <ModalValeDevolucao
          aberto
          forma={formaDoVale}
          idPagamento={pagamentoDoVale.idPagamento}
          onFechar={() => {
            setIdPagamentoDoVale(null);
          }}
        />
      )}
    </section>
  );
}

/**
 * Por que o vale não pode ser aplicado a este pagamento, ou `null` quando pode.
 *
 * A ordem importa: o motivo mais específico primeiro. Dizer "esta forma não
 * aceita vale" a quem já aplicou um vale na venda mandaria o operador procurar
 * outra forma — quando o que falta é remover o vale existente.
 */
function motivoBloqueioVale(
  pagamento: PagamentoAplicado,
  forma: FormaPagamento | null,
  temValeAplicado: boolean,
): MotivoBloqueio {
  if (pagamento.status !== 'APROVADO') {
    return 'O vale só pode ser aplicado depois que este pagamento for aprovado.';
  }
  if (temValeAplicado) {
    return 'Esta venda já tem um vale de devolução aplicado.';
  }
  if (forma === null) {
    return 'A condição de pagamento mudou: selecione a condição desta forma para aplicar o vale.';
  }
  // `fpgUtiCar` vazio é **elegível** (AD-048): só um valor explicitamente
  // diferente de vale devolução bloqueia.
  if (!ehElegivelParaVale(forma)) {
    return 'Esta forma de pagamento não aceita vale devolução.';
  }
  return null;
}

interface ItemPagamentoAplicadoProps {
  readonly pagamento: PagamentoAplicado;
  /** Forma do catálogo da condição vigente; `null` quando não resolvida. */
  readonly forma: FormaPagamento | null;
  readonly temValeAplicado: boolean;
  readonly onRemover: (idPagamento: string) => void;
  readonly onAbrirVale: (idPagamento: string) => void;
}

/** Uma faixa da lista — o nó `vmqVn` ("PIX aplicado") do Pencil. */
function ItemPagamentoAplicado({
  pagamento,
  forma,
  temValeAplicado,
  onRemover,
  onAbrirVale,
}: ItemPagamentoAplicadoProps): ReactElement {
  const Icone = ICONE_POR_MEIO[pagamento.meioPagtoNFe];
  const nome = ROTULO_POR_MEIO[pagamento.meioPagtoNFe];
  const anotacao = anotacaoDoPagamento(pagamento);
  const motivoBloqueio = motivoBloqueioRemocao(pagamento);
  const motivoVale = motivoBloqueioVale(pagamento, forma, temValeAplicado);

  return (
    <li
      className="flex h-[34px] w-full items-center justify-between rounded-lg bg-muted px-sm"
      data-testid="pagamento-aplicado"
      data-id-pagamento={pagamento.idPagamento}
      data-status={pagamento.status}
    >
      <span className="flex min-w-0 items-center gap-xs">
        <Icone className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="truncate text-base font-semibold text-foreground">{nome}</span>
        {anotacao === null ? null : (
          <span
            className="shrink-0 text-sm font-medium text-muted-foreground"
            data-testid="pagamento-anotacao"
          >
            {anotacao}
          </span>
        )}
      </span>

      <span className="flex shrink-0 items-center gap-[6px]">
        <span
          className="font-mono text-base font-semibold tabular-nums text-foreground"
          data-testid="pagamento-valor"
        >
          {formatarCentavos(pagamento.valorAplicado)}
        </span>
        {/* Vale devolução (`FR-008`/`FR-010`). Fica **por pagamento**, e não no
            cabeçalho do bloco, porque `TicketDevolucao` é campo por-forma no
            contrato (`erp-pagamento-api.md` §3): o vale abate de uma forma
            específica, não da venda inteira. Sem este gatilho o modal não teria
            nenhum ponto de entrada. */}
        <Button
          type="button"
          variant="secondary"
          size="icon-xs"
          className="size-[26px] shrink-0 rounded-full text-muted-foreground"
          data-testid="aplicar-vale-devolucao"
          aria-label={`Aplicar vale devolução em ${nome}`}
          {...atributosDeBloqueio(motivoVale)}
          onClick={acaoBloqueavel(motivoVale, () => {
            onAbrirVale(pagamento.idPagamento);
          })}
        >
          <Ticket className="size-3.5" aria-hidden="true" />
        </Button>
        {/* Bloqueio explicativo, nunca `disabled` nativo (`lib/bloqueio.ts`):
            remover um TEF/PIX já aprovado é impossível (I6), e o operador
            precisa ouvir **por quê** ao clicar — no `disabled` o clique não
            produz evento nenhum e o motivo morre no `title`. */}
        <Button
          type="button"
          variant="secondary"
          size="icon-xs"
          className="size-[26px] shrink-0 rounded-full text-muted-foreground"
          data-testid="remover-pagamento"
          aria-label={`Remover ${nome}`}
          {...atributosDeBloqueio(motivoBloqueio)}
          onClick={acaoBloqueavel(motivoBloqueio, () => {
            onRemover(pagamento.idPagamento);
          })}
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
        </Button>
      </span>
    </li>
  );
}

/**
 * I6 (`data-model.md` §4): pagamento aprovado por integração externa não sai da
 * venda por aqui — o dinheiro já saiu da mão do cliente e quem desfaz é a
 * operadora ou a conta PIX, não o Checkout. O slice trata a chamada como no-op;
 * este motivo é o que impede o operador de descobrir isso clicando no vazio.
 */
function motivoBloqueioRemocao(pagamento: PagamentoAplicado): MotivoBloqueio {
  if (pagamento.status !== 'APROVADO' || pagamento.integracao === 'NENHUMA') {
    return null;
  }
  if (pagamento.integracao === 'PIX_DINAMICO') {
    return 'PIX já aprovado não pode ser removido da venda: a devolução é feita pela conta PIX.';
  }
  return 'Cartão já aprovado no TEF não pode ser removido da venda: cancele a transação na operadora.';
}

/**
 * Texto curto à direita do nome. Aprovado sem vale não recebe nada — é o estado
 * que o Pencil desenha, e ele fica idêntico ao nó. Os outros dois estados são
 * invisíveis no desenho e precisam se distinguir: `PENDENTE_INTEGRACAO` **não**
 * conta no saldo (`FR-004`/`FR-005`), e uma faixa igual à de um pagamento
 * aprovado faria o operador acreditar que a venda já está coberta.
 */
function anotacaoDoPagamento(pagamento: PagamentoAplicado): string | null {
  const status = ANOTACAO_POR_STATUS[pagamento.status];
  if (status !== null) {
    return status;
  }
  return pagamento.ticketDevolucao === null ? null : `Vale ${pagamento.ticketDevolucao}`;
}

const ANOTACAO_POR_STATUS: Record<StatusPagamento, string | null> = {
  APROVADO: null,
  PENDENTE_INTEGRACAO: 'Aguardando',
  RECUSADO: 'Recusado',
};

/**
 * `PagamentoAplicado` guarda o **meio** da NFCe, não a descrição da forma
 * cadastrada — por isso o nome exibido é traduzido aqui, e não lido do catálogo:
 * o catálogo pode ter mudado desde a aplicação, e o pagamento nunca resolve seus
 * dados olhando o catálogo depois (`data-model.md` §2, "Regra de fronteira").
 *
 * O rótulo de `Pix` é "PIX" em caixa alta, como o nó `Q2wLdo` do Pencil.
 */
const ROTULO_POR_MEIO: Record<MeioPagtoNFe, string> = {
  Dinheiro: 'Dinheiro',
  Cheque: 'Cheque',
  CartaoCredito: 'Cartão de crédito',
  CartaoDebito: 'Cartão de débito',
  CreditoLoja: 'Crédito da loja',
  ValeAlimentacao: 'Vale alimentação',
  ValeRefeicao: 'Vale refeição',
  ValePresente: 'Vale presente',
  ValeCombustivel: 'Vale combustível',
  DuplicataMercantil: 'Duplicata mercantil',
  BoletoBancario: 'Boleto bancário',
  DepositoBancario: 'Depósito bancário',
  Pix: 'PIX',
  TransferenciaBancaria: 'Transferência bancária',
  // Typo reproduzido do domínio do ERP (ver `formaPagamento.ts`): a chave é o
  // valor que o `GetSessao` devolve; o rótulo exibido é o correto em português.
  ProgaramaFidelidade: 'Programa de fidelidade',
  PixEstatico: 'PIX estático',
  CreditoEmLoja: 'Crédito em loja',
  PagamentoNaoInformado: 'Pagamento não informado',
  SemPagamento: 'Sem pagamento',
  PagamentoPosterior: 'Pagamento posterior',
  Outros: 'Outros',
};

import { Trash2 } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { acaoBloqueavel, atributosDeBloqueio, type MotivoBloqueio } from '@/lib/bloqueio';
import { cn } from '@/lib/utils';
import type { MeioPagtoNFe } from '../../domain/pagamento/formaPagamento';
import type { PagamentoAplicado, StatusPagamento } from '../../domain/pagamento/saldoPagamento';
import { ZERO_CENTAVOS, formatarCentavos } from '../../domain/precificacao/dinheiro';
import { useCondicoesPagamento } from '../../services/pagamento/pagamentoQueries';
import { useVendaStore } from '../../stores/vendaStore';
import { iconeDoPagamento } from './iconePorMeio';
import {
  AVISO_DESASSOCIACAO_MANUAL,
  CHAMADA_PIX_NAO_E_CANCELADO,
  DESTAQUE_PIX_SEGUE_NO_BANCO,
} from './pix/avisosPix';
import { DialogoConfirmacaoPix } from './pix/DialogoConfirmacaoPix';
import { ModalPix } from './pix/ModalPix';

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

  /**
   * Remoção de PIX aguardando confirmação (item 3 do usuário, 2026-09-04).
   *
   * Guarda o `idPagamento`, e não o `PagamentoAplicado`: o objeto do estado é
   * substituído a cada mutação do slice, e uma cópia congelada aqui poderia
   * confirmar a remoção de uma versão que não existe mais. O `id` é estável.
   */
  const [idAConfirmar, setIdAConfirmar] = useState<string | null>(null);

  const cobrancaPix = usePixPendente();

  if (pagamentos.length === 0) {
    return null;
  }

  /**
   * Remover PIX pede confirmação; qualquer outra forma sai direto.
   *
   * O desvio acontece **aqui**, e não dentro do slice, porque o slice não pode
   * abrir janela nem esperar por uma resposta do operador sem virar assíncrono —
   * e `removerPagamento` é chamada por outros caminhos (a limpeza pós-entrega da
   * 004, por exemplo) que não devem perguntar nada a ninguém. A regra de negócio
   * ("PIX pode sair da venda") mora no slice; a pergunta mora na tela.
   *
   * O log é preservado nos dois caminhos: quem registra
   * `FORMA_PAGAMENTO_REMOVIDA` é `removerPagamento`, e a confirmação só decide
   * **se** ela é chamada.
   */
  function pedirRemocao(idPagamento: string): void {
    const alvo = pagamentos.find((pagamento) => pagamento.idPagamento === idPagamento);
    if (alvo === undefined) {
      return;
    }
    if (alvo.integracao === 'PIX_DINAMICO') {
      setIdAConfirmar(idPagamento);
      return;
    }
    removerPagamento(idPagamento);
  }

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
            onRemover={pedirRemocao}
          />
        ))}
      </ul>

      {cobrancaPix}

      {idAConfirmar !== null && (
        <DialogoConfirmacaoPix
          testId="confirmar-remocao-pix"
          titulo="Remover o PIX da venda?"
          subtitulo="A cobrança já foi gerada no banco"
          chamada={CHAMADA_PIX_NAO_E_CANCELADO}
          explicacao={AVISO_DESASSOCIACAO_MANUAL}
          destaque={DESTAQUE_PIX_SEGUE_NO_BANCO}
          rotuloConfirmar="Remover mesmo assim"
          onConfirmar={() => {
            removerPagamento(idAConfirmar);
            setIdAConfirmar(null);
          }}
          onCancelar={() => {
            setIdAConfirmar(null);
          }}
        />
      )}
    </section>
  );
}

/**
 * Ponto de disparo real da integração PIX (T024, feature 009) — substitui o stub
 * no-op de `iniciarIntegracao` deixado pela feature 008
 * (`vendaStore.pagamentoDepsPadrao`).
 *
 * **Por que a janela nasce do estado, e não de um callback.** O contrato da 008
 * entrega a integração por `iniciarIntegracao(integracao, ctx)`, uma porta
 * imperativa chamada de dentro do slice. Montar o modal a partir dela exigiria
 * guardar o contexto em algum lugar — um estado paralelo ao `PagamentoAplicado`,
 * capaz de discordar dele. Aqui a janela é uma **função** do pagamento que está
 * `PENDENTE_INTEGRACAO` com `integracao === 'PIX_DINAMICO'`: existe exatamente
 * enquanto esse pagamento existir, e some no instante em que ele é confirmado ou
 * removido. O stub em `vendaStore` continua no-op de propósito — não há segundo
 * mecanismo de disparo (`tasks.md`, nota final).
 *
 * `find`, não `filter`: `PENDENTE_INTEGRACAO` bloqueia a inserção da próxima
 * forma até resolver, então há no máximo um por vez (invariante J1 da 009).
 *
 * O `idPagamento` fica **fechado dentro dos callbacks**, e não copiado para
 * dentro da cobrança: é o vínculo único entre a janela e o pagamento que a
 * originou (ver `domain/pix/cobrancaPix.ts`).
 *
 * ---
 *
 * ### Por que a janela seguiu o `idPagamento` em vez de "existe um pendente?"
 *
 * Desde 2026-09-04 a janela permanece 10 segundos na tela **depois** da
 * aprovação (pedido do usuário — ver o TSDoc de `ModalPix`). O pagamento deixa
 * de ser `PENDENTE_INTEGRACAO` no instante em que o polling confirma, então a
 * condição antiga ("existe um pagamento pendente de PIX?") desmontaria a janela
 * exatamente no quadro em que ela precisa mostrar que deu certo.
 *
 * A correção é mínima e preserva a decisão de AD-158: a janela continua sendo
 * função do estado, só que do **pagamento que ela está exibindo**, seguido por
 * `id`. Um pendente novo entra em cena; a saída é sempre `onFechar`, e nunca um
 * segundo estado de "aberto" capaz de discordar do slice — se o pagamento sumir
 * da lista (recusa, remoção), a janela some junto, sem gesto nenhum.
 */
function usePixPendente(): ReactElement | null {
  const pagamentos = useVendaStore((estado) => estado.pagamentos);
  const clienteAtual = useVendaStore((estado) => estado.clienteAtual);
  const confirmarPagamentoIntegrado = useVendaStore((estado) => estado.confirmarPagamentoIntegrado);
  const recusarPagamentoIntegrado = useVendaStore((estado) => estado.recusarPagamentoIntegrado);
  const [idExibido, setIdExibido] = useState<string | null>(null);

  // O catálogo já está em cache (`staleTime` de 30 min, `PAY-01`): a mesma query
  // alimenta o combobox de forma ao lado, e chegar aqui exige ter aplicado uma
  // forma dele. Sem dado carregado o piso é zero, isto é, sem bloqueio por valor
  // mínimo — recusar a cobrança por um dado que ainda não chegou seria pior do
  // que deixar o próprio ERP recusá-la.
  const catalogo = useCondicoesPagamento();
  const minimoPix = catalogo.data?.minimoPix ?? ZERO_CENTAVOS;

  const pendente = pagamentos.find(
    (pagamento) =>
      pagamento.status === 'PENDENTE_INTEGRACAO' && pagamento.integracao === 'PIX_DINAMICO',
  );

  // Entrada em cena durante o render, não em `useEffect` (mesmo padrão de
  // `codigoCondicaoAnterior` em `PainelPagamentoETotais`): o efeito abriria a
  // janela um quadro depois, deixando a tela de venda visível por um instante
  // com um pagamento pendente que ninguém está resolvendo. O `set` converge —
  // no render seguinte os dois `id` são iguais e nada mais muda.
  if (pendente !== undefined && pendente.idPagamento !== idExibido) {
    setIdExibido(pendente.idPagamento);
  }

  // Segue o pagamento **exibido**, em qualquer status: é o que mantém a janela
  // de pé durante os 10 segundos do estado aprovado. Some sozinha quando o
  // pagamento deixa a lista (recusa/remoção) — `find` devolve `undefined`.
  const exibido =
    idExibido === null
      ? undefined
      : pagamentos.find((pagamento) => pagamento.idPagamento === idExibido);

  if (exibido === undefined) {
    return null;
  }

  return (
    <ModalPix
      // A janela é recriada do zero a cada pagamento: sem a `key`, um segundo
      // PIX na mesma venda reaproveitaria o componente montado e as travas de
      // "uma geração por montagem" impediriam a nova cobrança.
      key={exibido.idPagamento}
      formaCodigo={exibido.formaCodigo}
      valor={exibido.valorAplicado}
      minimoPix={minimoPix}
      clienteAtual={clienteAtual}
      onAprovado={(pixGuid) => {
        confirmarPagamentoIntegrado(exibido.idPagamento, { pixGuid });
      }}
      onAbandonado={(motivo) => {
        recusarPagamentoIntegrado(exibido.idPagamento, motivo);
      }}
      onFechar={() => {
        // Único caminho de saída da janela — o automático de 10s depois da
        // aprovação, o `X`, o ESC (só com o pagamento aprovado) e a desistência
        // confirmada convergem todos aqui.
        setIdExibido(null);
      }}
    />
  );
}

interface ItemPagamentoAplicadoProps {
  readonly pagamento: PagamentoAplicado;
  readonly onRemover: (idPagamento: string) => void;
}

/**
 * Uma faixa da lista — o nó `vmqVn` ("PIX aplicado") do Pencil.
 *
 * **Excluída fica riscada, mas não sai da lista** (pedido do usuário,
 * 2026-09-04) — mesmo tratamento do item cancelado do carrinho (`GridItens`,
 * `linha.cancelada`): `text-muted-foreground line-through`, texto `sr-only`
 * anunciando o estado para leitor de tela, e o botão de remover some (nada a
 * remover de novo). A forma excluída não vai ao ERP — `montarPagamentosParaPayload`
 * só envia `APROVADO` —, mas o log de inserção/exclusão continua no array de
 * eventos, escrito por `removerPagamento` antes de a UI sequer saber que a
 * exclusão aconteceu.
 */
function ItemPagamentoAplicado({ pagamento, onRemover }: ItemPagamentoAplicadoProps): ReactElement {
  const Icone = iconeDoPagamento(pagamento);
  const nome = ROTULO_POR_MEIO[pagamento.meioPagtoNFe];
  const anotacao = anotacaoDoPagamento(pagamento);
  const motivoBloqueio = motivoBloqueioRemocao(pagamento);
  const excluido = pagamento.status === 'EXCLUIDO';

  return (
    <li
      className={cn(
        'flex h-[34px] w-full items-center justify-between rounded-lg bg-muted px-sm',
        excluido && 'text-muted-foreground line-through',
      )}
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
        {excluido ? <span className="sr-only"> (pagamento excluído)</span> : null}
      </span>

      <span className="flex shrink-0 items-center gap-[6px]">
        <span
          className="font-mono text-base font-semibold tabular-nums text-foreground"
          data-testid="pagamento-valor"
        >
          {formatarCentavos(pagamento.valorAplicado)}
        </span>
        {/* Não há mais botão de vale aqui. O vale devolução deixou de ser algo
            aplicado **sobre** um pagamento e passou a ser a própria forma de
            pagamento (`FpgUtiCar = 'VDV'`), inserida pelo modal que abre ao
            escolher essa forma. O ticket aparece nesta faixa como a anotação
            "Vale <código>", ao lado do nome. */}
        {/* Bloqueio explicativo, nunca `disabled` nativo (`lib/bloqueio.ts`):
            remover um TEF já aprovado é impossível (I6), e o operador precisa
            ouvir **por quê** ao clicar — no `disabled` o clique não produz
            evento nenhum e o motivo morre no `title`. O PIX não é bloqueado:
            ele passa pela confirmação de `pedirRemocao`. */}
        {excluido ? null : (
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
        )}
      </span>
    </li>
  );
}

/**
 * I6, reescrita pelo usuário em 2026-09-04: **só o TEF aprovado** bloqueia a
 * remoção.
 *
 * A regra anterior bloqueava as duas integrações. Ela partia da ideia de que
 * "dinheiro já movimentado não sai da venda" — verdade para o TEF, cuja
 * transação vive num terminal físico que precisa ser cancelado antes, e falsa
 * para o PIX: o Checkout nunca teve como cancelar uma cobrança PIX (invariante
 * J5 — não existe endpoint), então travar a forma na tela não protegia o
 * dinheiro de ninguém, só prendia o operador. Hoje o PIX sai da venda mediante
 * confirmação explícita, e é a confirmação que informa que a cobrança segue viva
 * no banco.
 *
 * Bloqueio explicativo, nunca `disabled` mudo (`lib/bloqueio.ts`): é o motivo
 * que impede o operador de descobrir a regra clicando no vazio.
 */
function motivoBloqueioRemocao(pagamento: PagamentoAplicado): MotivoBloqueio {
  if (pagamento.status !== 'APROVADO' || pagamento.integracao !== 'TEF') {
    return null;
  }
  return 'Cartão já aprovado no TEF não pode ser removido da venda: cancele a transação no terminal antes.';
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
  // `null`, como `APROVADO`: quem comunica a exclusão é o riscado + o
  // `sr-only` da faixa, não um texto que substituiria a anotação "Vale
  // <código>" — o operador ainda precisa ver qual vale ficou de fora.
  EXCLUIDO: null,
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

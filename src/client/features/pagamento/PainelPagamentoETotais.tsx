import { Eraser, WalletCards } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { acaoBloqueavel, atributosDeBloqueio, type MotivoBloqueio } from '@/lib/bloqueio';
import { useVendaStore } from '../../stores/vendaStore';
import type { FormaPagamento } from '../../domain/pagamento/formaPagamento';
import { ehFormaDeValeDevolucao } from '../../domain/pagamento/valeDevolucao';
import { AcoesFinaisVenda } from '../finalizacao-suspensao/AcoesFinaisVenda';
import { ControleDescontoCapa } from './ControleDescontoCapa';
import { EntradaPagamento } from './EntradaPagamento';
import { ListaPagamentosAplicados } from './ListaPagamentosAplicados';
import { ModalValeDevolucao } from './ModalValeDevolucao';
import {
  AVISO_PAGAMENTO_DO_DOCUMENTO,
  CHAMADA_VALOR_JA_RECEBIDO,
  DESTAQUE_NFCE_SAI_SEM_O_VALOR,
} from './avisosPagamentoDoDocumento';
import {
  AVISO_DESASSOCIACAO_MANUAL,
  CHAMADA_PIX_NAO_E_CANCELADO,
  DESTAQUE_PIX_SEGUE_NO_BANCO,
} from './pix/avisosPix';
import { DialogoConfirmacaoDestrutiva } from './DialogoConfirmacaoDestrutiva';
import {
  SeletorCondicaoPagamento,
  SeletorFormaPagamento,
  type OrigemSelecao,
} from './SeletorCondicaoForma';
import { TotalDaVenda } from './TotalDaVenda';

/**
 * Cartão "Pagamento e totais" do Pencil (nó `OzP7o` de
 * `design/CentriumCheckout.pen`): coluna branca de 392px à direita da área
 * operacional — `$canvas`, raio 24, hairline `$hairline` de 1px, altura cheia,
 * conteúdo com 16px de folga.
 *
 * **Composição, não implementação.** Cada bloco do desenho é um componente
 * próprio da feature 008; este arquivo só os empilha na ordem do cartão e
 * segura o único estado que não pertence a nenhum deles (ver `formaSelecionada`
 * abaixo). O rodapé "Ações finais" (`UaFF2`) é da feature 004 e no desenho já
 * vive dentro deste cartão, não solto na tela.
 *
 * **Tradução do posicionamento:** no `.pen` os blocos são `position: absolute`
 * com `top` fixo (16, 60, 104, 178, 274, 350, 435, 576) e `left: 16 / width:
 * 360`. Aqui viram uma coluna flex com folga de 16px. Copiar os `top` absolutos
 * reproduziria o desenho só na altura exata em que ele foi feito: a lista de
 * pagamentos aplicados cresce a cada forma inserida, e o bloco de total ficaria
 * por baixo dela. A coluna preserva a **ordem e as folgas** do desenho, que é o
 * que ele de fato fixa.
 *
 * **O que falta de propósito:** a faixa "Métodos de pagamento rápidos"
 * (`I10H4d`, `top: 16`) — os quatro botões PIX/Dinheiro/Débito/Crédito com
 * `F6`–`F9` — é a feature 013 (venda rápida por cenário de pagamento), não
 * esta. O cabeçalho abaixo ocupa hoje o topo do cartão; quando a 013 chegar,
 * ela entra acima dele sem mover mais nada.
 */
/**
 * "Limpar" — descarta condição, formas, desconto de capa e vales da venda
 * (pedido do usuário, 2026-09-04).
 *
 * **Existe porque a condição de pagamento passou a congelar o carrinho.** Sem
 * um caminho de volta, escolher a condição por engano deixaria o operador preso:
 * a grid recusaria toda edição e não haveria gesto capaz de desfazer a escolha —
 * o combobox só troca de condição, nunca a desmarca. A frase que o carrinho
 * mostra ao recusar uma edição (`AVISO_CARRINHO_BLOQUEADO`) aponta para este
 * botão pelo nome.
 *
 * Mora no cabeçalho, e não junto da lista de pagamentos, porque a lista pode
 * estar vazia — o congelamento começa na condição, antes da primeira forma.
 *
 * Bloqueio explicativo, nunca `disabled` (AD-143), em dois casos: nada a limpar,
 * e **cartão aprovado no TEF** (I6 — a transação vive no terminal físico e o
 * cancelamento acontece lá, antes). A recusa de verdade mora em
 * `descartarPagamento`; aqui ela é antecipada para o operador ler o motivo antes
 * de tentar.
 *
 * **PIX não bloqueia mais, pergunta** (AD-161, item 2 do usuário): descartar o
 * pagamento com uma cobrança PIX na venda passa pela mesma confirmação da
 * remoção individual. A regra é a de sempre — o Checkout não cancela cobrança
 * PIX —, e travar o botão nunca desfez nada; só deixava o operador sem saída.
 *
 * **Pagamento vindo do documento também pergunta** (AD-169). É a saída oficial
 * de uma venda retomada já paga: a forma aprovada congela a grid, e este botão
 * é o caminho — nomeado pelo próprio aviso de bloqueio do carrinho — para
 * voltar a editar os itens. Mas o valor **já foi recebido** e está gravado no
 * documento dentro do ERP: descartá-lo sem perguntar deixaria a NFCe sair sem
 * o pagamento que o cliente fez, num gesto que o operador daria só para
 * corrigir um item. Não bloqueia, pelo mesmo motivo do PIX — travar aqui
 * fecharia a única saída e não desfaria nada.
 */
function BotaoLimparPagamento(): ReactElement {
  const condicaoSelecionada = useVendaStore((estado) => estado.condicaoSelecionada);
  const descontoCapa = useVendaStore((estado) => estado.descontoCapa);
  const pagamentos = useVendaStore((estado) => estado.pagamentos);
  const descartarPagamento = useVendaStore((estado) => estado.descartarPagamento);
  const [confirmando, setConfirmando] = useState<'pix' | 'documento' | null>(null);

  const temTefAprovado = pagamentos.some(
    (pagamento) => pagamento.integracao === 'TEF' && pagamento.status === 'APROVADO',
  );
  const temPix = pagamentos.some((pagamento) => pagamento.integracao === 'PIX_DINAMICO');
  // `importarFormasDePagamento` grava `integracao: 'NENHUMA'` em tudo o que vem
  // do documento, então nenhuma forma importada é `PIX_DINAMICO` e as duas
  // confirmações nunca competem pelo mesmo pagamento. A ordem abaixo ainda dá
  // precedência a esta: o valor já recebido é o aviso mais grave dos dois.
  const temPagamentoDoDocumento = pagamentos.some(
    (pagamento) => pagamento.veioDeDocumento && pagamento.status === 'APROVADO',
  );
  const vazio = condicaoSelecionada === null && pagamentos.length === 0 && descontoCapa === null;

  const bloqueio: MotivoBloqueio = temTefAprovado
    ? 'Cartão aprovado no TEF não pode ser removido: cancele a transação no terminal antes.'
    : vazio
      ? 'Não há condição, desconto ou forma de pagamento nesta venda para limpar.'
      : null;

  return (
    <>
      <button
        type="button"
        className="flex shrink-0 items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1.5 text-sm font-semibold text-foreground hover:bg-secondary-hover aria-disabled:cursor-not-allowed aria-disabled:opacity-50 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        data-testid="limpar-pagamento"
        {...atributosDeBloqueio(bloqueio)}
        onClick={acaoBloqueavel(bloqueio, () => {
          if (temPagamentoDoDocumento) {
            setConfirmando('documento');
            return;
          }
          if (temPix) {
            setConfirmando('pix');
            return;
          }
          descartarPagamento();
        })}
      >
        <Eraser className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        Limpar
      </button>

      {confirmando === 'documento' && (
        <DialogoConfirmacaoDestrutiva
          testId="confirmar-limpeza-documento"
          titulo="Limpar o pagamento vindo do documento?"
          subtitulo="Esta venda foi retomada já paga"
          chamada={CHAMADA_VALOR_JA_RECEBIDO}
          explicacao={AVISO_PAGAMENTO_DO_DOCUMENTO}
          destaque={DESTAQUE_NFCE_SAI_SEM_O_VALOR}
          rotuloConfirmar="Limpar mesmo assim"
          onConfirmar={() => {
            descartarPagamento();
            setConfirmando(null);
          }}
          onCancelar={() => {
            setConfirmando(null);
          }}
        />
      )}

      {confirmando === 'pix' && (
        <DialogoConfirmacaoDestrutiva
          testId="confirmar-limpeza-pix"
          titulo="Limpar o pagamento com PIX gerado?"
          subtitulo="A cobrança já foi gerada no banco"
          chamada={CHAMADA_PIX_NAO_E_CANCELADO}
          explicacao={AVISO_DESASSOCIACAO_MANUAL}
          destaque={DESTAQUE_PIX_SEGUE_NO_BANCO}
          rotuloConfirmar="Limpar mesmo assim"
          onConfirmar={() => {
            descartarPagamento();
            setConfirmando(null);
          }}
          onCancelar={() => {
            setConfirmando(null);
          }}
        />
      )}
    </>
  );
}

export function PainelPagamentoETotais(): ReactElement {
  /**
   * Forma escolhida para a **próxima** inserção — rascunho de UI, não estado de
   * venda.
   *
   * Mora aqui, e não no `pagamentoSlice`, porque o contrato do slice
   * (`specs/008-pagamento-geral/contracts/pagamento-domain-api.md` §2) não tem
   * campo de "forma corrente": o que a venda guarda é a lista de pagamentos
   * **aplicados**. Guardá-la no slice criaria estado sem nenhuma action que o
   * limpasse — sobreviveria a `limparPagamentos()` e reapareceria na venda
   * seguinte apontando para uma forma de outra condição.
   *
   * É por isso que o seletor de forma e o campo de valor são irmãos aqui: os
   * dois leem o mesmo rascunho, e quem os compõe é quem o segura.
   */
  const [formaSelecionada, setFormaSelecionada] = useState<FormaPagamento | null>(null);
  const [valeAberto, setValeAberto] = useState(false);

  /**
   * Trocar a condição **limpa a forma escolhida** (pedido do usuário,
   * 2026-09-04).
   *
   * As formas pertencem à condição: mantida a escolha anterior, o combobox
   * exibiria o nome de uma forma que a condição nova não oferece, e
   * `EntradaPagamento` aceitaria um valor para ela — `aplicarPagamento` recusaria
   * só no clique, com a frase de forma fora da condição. Zerar aqui faz o
   * controle voltar a "Selecione a forma", que é o estado verdadeiro.
   *
   * Comparação do valor anterior durante o render, não `useEffect`: o reset
   * acontece **antes** da pintura, sem um quadro intermediário exibindo a forma
   * antiga sob a condição nova (padrão de `abertoAnterior` em
   * `ModalValeDevolucao`).
   */
  const codigoCondicao = useVendaStore((estado) => estado.condicaoSelecionada?.codigo ?? null);
  const [codigoCondicaoAnterior, setCodigoCondicaoAnterior] = useState(codigoCondicao);
  if (codigoCondicao !== codigoCondicaoAnterior) {
    setCodigoCondicaoAnterior(codigoCondicao);
    setFormaSelecionada(null);
    setValeAberto(false);
  }

  /**
   * Escolher a forma de vale devolução **por clique do mouse** abre o modal do
   * ticket; qualquer outra forma, ou a mesma escolhida pela seta do teclado, só
   * vira o rascunho da próxima inserção.
   *
   * **A origem decide, não a forma** (correção do usuário, 2026-09-04). Antes o
   * modal abria sempre que o vale virava `formaSelecionada`, inclusive ao
   * percorrer o combobox com as setas — e a seta existe justamente para passear
   * pelas opções no ritmo do teclado, sem confirmar nenhuma. Abrir uma janela a
   * cada opção sobrevoada obrigaria um Escape por tecla, e o operador que só
   * queria ver a próxima forma acabava preso numa janela que não pediu. O
   * clique do mouse é gesto único e deliberado — é o que garante que o operador
   * quis mesmo aquela forma, não apenas passou por ela.
   *
   * Um `useEffect` sobre `formaSelecionada` não distinguiria as duas origens
   * (o valor resultante é o mesmo nos dois casos); a decisão só existe no
   * evento de escolha, por isso `aoEscolher` carrega a origem até aqui.
   */
  function escolherForma(forma: FormaPagamento, origem: OrigemSelecao): void {
    setFormaSelecionada(forma);
    if (origem === 'mouse' && ehFormaDeValeDevolucao(forma)) {
      setValeAberto(true);
    }
  }

  const formaDoVale =
    valeAberto && formaSelecionada !== null && ehFormaDeValeDevolucao(formaSelecionada)
      ? formaSelecionada
      : null;

  return (
    <aside
      className="flex h-full w-[392px] shrink-0 flex-col gap-xs rounded-3xl border border-border bg-card p-base"
      data-testid="painel-pagamento-totais"
    >
      {/* Nó `y3cr1` "Cabeçalho pagamento": ícone `wallet-cards` de 20px + título
          Inter 18/600.

          A pílula "Seguro" (cadeado + rótulo) que o desenho põe à direita foi
          **removida** a pedido do usuário (2026-09-04): ela não descreve nenhum
          estado do sistema — não há um modo inseguro do qual distinguir esta
          tela. A faixa que ela ocupava passou a receber o botão "Limpar", que
          é a saída do congelamento descrito abaixo. */}
      <header className="flex h-9 shrink-0 items-center justify-between gap-[10px]">
        <div className="flex min-w-0 items-center gap-[10px]">
          <WalletCards className="size-5 shrink-0 text-foreground" aria-hidden="true" />
          <h2 className="text-[18px] font-semibold text-foreground">Pagamento</h2>
        </div>
        <BotaoLimparPagamento />
      </header>

      {/* Na prática esta coluna **não rola**: quem rola é a lista de pagamentos
          aplicados, por dentro (pedido do usuário, 2026-09-04). O cartão tem
          altura fixa (a da tela) e a lista é a única parte que cresce sem
          limite — e é também o único bloco daqui marcado com `min-h-0`, então é
          ela que o flex escolhe para absorver a falta de espaço; condição,
          desconto e campo de valor param no tamanho do próprio conteúdo. Uma
          venda com muitas formas encolhe a lista e ganha barra dentro dela, em
          vez de arrastar os controles de cima para fora da vista.

          A rolagem declarada aqui é a **rede de segurança** para o caso em que
          nem a lista zerada basta (tela baixa demais para os blocos fixos): sem
          ela, o bloco de total e o botão de finalizar sairiam do cartão — e o
          botão de finalizar é justamente o que não pode sumir.

          `overflow-x-hidden` é obrigatório junto do `overflow-y-auto`, não
          decoração: pelo CSS, `overflow-x: visible` combinado com um
          `overflow-y` não-visível é **computado como `auto`**, então declarar só
          o eixo vertical cria uma barra horizontal na primeira vez que qualquer
          filho estourar 1px. Foi o que aconteceu em 2026-09-04 (scroll lateral
          no cartão de pagamento). A causa daquele estouro já foi removida em
          `ControleDescontoCapa`; esta trava impede que o próximo bloco a crescer
          o traga de volta. A coluna nunca rola na horizontal por desenho: todos
          os blocos são `w-full` com conteúdo encolhível.

          O corte horizontal também comia o anel de `focus-visible` dos
          comboboxes, que se desenha 3px **para fora** da borda — o realce
          aparecia recortado nas laterais. `-mx-1 px-1` devolve essa folga por
          dentro: a coluna passa a ser 8px mais larga que a área útil do cartão
          (avançando sob o `p-base` do `aside`, que tem 16px de sobra) e recupera
          os mesmos 8px como padding, então o conteúdo continua com a largura de
          antes e o anel cabe inteiro na região não recortada.

          `overflow-clip-margin` seria o recurso natural aqui (como no
          colapsável do card de cliente, AD-134) e **não funciona neste caso**:
          pelo CSS, `overflow-x: clip` ao lado de um `overflow-y` que rola tem
          valor usado `hidden`, e a margem de clipe só vale para `clip` de
          verdade — verificado no navegador, o computado volta `hidden`.

          `gap-xs`, não `gap-base`: no Pencil os blocos do cartão distam ~8px
          (`oGiPa` y=104 → `Jup0R` y=178 → `uZUQX` y=274 → `J3Y1L` y=350,
          descontadas as alturas), e os 16px anteriores esticavam a coluna a
          ponto de o operador perder a relação entre condição, desconto e
          forma. */}
      <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-xs overflow-x-hidden overflow-y-auto px-1">
        <SeletorCondicaoPagamento />
        <ControleDescontoCapa />
        <SeletorFormaPagamento
          formaSelecionada={formaSelecionada}
          onSelecionarForma={escolherForma}
        />
        <EntradaPagamento forma={formaSelecionada} />
        <ListaPagamentosAplicados />

        {/* O modal do vale abre a partir da **escolha da forma**, não de um
            botão na lista: o vale devolução é a própria forma de pagamento
            (`FpgUtiCar = 'VDV'`), e o "valor recebido" dela é o valor do
            ticket, que só o ERP conhece. Montado aqui porque é aqui que mora a
            forma escolhida. */}
        {formaDoVale !== null && (
          <ModalValeDevolucao
            aberto
            forma={formaDoVale}
            onFechar={() => {
              setFormaSelecionada(null);
            }}
          />
        )}
      </div>

      {/* Total e ações finais ficam fixos no pé do cartão, fora da rolagem: no
          desenho eles são o fecho da coluna, e são a informação que o operador
          confere no instante de cobrar. */}
      <div className="flex shrink-0 flex-col gap-sm">
        <TotalDaVenda />
        <AcoesFinaisVenda />
      </div>
    </aside>
  );
}

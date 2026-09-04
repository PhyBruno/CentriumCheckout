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
import { SeletorCondicaoPagamento, SeletorFormaPagamento } from './SeletorCondicaoForma';
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
 * Bloqueio explicativo em dois casos, nunca `disabled` (AD-143): nada a limpar,
 * e pagamento TEF/PIX aprovado (I6 — o estorno é do ERP). A recusa de verdade
 * mora em `descartarPagamento`; aqui ela é antecipada para o operador ler o
 * motivo antes de tentar.
 */
function BotaoLimparPagamento(): ReactElement {
  const condicaoSelecionada = useVendaStore((estado) => estado.condicaoSelecionada);
  const descontoCapa = useVendaStore((estado) => estado.descontoCapa);
  const pagamentos = useVendaStore((estado) => estado.pagamentos);
  const descartarPagamento = useVendaStore((estado) => estado.descartarPagamento);

  const temIrreversivel = pagamentos.some(
    (pagamento) => pagamento.integracao !== 'NENHUMA' && pagamento.status === 'APROVADO',
  );
  const vazio = condicaoSelecionada === null && pagamentos.length === 0 && descontoCapa === null;

  const bloqueio: MotivoBloqueio = temIrreversivel
    ? 'Pagamento aprovado por TEF/PIX não pode ser removido: o estorno é operação do ERP.'
    : vazio
      ? 'Não há condição, desconto ou forma de pagamento nesta venda para limpar.'
      : null;

  return (
    <button
      type="button"
      className="flex shrink-0 items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1.5 text-sm font-semibold text-foreground hover:bg-secondary-hover aria-disabled:cursor-not-allowed aria-disabled:opacity-50 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      data-testid="limpar-pagamento"
      {...atributosDeBloqueio(bloqueio)}
      onClick={acaoBloqueavel(bloqueio, descartarPagamento)}
    >
      <Eraser className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      Limpar
    </button>
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

  /**
   * Escolher a forma de vale devolução **abre o modal do ticket**; qualquer
   * outra forma só vira o rascunho da próxima inserção.
   *
   * O gesto é um só para o operador: ele percorre o combobox e, ao parar na
   * forma de vale, já é levado a digitar o código — sem um segundo controle
   * escondido em outro lugar da tela. Um `useEffect` sobre `formaSelecionada`
   * faria o mesmo, mas reabriria o modal a cada re-render que reescrevesse o
   * estado, inclusive depois de o operador cancelar; a decisão pertence ao
   * evento de escolha, não ao valor resultante.
   */
  function escolherForma(forma: FormaPagamento): void {
    setFormaSelecionada(forma);
    if (ehFormaDeValeDevolucao(forma)) {
      setValeAberto(true);
    }
  }

  const [valeAberto, setValeAberto] = useState(false);
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

      {/* A área central rola: o cartão tem altura fixa (a da tela) e a lista de
          pagamentos aplicados é a única parte que cresce sem limite. Sem isto,
          uma venda com muitas formas empurraria o bloco de total e o botão de
          finalizar para fora do cartão — e o botão de finalizar é justamente o
          que não pode sumir.

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

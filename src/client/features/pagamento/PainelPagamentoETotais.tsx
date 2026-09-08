import type { ReactElement } from 'react';
import { AcoesFinaisVenda } from '../finalizacao-suspensao/AcoesFinaisVenda';
import { FaixaAtalhosVendaRapida } from '../venda-rapida/DicaAtalhos';
import { ConfiguracaoPagamento } from './ConfiguracaoPagamento';
import { TotalDaVenda } from './TotalDaVenda';

/**
 * Cartão "Pagamento e totais" do Pencil (nó `OzP7o` de
 * `design/CentriumCheckout.pen`): coluna branca de 392px à direita da área
 * operacional — `$canvas`, raio 24, hairline `$hairline` de 1px, altura cheia,
 * conteúdo com 16px de folga.
 *
 * **Composição, não implementação.** Cada bloco do desenho é um componente
 * próprio da feature 008; este arquivo só os empilha na ordem do cartão. O
 * rodapé "Ações finais" (`UaFF2`) é da feature 004 e no desenho já vive dentro
 * deste cartão, não solto na tela.
 *
 * **Tradução do posicionamento:** no `.pen` os blocos são `position: absolute`
 * com `top` fixo (16, 60, 104, 178, 274, 350, 435, 576) e `left: 16 / width:
 * 360`. Aqui viram uma coluna flex com folga de 16px. Copiar os `top` absolutos
 * reproduziria o desenho só na altura exata em que ele foi feito: a lista de
 * pagamentos aplicados cresce a cada forma inserida, e o bloco de total ficaria
 * por baixo dela. A coluna preserva a **ordem e as folgas** do desenho, que é o
 * que ele de fato fixa.
 *
 * **A faixa "Métodos de pagamento rápidos"** (`I10H4d`, `top: 16`) chegou com a
 * feature 013 e entrou acima do cabeçalho, como o desenho previa. Ela se omite
 * sozinha quando a sessão não tem cenário de pagamento configurado (`FR-016`) —
 * e também quando o layout é o compacto, porque `projetarAtalhos` recebe a
 * plataforma e devolve lista vazia no mobile (`FR-020` da 013, que é como
 * `FR-005` da 007 se cumpre sem flag de runtime nova).
 *
 * **O que este arquivo deixou de conter na feature 007**: o miolo do pagamento
 * (cabeçalho, condição, desconto de capa, forma, valor, lista de aplicados e o
 * rascunho de forma) mudou para `ConfiguracaoPagamento.tsx`, para que a etapa 2
 * do wizard mobile monte a **mesma** composição em vez de uma cópia dela
 * (`SC-001`). O que sobrou aqui é a moldura do desktop: a coluna de 392px, a
 * faixa de atalhos e o rodapé fixo.
 */
export function PainelPagamentoETotais(): ReactElement {
  return (
    <aside
      className="flex h-full w-[392px] shrink-0 flex-col gap-xs rounded-3xl border border-border bg-card p-base"
      data-testid="painel-pagamento-totais"
    >
      <FaixaAtalhosVendaRapida />

      <ConfiguracaoPagamento alturaFixa />

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

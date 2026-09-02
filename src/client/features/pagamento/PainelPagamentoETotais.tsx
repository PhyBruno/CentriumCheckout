import type { ReactElement } from 'react';
import { AcoesFinaisVenda } from '../finalizacao-suspensao/AcoesFinaisVenda';

/**
 * Cartão "Pagamento e totais" do Pencil (nó `OzP7o` de
 * `design/CentriumCheckout.pen`): coluna branca de 392px à direita da área
 * operacional — `$canvas`, raio 24, hairline `$hairline` de 1px, altura cheia,
 * conteúdo com 16px de folga.
 *
 * **Casca, não implementação.** O corpo do cartão pertence à feature 008
 * (pagamento): métodos rápidos, condição de pagamento, desconto/acréscimo,
 * formas aplicadas e o bloco escuro de total da venda. O que existe aqui hoje é
 * só o rodapé "Ações finais" (`UaFF2`), da feature 004 — que no desenho **já
 * vive dentro deste cartão**, não solto na tela.
 *
 * Criar o cartão agora, vazio, é o que faz o botão de finalizar aparecer no
 * lugar certo desde já: a 008 preenche o espaço acima do rodapé sem precisar
 * mover nada de lugar.
 */
export function PainelPagamentoETotais(): ReactElement {
  return (
    <aside
      className="flex h-full w-[392px] shrink-0 flex-col justify-end rounded-3xl border border-border bg-card p-base"
      data-testid="painel-pagamento-totais"
    >
      <AcoesFinaisVenda />
    </aside>
  );
}

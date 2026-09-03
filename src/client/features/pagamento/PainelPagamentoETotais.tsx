import { Lock, WalletCards } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import type { FormaPagamento } from '../../domain/pagamento/formaPagamento';
import { AcoesFinaisVenda } from '../finalizacao-suspensao/AcoesFinaisVenda';
import { ControleDescontoCapa } from './ControleDescontoCapa';
import { EntradaPagamento } from './EntradaPagamento';
import { ListaPagamentosAplicados } from './ListaPagamentosAplicados';
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

  return (
    <aside
      className="flex h-full w-[392px] shrink-0 flex-col gap-base rounded-3xl border border-border bg-card p-base"
      data-testid="painel-pagamento-totais"
    >
      {/* Nó `y3cr1` "Cabeçalho pagamento": ícone `wallet-cards` de 20px + título
          Inter 18/600 à esquerda, pílula "Seguro" à direita. */}
      <header className="flex h-9 shrink-0 items-center justify-between">
        <div className="flex items-center gap-[10px]">
          <WalletCards className="size-5 shrink-0 text-foreground" aria-hidden="true" />
          <h2 className="text-[18px] font-semibold text-foreground">Pagamento</h2>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1.5">
          <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="text-sm font-semibold text-foreground">Seguro</span>
        </div>
      </header>

      {/* A área central rola: o cartão tem altura fixa (a da tela) e a lista de
          pagamentos aplicados é a única parte que cresce sem limite. Sem isto,
          uma venda com muitas formas empurraria o bloco de total e o botão de
          finalizar para fora do cartão — e o botão de finalizar é justamente o
          que não pode sumir. */}
      <div className="flex min-h-0 flex-1 flex-col gap-base overflow-y-auto">
        <SeletorCondicaoPagamento />
        <ControleDescontoCapa />
        <SeletorFormaPagamento
          formaSelecionada={formaSelecionada}
          onSelecionarForma={setFormaSelecionada}
        />
        <EntradaPagamento forma={formaSelecionada} />
        <ListaPagamentosAplicados />
      </div>

      {/* Total e ações finais ficam fixos no pé do cartão, fora da rolagem: no
          desenho eles são o fecho da coluna, e são a informação que o operador
          confere no instante de cobrar. */}
      <div className="flex shrink-0 flex-col gap-base">
        <TotalDaVenda />
        <AcoesFinaisVenda />
      </div>
    </aside>
  );
}

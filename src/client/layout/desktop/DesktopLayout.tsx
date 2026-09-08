import type { ReactElement } from 'react';
import { CampoClienteVenda } from '../../features/cliente/CampoClienteVenda';
import { EntradaRapidaProduto } from '../../features/carrinho/EntradaRapidaProduto';
import { GridItens } from '../../features/carrinho/GridItens';
import { BarraAtalhosVenda } from '../../features/finalizacao-suspensao/AcoesFinaisVenda';
import { PainelPagamentoETotais } from '../../features/pagamento/PainelPagamentoETotais';
import { BarraSuperior } from '../BarraSuperior';

/**
 * Tela única do desktop (T008) — nó "Área operacional" (`J9t3a`) do Pencil:
 * fundo `$surface-soft`, duas colunas com 20px entre elas e folga de 20/24/24
 * ao redor.
 *
 * **Extraído de `App.tsx`**, onde essa composição vivia inline desde a feature
 * 002 (T027, branch "pronto" do `sessionStore`). O que mudou na mudança de
 * endereço: sumiram os dois `if (compacto)` que decidiam entre grid e lista e
 * entre as duas faixas de ação. Aqui não existe layout compacto para decidir —
 * quem já está dentro de `desktop/` sabe em qual árvore está, e a checagem de
 * breakpoint fica no `AppShell`, sozinha (`research.md` D3, Open/Closed).
 *
 * **Composição, nunca lógica de domínio.** Nenhuma regra de carrinho, cliente,
 * vendedor, pagamento ou finalização mora neste arquivo — cada bloco é o
 * componente que a feature dona já expõe, montado na posição que o desenho
 * fixa. É o que torna `SC-001` verdadeiro por construção: não há regra aqui
 * para divergir da árvore mobile.
 *
 * **Pontos exclusivos do desktop** (`FR-008`/`FR-010`, AD-046), e é por isso que
 * eles aparecem aqui e em nenhum arquivo de `mobile/`:
 * - importação de documento pronto (006) e recuperação de NFCe (011), pelo
 *   `BotaoMenuImportacao` dentro de `BarraAtalhosVenda`;
 * - o "menu gerencial", hoje o botão inerte de engrenagem da `BarraSuperior`
 *   (AD-020/AD-026, ainda sem feature numerada).
 *
 * O campo de vendedor (012) não aparece na lista de filhos porque o desenho o
 * põe **dentro** do card de cliente, e é lá que `CampoClienteVenda` já o monta.
 */
export function DesktopLayout(): ReactElement {
  return (
    <>
      <BarraSuperior />

      <div className="flex min-h-0 flex-1 gap-[20px] px-lg pt-md pb-lg">
        {/* "Venda e produtos" (nó `imX5b`): coluna vertical, gap 16. */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-base">
          {/* "Cliente da venda expansível" (nó `AasDP`): abre a coluna, acima
              da entrada de produto, como no desenho. */}
          <CampoClienteVenda />

          <EntradaRapidaProduto />

          <GridItens />

          <BarraAtalhosVenda />
        </div>

        {/* O cartão de pagamento é a coluna da direita do desenho. */}
        <PainelPagamentoETotais />
      </div>
    </>
  );
}

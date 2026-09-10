import { Element3 } from 'reicon-react';
import { useState, type ReactElement } from 'react';
import { cn } from '@/lib/utils';
import { urlDaTelaGerencial, type DestinoGerencial } from '../../../shared/gerencial';
import { ModalMenuGerencial } from './ModalMenuGerencial';

/**
 * Atalho "Menu Gerencial" da faixa "Atalhos da venda" (Pencil, nó `kLUB1`):
 * pílula de 36px, fundo branco com hairline, ícone `layout-dashboard` de 16px
 * em `#5B616E` e rótulo Inter 12px peso 600 — a mesma pílula de
 * `BotaoCancelarVenda` e `BotaoMenuImportacao`, seus vizinhos na faixa. É o
 * **segundo** dos três atalhos, e ocupa o vão que `BarraAtalhosVenda` já vinha
 * reservando para ele.
 *
 * `layout-dashboard` (nome lucide no `.pen`) vira `Element3` no reicon (AD-201).
 *
 * **Nunca fica bloqueado**, ao contrário de `BotaoMenuImportacao`. Aquele recusa
 * abrir sobre venda iniciada porque importar um documento para dentro dela é
 * inválido (AD-138); aqui as duas opções só levam o operador a uma tela de
 * retaguarda do ERP, em outra aba, sem tocar no carrinho.
 *
 * O estado de abertura mora neste componente, não em `BarraAtalhosVenda`, pelo
 * mesmo motivo do atalho de importação: a faixa é da feature 004 e não deve
 * conhecer o ciclo de vida deste modal.
 */
export function BotaoMenuGerencial(): ReactElement {
  const [aberto, setAberto] = useState(false);

  /**
   * Nova aba, sempre. A venda em andamento não sobrevive a uma navegação — o
   * `vendaStore` é Zustand sem `persist` —, então sair na mesma aba custaria o
   * carrinho do operador para consultar uma sangria. `noopener` porque a tela
   * legada não tem motivo algum para alcançar esta janela por `window.opener`.
   *
   * A URL é da própria origem do Checkout: quem monta o host do ERP é o BFF, em
   * `GET /gerencial/:destino`, a partir do `tenant` do cookie cifrado e do
   * `baseDomain` do ambiente — nenhum dos dois chega ao navegador.
   */
  function escolher(destino: DestinoGerencial): void {
    window.open(urlDaTelaGerencial(destino), '_blank', 'noopener');
    setAberto(false);
  }

  return (
    <>
      <button
        type="button"
        data-testid="botao-menu-gerencial"
        onClick={() => {
          setAberto(true);
        }}
        className={cn(
          'flex h-9 flex-1 items-center justify-center gap-xs rounded-full border border-border bg-card',
          'text-sm font-semibold whitespace-nowrap text-foreground outline-none',
          'focus-visible:ring-[3px] focus-visible:ring-ring/50',
        )}
      >
        <Element3 className="size-4 text-[var(--cc-color-body)]" aria-hidden="true" />
        Menu Gerencial
      </button>

      <ModalMenuGerencial
        aberto={aberto}
        onFechar={() => {
          setAberto(false);
        }}
        onEscolher={escolher}
      />
    </>
  );
}

import type { ReactElement } from 'react';
import { ListaItensMobile } from '../../features/carrinho/ListaItensMobile';
import { ConfiguracaoPagamento } from '../../features/pagamento/ConfiguracaoPagamento';

/**
 * Etapa 2 do wizard — "Produtos e pagamento" (nó `DRz06` do Pencil, T016).
 *
 * Conferência dos itens (003) e o painel de pagamento da 008 **inteiro**:
 * condição, desconto/acréscimo de capa, forma, valor recebido e a lista de
 * formas aplicadas. É literalmente o mesmo `ConfiguracaoPagamento` que o cartão
 * do desktop monta — só a moldura muda (`alturaFixa` fica de fora porque aqui
 * quem rola é a página, não a lista).
 *
 * **TEF incluído** (`FR-009`, AD-144, 2026-09-03, que revogou a exclusão de
 * AD-074): não há nenhuma regra de disponibilidade por layout nesta feature. O
 * que decide se cartão vai ao TEF, se PIX aparece, ou se um vale é aceito é a
 * configuração do ambiente lida pela 008 — e ela nem sabe qual layout está
 * montado. `pagamentoMobile.spec.ts` verifica isso automaticamente.
 */
export function EtapaPagamento(): ReactElement {
  return (
    <div className="flex flex-col gap-sm" data-testid="etapa-pagamento">
      <ListaItensMobile />

      {/* Cartão "Configuração pagamento etapa 2 mobile" (nó `SJvYC`): `$canvas`,
          raio 18, hairline de 1px, folga 14, gap 12. */}
      <section className="flex flex-col gap-sm rounded-[18px] border border-border bg-card p-[14px]">
        <ConfiguracaoPagamento />
      </section>
    </div>
  );
}

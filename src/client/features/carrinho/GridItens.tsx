import type { ReactElement } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatarCentavos } from '../../domain/precificacao/dinheiro';
import { totalLinha, totalVenda, type LinhaCarrinho } from '../../domain/precificacao/linha';
import { formatarQuantidade } from '../../domain/precificacao/quantidade';
import { useVendaStore } from '../../stores/vendaStore';

/**
 * Grid de itens da venda no desktop (T016, estendida em T035/T036).
 *
 * A linha cancelada **permanece visível**, riscada — nunca sai do array
 * (`CART-08`, `FR-009`, invariante I1) — e fica fora dos totais, que são sempre
 * derivados, nunca campos armazenados (invariante I9).
 */
export function GridItens(): ReactElement {
  const { linhas, cancelarItem } = useVendaStore(
    useShallow((estado) => ({ linhas: estado.linhas, cancelarItem: estado.cancelarItem })),
  );

  return (
    <section
      className="flex flex-1 flex-col overflow-hidden rounded-xl border border-border bg-background"
      data-testid="grid-itens"
    >
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Itens da venda em andamento</caption>
        <thead className="bg-muted text-muted-foreground">
          <tr>
            <th scope="col" className="px-base py-sm text-left font-medium">
              Produto
            </th>
            <th scope="col" className="px-base py-sm text-right font-medium">
              Qtd.
            </th>
            <th scope="col" className="px-base py-sm text-left font-medium">
              UN
            </th>
            <th scope="col" className="px-base py-sm text-right font-medium">
              Preço un.
            </th>
            <th scope="col" className="px-base py-sm text-right font-medium">
              Desconto
            </th>
            <th scope="col" className="px-base py-sm text-right font-medium">
              Total
            </th>
            <th scope="col" className="px-base py-sm text-right font-medium">
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {linhas.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-base py-lg text-center text-muted-foreground">
                Nenhum item na venda.
              </td>
            </tr>
          ) : (
            linhas.map((linha) => (
              <LinhaDaGrid key={linha.idLinha} linha={linha} onCancelar={cancelarItem} />
            ))
          )}
        </tbody>
      </table>

      <footer className="mt-auto flex items-center justify-between border-t border-border px-base py-sm">
        <span className="text-sm text-muted-foreground">Total da venda</span>
        <strong className="text-lg" data-testid="total-venda">
          {formatarCentavos(totalVenda(linhas))}
        </strong>
      </footer>
    </section>
  );
}

interface LinhaDaGridProps {
  readonly linha: LinhaCarrinho;
  readonly onCancelar: (idLinha: string) => void;
}

function LinhaDaGrid({ linha, onCancelar }: LinhaDaGridProps): ReactElement {
  return (
    <tr
      data-testid="linha-carrinho"
      data-cancelada={linha.cancelada}
      data-codigo-produto={linha.snapshot.codigoProduto}
      className={cn(
        'border-b border-border last:border-b-0',
        // Riscada e esmaecida, mas ainda legível: é rastreabilidade, não lixo
        // visual (SC-003).
        linha.cancelada && 'text-muted-foreground line-through',
      )}
    >
      <td className="px-base py-sm">
        {linha.snapshot.descricao}
        {linha.cancelada ? <span className="sr-only"> (item cancelado)</span> : null}
      </td>
      <td className="px-base py-sm text-right tabular-nums">
        {formatarQuantidade(linha.quantidade, 3)}
      </td>
      <td className="px-base py-sm">{linha.snapshot.unidadeMedida}</td>
      <td className="px-base py-sm text-right tabular-nums" data-testid="preco-unitario">
        {formatarCentavos(linha.precoUnitario)}
      </td>
      <td className="px-base py-sm text-right tabular-nums">
        {formatarCentavos(linha.descontoLinha)}
      </td>
      <td className="px-base py-sm text-right tabular-nums">
        {formatarCentavos(totalLinha(linha))}
      </td>
      <td className="px-base py-sm text-right">
        {linha.cancelada ? null : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="cancelar-item"
            // Sem modal de confirmação e sem supervisor (`FR-012`, AD-065).
            onClick={() => {
              onCancelar(linha.idLinha);
            }}
          >
            Cancelar
          </Button>
        )}
      </td>
    </tr>
  );
}

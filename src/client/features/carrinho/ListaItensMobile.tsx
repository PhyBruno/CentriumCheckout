import type { ReactElement } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatarCentavos } from '../../domain/precificacao/dinheiro';
import { totalLinha, totalVenda } from '../../domain/precificacao/linha';
import { formatarQuantidade } from '../../domain/precificacao/quantidade';
import { useVendaStore } from '../../stores/vendaStore';

/**
 * Lista de itens no mobile (T017).
 *
 * Layout diferente, **mesma fonte de estado** da grid desktop: o carrinho é um
 * só, e cancelar aqui produz exatamente o mesmo efeito de cancelar lá — inclusive
 * a linha riscada que permanece visível (`CART-08`).
 */
export function ListaItensMobile(): ReactElement {
  const { linhas, cancelarItem } = useVendaStore(
    useShallow((estado) => ({ linhas: estado.linhas, cancelarItem: estado.cancelarItem })),
  );

  return (
    <section className="flex flex-1 flex-col gap-sm" data-testid="lista-itens-mobile">
      <h2 className="sr-only">Itens da venda em andamento</h2>

      {linhas.length === 0 ? (
        <p className="px-base py-lg text-center text-sm text-muted-foreground">
          Nenhum item na venda.
        </p>
      ) : (
        <ul className="flex flex-col gap-sm">
          {linhas.map((linha) => (
            <li
              key={linha.idLinha}
              data-testid="linha-carrinho"
              data-cancelada={linha.cancelada}
              data-codigo-produto={linha.snapshot.codigoProduto}
              className={cn(
                'flex flex-col gap-xs rounded-xl border border-border bg-background p-base',
                linha.cancelada && 'text-muted-foreground line-through',
              )}
            >
              <div className="flex items-start justify-between gap-sm">
                <span className="font-medium">
                  {linha.snapshot.descricao}
                  {linha.cancelada ? <span className="sr-only"> (item cancelado)</span> : null}
                </span>
                <strong className="tabular-nums">{formatarCentavos(totalLinha(linha))}</strong>
              </div>

              <div className="flex items-center justify-between gap-sm text-sm text-muted-foreground">
                <span className="tabular-nums">
                  {formatarQuantidade(linha.quantidade, 3)} {linha.snapshot.unidadeMedida} ×{' '}
                  <span data-testid="preco-unitario">{formatarCentavos(linha.precoUnitario)}</span>
                </span>

                {linha.cancelada ? null : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    data-testid="cancelar-item"
                    onClick={() => {
                      cancelarItem(linha.idLinha);
                    }}
                  >
                    Cancelar
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <footer className="flex items-center justify-between rounded-xl border border-border bg-background px-base py-sm">
        <span className="text-sm text-muted-foreground">Total da venda</span>
        <strong className="text-lg" data-testid="total-venda">
          {formatarCentavos(totalVenda(linhas))}
        </strong>
      </footer>
    </section>
  );
}

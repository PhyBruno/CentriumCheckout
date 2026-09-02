import { Pencil, Trash2 } from 'lucide-react';
import type { ReactElement } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatarCentavos } from '../../domain/precificacao/dinheiro';
import { totalLinha, totalVenda, type LinhaCarrinho } from '../../domain/precificacao/linha';
import { formatarQuantidade } from '../../domain/precificacao/quantidade';
import { useEdicaoItemStore } from '../../stores/edicaoItemStore';
import { useVendaStore } from '../../stores/vendaStore';

/**
 * Lista de itens no mobile (T017).
 *
 * Layout diferente, **mesma fonte de estado** da grid desktop: o carrinho é um
 * só, e cancelar aqui produz exatamente o mesmo efeito de cancelar lá — inclusive
 * a linha riscada que permanece visível (`CART-08`). O mesmo vale para o lápis
 * (correção do usuário, 2026-09-03): carrega a linha na barra de entrada
 * rápida via `useEdicaoItemStore`, compartilhado com `GridItens.tsx`, para os
 * dois layouts produzirem exatamente o mesmo efeito.
 */
export function ListaItensMobile(): ReactElement {
  const { linhas, cancelarItem } = useVendaStore(
    useShallow((estado) => ({
      linhas: estado.linhas,
      cancelarItem: estado.cancelarItem,
    })),
  );
  const { carregarParaEdicao, idLinhaEmEdicao } = useEdicaoItemStore(
    useShallow((estado) => ({
      carregarParaEdicao: estado.carregarParaEdicao,
      idLinhaEmEdicao: estado.linhaEmEdicao?.idLinha ?? null,
    })),
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
            <ItemMobile
              key={linha.idLinha}
              linha={linha}
              onCancelar={cancelarItem}
              onEditar={carregarParaEdicao}
              emEdicaoNaBarra={linha.idLinha === idLinhaEmEdicao}
            />
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

interface ItemMobileProps {
  readonly linha: LinhaCarrinho;
  readonly onCancelar: (idLinha: string) => void;
  /** Mesma semântica de `LinhaDaGrid` (`GridItens.tsx`): carrega a linha na
   * barra de entrada rápida em vez de editar quantidade inline. */
  readonly onEditar: (linha: LinhaCarrinho) => void;
  readonly emEdicaoNaBarra: boolean;
}

function ItemMobile({
  linha,
  onCancelar,
  onEditar,
  emEdicaoNaBarra,
}: ItemMobileProps): ReactElement {
  // Mesma regra de `LinhaDaGrid`: só `''` (não editável) fica sem lápis.
  const editavel = linha.snapshot.pesavelEditavel !== '';

  return (
    <li
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
        <strong className="font-mono tabular-nums">{formatarCentavos(totalLinha(linha))}</strong>
      </div>

      <div className="flex items-center justify-between gap-sm text-sm text-muted-foreground">
        <span className="font-mono tabular-nums">
          {formatarQuantidade(linha.quantidade, 3)} {linha.snapshot.unidadeMedida} ×{' '}
          <span data-testid="preco-unitario">{formatarCentavos(linha.precoUnitario)}</span>
        </span>

        {linha.cancelada ? null : (
          <div className="flex gap-xs">
            <Button
              type="button"
              variant="secondary"
              size="icon-sm"
              className="size-7 rounded-full text-primary"
              aria-label="Editar item"
              data-testid="editar-item"
              disabled={!editavel || emEdicaoNaBarra}
              onClick={() => {
                onEditar(linha);
              }}
            >
              <Pencil className="size-3.5" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon-sm"
              className="size-7 rounded-full text-muted-foreground"
              aria-label="Cancelar"
              data-testid="cancelar-item"
              disabled={emEdicaoNaBarra}
              onClick={() => {
                onCancelar(linha.idLinha);
              }}
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}

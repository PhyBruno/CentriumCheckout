import { useState, type ReactElement } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatarCentavos } from '../../domain/precificacao/dinheiro';
import { totalLinha, totalVenda, type LinhaCarrinho } from '../../domain/precificacao/linha';
import { formatarQuantidade, type Milesimos } from '../../domain/precificacao/quantidade';
import { useVendaStore } from '../../stores/vendaStore';
import { EdicaoQuantidadeItem } from './EdicaoQuantidadeItem';

/**
 * Lista de itens no mobile (T017).
 *
 * Layout diferente, **mesma fonte de estado** da grid desktop: o carrinho é um
 * só, e cancelar aqui produz exatamente o mesmo efeito de cancelar lá — inclusive
 * a linha riscada que permanece visível (`CART-08`). O mesmo vale para editar
 * quantidade (`FR-007`, T030): a `EdicaoQuantidadeItem` compartilhada garante
 * que os dois layouts chamem `editarItem` com a mesma semântica.
 */
export function ListaItensMobile(): ReactElement {
  const { linhas, cancelarItem, editarItem } = useVendaStore(
    useShallow((estado) => ({
      linhas: estado.linhas,
      cancelarItem: estado.cancelarItem,
      editarItem: estado.editarItem,
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
              onEditarQuantidade={(idLinha, quantidade) => {
                editarItem(idLinha, 'quantidade', quantidade);
              }}
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
  readonly onEditarQuantidade: (idLinha: string, quantidade: Milesimos) => void;
}

function ItemMobile({ linha, onCancelar, onEditarQuantidade }: ItemMobileProps): ReactElement {
  // Estado local por item, mesmo raciocínio de `LinhaDaGrid` em `GridItens.tsx`:
  // não é estado da venda, não sobrevive a um F5, e é irrelevante para as
  // demais linhas.
  const [emEdicaoDeQuantidade, setEmEdicaoDeQuantidade] = useState(false);

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
        <strong className="tabular-nums">{formatarCentavos(totalLinha(linha))}</strong>
      </div>

      <div className="flex items-center justify-between gap-sm text-sm text-muted-foreground">
        {emEdicaoDeQuantidade ? (
          <EdicaoQuantidadeItem
            quantidadeAtual={linha.quantidade}
            onConfirmar={(quantidade) => {
              onEditarQuantidade(linha.idLinha, quantidade);
              setEmEdicaoDeQuantidade(false);
            }}
            onCancelar={() => {
              setEmEdicaoDeQuantidade(false);
            }}
          />
        ) : (
          <span className="tabular-nums">
            {formatarQuantidade(linha.quantidade, 3)} {linha.snapshot.unidadeMedida} ×{' '}
            <span data-testid="preco-unitario">{formatarCentavos(linha.precoUnitario)}</span>
          </span>
        )}

        {linha.cancelada || emEdicaoDeQuantidade ? null : (
          <div className="flex gap-xs">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="editar-quantidade-item"
              onClick={() => {
                setEmEdicaoDeQuantidade(true);
              }}
            >
              Editar quantidade
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="cancelar-item"
              onClick={() => {
                onCancelar(linha.idLinha);
              }}
            >
              Cancelar
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}

import { Pencil, Trash2 } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatarCentavos, somar } from '../../domain/precificacao/dinheiro';
import {
  linhasAtivas,
  totalLinha,
  totalVenda,
  type LinhaCarrinho,
} from '../../domain/precificacao/linha';
import { formatarQuantidade, type Milesimos } from '../../domain/precificacao/quantidade';
import { useVendaStore } from '../../stores/vendaStore';
import { EdicaoQuantidadeItem } from './EdicaoQuantidadeItem';

/**
 * Grid de itens da venda no desktop (T016, estendida em T035/T036).
 *
 * A linha cancelada **permanece visível**, riscada — nunca sai do array
 * (`CART-08`, `FR-009`, invariante I1) — e fica fora dos totais, que são sempre
 * derivados, nunca campos armazenados (invariante I9).
 */
export function GridItens(): ReactElement {
  const { linhas, cancelarItem, editarItem } = useVendaStore(
    useShallow((estado) => ({
      linhas: estado.linhas,
      cancelarItem: estado.cancelarItem,
      editarItem: estado.editarItem,
    })),
  );

  return (
    <section
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-background"
      data-testid="grid-itens"
    >
      {/* Só esta área rola — cabeçalho fixo (`sticky`) e o rodapé de resumo
          abaixo ficam sempre visíveis. Sem isso, uma venda com muitas linhas
          rolava a página inteira em vez de só a lista de itens. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Itens da venda em andamento</caption>
          <thead className="sticky top-0 z-10 bg-muted text-muted-foreground">
            <tr>
              <th scope="col" className="px-base py-sm text-left font-medium">
                Item
              </th>
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
                <td colSpan={8} className="px-base py-lg text-center text-muted-foreground">
                  Nenhum item na venda.
                </td>
              </tr>
            ) : (
              linhas.map((linha, indice) => (
                <LinhaDaGrid
                  key={linha.idLinha}
                  linha={linha}
                  numeroItem={indice + 1}
                  zebrada={indice % 2 === 1}
                  onCancelar={cancelarItem}
                  onEditarQuantidade={(idLinha, quantidade) => {
                    editarItem(idLinha, 'quantidade', quantidade);
                  }}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {linhas.length === 0 ? null : (
        // "Resumo parcial carrinho" do Pencil: último item inserido (posição
        // no array, não status — cancelar não reordena, `CART-08`), contagem
        // de linhas ativas e o subtotal. `data-testid="total-venda"`
        // preservado no valor: é o mesmo número de sempre, só a barra ao
        // redor mudou.
        <footer
          className="flex shrink-0 items-center justify-between gap-sm border-t border-border bg-secondary px-lg py-sm"
          data-testid="resumo-parcial-carrinho"
        >
          <span className="text-sm text-muted-foreground" data-testid="ultimo-item-adicionado">
            Último item adicionado: {linhas.at(-1)?.snapshot.descricao}
          </span>
          <span
            className="rounded-full bg-background px-sm py-xxs text-sm font-semibold text-foreground"
            data-testid="quantidade-itens-carrinho"
          >
            {linhasAtivas(linhas).length} {linhasAtivas(linhas).length === 1 ? 'item' : 'itens'}
          </span>
          <span className="flex items-center gap-sm">
            <span className="text-sm text-muted-foreground">Subtotal</span>
            <strong className="text-lg" data-testid="total-venda">
              {formatarCentavos(totalVenda(linhas))}
            </strong>
          </span>
        </footer>
      )}
    </section>
  );
}

interface LinhaDaGridProps {
  readonly linha: LinhaCarrinho;
  /** Posição na venda (1-based) — "Número item" do Pencil, sequência de
   * inserção, não recalculado ao cancelar (a linha cancelada não sai do
   * array, `CART-08`). */
  readonly numeroItem: number;
  /** Zebrado do Pencil (frame "Produtos da venda"): 1ª linha branca
   * (`$canvas`), 2ª cinza (`$surface-soft`), alternando — por posição, não
   * por estado da linha (cancelada ou não). */
  readonly zebrada: boolean;
  readonly onCancelar: (idLinha: string) => void;
  /** `FR-007`/T030 — corrigir a quantidade de uma linha já inserida, sem
   * precisar cancelá-la e reinseri-la. */
  readonly onEditarQuantidade: (idLinha: string, quantidade: Milesimos) => void;
}

function LinhaDaGrid({
  linha,
  numeroItem,
  zebrada,
  onCancelar,
  onEditarQuantidade,
}: LinhaDaGridProps): ReactElement {
  // Estado local por linha: só esta linha entra em modo de edição de
  // quantidade por vez, sem afetar as demais nem sobreviver a um F5 (o
  // carrinho já não sobrevive, `AD-006`) — não pertence ao `vendaStore`.
  const [emEdicaoDeQuantidade, setEmEdicaoDeQuantidade] = useState(false);

  return (
    <tr
      data-testid="linha-carrinho"
      data-cancelada={linha.cancelada}
      data-codigo-produto={linha.snapshot.codigoProduto}
      className={cn(
        'border-b border-border last:border-b-0',
        zebrada && 'bg-muted',
        // Riscada e esmaecida, mas ainda legível: é rastreabilidade, não lixo
        // visual (SC-003).
        linha.cancelada && 'text-muted-foreground line-through',
      )}
    >
      <td className="px-base py-sm font-mono font-semibold text-muted-foreground tabular-nums">
        {String(numeroItem).padStart(2, '0')}
      </td>
      <td className="px-base py-sm">
        <span className="block font-medium text-foreground">{linha.snapshot.descricao}</span>
        <span className="block font-mono text-xs text-muted-foreground">
          {linha.snapshot.codigoProduto}
        </span>
        {linha.cancelada ? <span className="sr-only"> (item cancelado)</span> : null}
      </td>
      <td className="px-base py-sm text-right font-mono tabular-nums">
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
          formatarQuantidade(linha.quantidade, 3)
        )}
      </td>
      <td className="px-base py-sm">{linha.snapshot.unidadeMedida}</td>
      <td className="px-base py-sm text-right font-mono tabular-nums" data-testid="preco-unitario">
        {formatarCentavos(linha.precoUnitario)}
      </td>
      <td className="px-base py-sm text-right font-mono tabular-nums">
        {formatarCentavos(somar(linha.descontoConvenio, linha.descontoManual))}
      </td>
      <td className="px-base py-sm text-right font-mono tabular-nums">
        {formatarCentavos(totalLinha(linha))}
      </td>
      <td className="px-base py-sm text-right">
        {linha.cancelada || emEdicaoDeQuantidade ? null : (
          <div className="flex justify-end gap-xs">
            <Button
              type="button"
              variant="secondary"
              size="icon-sm"
              className="size-7 rounded-full text-primary"
              aria-label="Editar quantidade"
              data-testid="editar-quantidade-item"
              onClick={() => {
                setEmEdicaoDeQuantidade(true);
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
              // Sem modal de confirmação e sem supervisor (`FR-012`, AD-065).
              onClick={() => {
                onCancelar(linha.idLinha);
              }}
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
        )}
      </td>
    </tr>
  );
}

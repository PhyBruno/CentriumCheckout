import { Pencil, Trash2 } from 'lucide-react';
import type { ReactElement } from 'react';
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
import { formatarQuantidade } from '../../domain/precificacao/quantidade';
import { useEdicaoItemStore } from '../../stores/edicaoItemStore';
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
    useShallow((estado) => ({
      linhas: estado.linhas,
      cancelarItem: estado.cancelarItem,
    })),
  );
  // Correção do usuário (2026-09-03): o lápis não edita mais a quantidade
  // inline — carrega a linha inteira na barra de entrada rápida
  // (`EntradaRapidaProduto`, irmã desta grid em `TelaDeVenda`), por isso a
  // coordenação sai de `useEdicaoItemStore`, não de `useVendaStore`.
  const { carregarParaEdicao, idLinhaEmEdicao } = useEdicaoItemStore(
    useShallow((estado) => ({
      carregarParaEdicao: estado.carregarParaEdicao,
      idLinhaEmEdicao: estado.linhaEmEdicao?.idLinha ?? null,
    })),
  );

  // Derivados usados pela faixa de resumo — calculados uma vez, não por célula.
  const ativas = linhasAtivas(linhas);
  const ultimoItem = linhas.at(-1);

  return (
    // "Produtos da venda" do Pencil (nó `q8HBkk`): cartão branco de raio 24 com
    // hairline, recortando a tabela e a faixa de resumo.
    <section
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-border bg-background"
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
                  onEditar={carregarParaEdicao}
                  emEdicaoNaBarra={linha.idLinha === idLinhaEmEdicao}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* "Resumo parcial carrinho" do Pencil (nó `B4Hf3`): último item inserido
          (posição no array, não status — cancelar não reordena, `CART-08`),
          contagem de linhas ativas e o subtotal.

          Renderizado **sempre**, inclusive com a venda vazia: no desenho a
          faixa é parte fixa do cartão de produtos, e some-la enquanto não há
          item faria a tabela mudar de altura na primeira inserção e tiraria da
          tela os contadores que o operador usa para conferir a venda. */}
      <footer
        className="flex h-11 shrink-0 items-center justify-between gap-sm border-t border-border bg-secondary px-[20px]"
        data-testid="resumo-parcial-carrinho"
      >
        <span className="text-sm text-muted-foreground" data-testid="ultimo-item-adicionado">
          {ultimoItem === undefined
            ? 'Nenhum item adicionado ainda'
            : `Último item adicionado: ${ultimoItem.snapshot.descricao}`}
        </span>
        <span
          className="rounded-full bg-background px-sm py-xxs text-sm font-semibold text-foreground"
          data-testid="quantidade-itens-carrinho"
        >
          {ativas.length} {ativas.length === 1 ? 'item' : 'itens'}
        </span>
        <span className="flex items-center gap-sm">
          <span className="text-sm text-muted-foreground">Subtotal</span>
          <strong className="font-mono text-lg" data-testid="total-venda">
            {formatarCentavos(totalVenda(linhas))}
          </strong>
        </span>
      </footer>
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
  /** `FR-007`/T030, redirecionado pela correção do usuário (2026-09-03):
   * carrega a linha inteira na barra de entrada rápida em vez de abrir edição
   * inline de quantidade — quantidade, preço, desconto e total só ficam
   * ajustáveis lá, e só quando a linha for editável (ver `editavel` abaixo). */
  readonly onEditar: (linha: LinhaCarrinho) => void;
  /** `true` quando esta é a linha atualmente carregada na barra — trava as
   * ações da linha até o operador confirmar ou cancelar (Escape) lá, evitando
   * disparar um segundo carregamento por cima do primeiro. */
  readonly emEdicaoNaBarra: boolean;
}

function LinhaDaGrid({
  linha,
  numeroItem,
  zebrada,
  onCancelar,
  onEditar,
  emEdicaoNaBarra,
}: LinhaDaGridProps): ReactElement {
  // `''` é o único valor de `ProdutoPesavelEditavel` sem nada ajustável na
  // barra (AD-063/AD-070): nem preço/desconto (só `'E'` tem) nem sequer
  // quantidade faria sentido reabrir para revisão. `'E'`, `'S'` e `'B'`
  // liberam o lápis — pesável mantém preço/desconto somente leitura na barra,
  // igual à inserção, mas a quantidade continua ajustável.
  const editavel = linha.snapshot.pesavelEditavel !== '';

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
        // Contorno amarelo pulsante enquanto esta linha está carregada na
        // barra (pedido do usuário, 2026-09-03) — sinaliza que ela "sumiu"
        // temporariamente pra revisão, não que foi cancelada.
        emEdicaoNaBarra && 'cc-pulso-edicao',
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
        {formatarQuantidade(linha.quantidade, 3)}
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
        {linha.cancelada ? null : (
          <div className="flex justify-end gap-xs">
            <Button
              type="button"
              variant="secondary"
              size="icon-sm"
              className="size-7 rounded-full text-primary"
              aria-label="Editar item"
              data-testid="editar-item"
              // Só `''` (não editável, AD-063/AD-070) fica sem nada
              // ajustável na barra — correção do usuário (2026-09-03).
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
              // Sem modal de confirmação e sem supervisor (`FR-012`, AD-065).
              // Travado enquanto a linha está carregada na barra: cancelar
              // por baixo do que está em revisão deixaria a barra confirmando
              // uma linha que não existe mais.
              disabled={emEdicaoNaBarra}
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

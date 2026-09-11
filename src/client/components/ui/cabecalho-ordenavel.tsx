import { ArrowDown, ArrowUp, SortDownUp } from 'reicon-react';
import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { cn } from '@/lib/utils';

/**
 * Ordenação das tabelas dos modais de importação (DAV e NFCe).
 *
 * **Ordena só a página carregada, e isso é o contrato — não uma limitação
 * escondida.** `ListaDAVs` e `GetListaNFCes` paginam no servidor e não aceitam
 * parâmetro de ordenação (AD-220 já mostrou que nem o filtro de data o segundo
 * endpoint respeita), então não existe informação local sobre as linhas das
 * outras páginas. Ordenar o que está em mãos é o máximo honesto: o operador vê
 * a página corrente reorganizada, nunca um "top 10 geral" que a tela não tem
 * como calcular.
 *
 * **A escolha sobrevive à troca de página** porque o estado mora no componente
 * do modal, não na tabela: durante o `isFetching` a tabela é substituída pelo
 * skeleton e desmonta, e um `useState` dentro dela perderia a coluna escolhida
 * exatamente no passo em que o operador mais espera que ela continue valendo.
 */
export type DirecaoOrdenacao = 'asc' | 'desc';

export interface OrdenacaoAtiva<Chave extends string> {
  readonly chave: Chave;
  readonly direcao: DirecaoOrdenacao;
}

/**
 * Extrator do valor comparável de cada coluna, uma entrada por chave.
 *
 * Declare o mapa como constante de módulo no arquivo que usa o hook: ele entra
 * nas dependências do `useMemo` que ordena, e um literal recriado a cada render
 * refaria a ordenação sem necessidade.
 */
export type ValoresDeColuna<Linha, Chave extends string> = Readonly<
  Record<Chave, (linha: Linha) => string | number>
>;

export interface OrdenacaoDeTabela<Linha, Chave extends string> {
  /** A página recebida, reordenada — ou ela mesma, enquanto nada foi escolhido. */
  readonly linhas: readonly Linha[];
  readonly ordenacao: OrdenacaoAtiva<Chave> | null;
  /** Primeiro clique ordena crescente; o seguinte na mesma coluna inverte. */
  readonly alternar: (chave: Chave) => void;
}

/**
 * Compara dois valores de coluna respeitando o tipo de cada um.
 *
 * Números saem da subtração (preserva centavos negativos e evita a ordem
 * lexicográfica que colocaria `R$ 100,00` antes de `R$ 20,00`). O resto vai por
 * `localeCompare` com `numeric`, que resolve de uma vez três formatos desta
 * base: datas ISO (`YYYY-MM-DD`, cronológicas já em ordem lexicográfica),
 * números em texto com zeros à esquerda (`004821` antes de `004790`? não —
 * `numeric` compara 4821 com 4790) e nomes com acento.
 */
function compararValores(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }

  return String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' });
}

export function useOrdenacaoDeTabela<Linha, Chave extends string>(
  linhas: readonly Linha[],
  valoresDeColuna: ValoresDeColuna<Linha, Chave>,
): OrdenacaoDeTabela<Linha, Chave> {
  const [ordenacao, setOrdenacao] = useState<OrdenacaoAtiva<Chave> | null>(null);

  const alternar = useCallback((chave: Chave) => {
    setOrdenacao((atual) => {
      if (atual === null || atual.chave !== chave) {
        return { chave, direcao: 'asc' };
      }

      return { chave, direcao: atual.direcao === 'asc' ? 'desc' : 'asc' };
    });
  }, []);

  const ordenadas = useMemo(() => {
    if (ordenacao === null) {
      return linhas;
    }

    const valorDe = valoresDeColuna[ordenacao.chave];
    const sinal = ordenacao.direcao === 'asc' ? 1 : -1;

    // Cópia antes do `sort`: `linhas` vem do cache do TanStack Query e ordenar
    // no lugar mutaria o objeto cacheado, que outras telas leem.
    return [...linhas].sort((esquerda, direita) => {
      return sinal * compararValores(valorDe(esquerda), valorDe(direita));
    });
  }, [linhas, ordenacao, valoresDeColuna]);

  return { linhas: ordenadas, ordenacao, alternar };
}

export interface CabecalhoOrdenavelProps<Chave extends string> {
  readonly chaveDaColuna: Chave;
  readonly rotulo: string;
  readonly ordenacao: OrdenacaoAtiva<Chave> | null;
  readonly onAlternar: (chave: Chave) => void;
  /** Largura da coluna, para casar com a célula correspondente da linha. */
  readonly className?: string;
  /** Colunas numéricas do desenho alinham o rótulo à direita. */
  readonly alinharADireita?: boolean;
}

/**
 * Célula de cabeçalho clicável.
 *
 * O bloco de cabeçalho destas tabelas era `aria-hidden` — sinalização visual
 * sobre `div`/`span`, com o conteúdo de cada linha nomeado pelo `aria-label` da
 * própria linha. Com o clique de ordenação ele deixa de poder sê-lo: esconder
 * da árvore de acessibilidade um controle operável tiraria a ordenação de quem
 * usa leitor de tela ou teclado. O estado vai no `aria-label` (e não em
 * `aria-sort`, que só vale dentro de uma `table`/`grid` de verdade).
 */
export function CabecalhoOrdenavel<Chave extends string>({
  chaveDaColuna,
  rotulo,
  ordenacao,
  onAlternar,
  className,
  alinharADireita = false,
}: CabecalhoOrdenavelProps<Chave>): ReactElement {
  const ativo = ordenacao !== null && ordenacao.chave === chaveDaColuna;
  const crescente = ativo && ordenacao.direcao === 'asc';

  return (
    <button
      type="button"
      data-testid={`ordenar-${chaveDaColuna}`}
      data-ordenacao={ativo ? ordenacao.direcao : 'nenhuma'}
      aria-label={
        ativo
          ? `${rotulo}: ordenado em ordem ${crescente ? 'crescente' : 'decrescente'}. Ative para inverter.`
          : `${rotulo}: ative para ordenar a página por esta coluna.`
      }
      className={cn(
        'group flex h-full items-center gap-[4px] px-[10px] text-xs font-bold text-muted-foreground',
        'hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        ativo && 'text-foreground',
        alinharADireita && 'justify-end',
        className,
      )}
      onClick={() => {
        onAlternar(chaveDaColuna);
      }}
    >
      <span className="truncate">{rotulo}</span>
      {ativo ? (
        crescente ? (
          <ArrowUp className="size-3 shrink-0 text-primary" aria-hidden="true" />
        ) : (
          <ArrowDown className="size-3 shrink-0 text-primary" aria-hidden="true" />
        )
      ) : (
        // Some em repouso para não transformar o cabeçalho num varal de setas:
        // a dica aparece quando o ponteiro ou o foco chega na coluna.
        <SortDownUp
          className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-50 group-focus-visible:opacity-50"
          aria-hidden="true"
        />
      )}
    </button>
  );
}

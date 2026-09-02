import { useState, type ReactElement } from 'react';
import { Skeleton } from 'boneyard-js/react';
import { Button } from '@/components/ui/button';
import { useBuscaProdutos } from '../../services/produto/produtoQueries';
import { EdicaoItemEditavel } from './EdicaoItemEditavel';
import {
  useInsercaoDeProduto,
  useQtdMinCharParaConsulta,
  type PendenteDeEdicao,
} from './useCarrinho';

/**
 * Modal de busca de produto por termo livre (T015, `CART-01`).
 *
 * O resultado da busca é **só um seletor de código**: escolher um candidato
 * dispara `GetProduto` para aquele `CodigoProduto`, e é dessa resposta que a
 * linha é montada (AD-091, `research.md` D1). `GetListaProdutos` não traz
 * `PrecoVenda` nem `ProdutoPesavelEditavel`, então montar a linha aqui daria
 * preço errado sempre que `TipoPreco ∉ {1..5}`.
 */
export interface ModalBuscaProdutoProps {
  readonly aberto: boolean;
  readonly onFechar: () => void;
}

export function ModalBuscaProduto({
  aberto,
  onFechar,
}: ModalBuscaProdutoProps): ReactElement | null {
  const [termo, setTermo] = useState('');
  const [pagina, setPagina] = useState(1);
  const [pendente, setPendente] = useState<PendenteDeEdicao | null>(null);
  const { inserirPorSelecao, confirmarEdicao } = useInsercaoDeProduto();
  const qtdMinChar = useQtdMinCharParaConsulta();

  // Piso vem do ERP (AD-024). Enquanto o bootstrap não chegou, um piso
  // inalcançável mantém a busca desligada — melhor não buscar do que buscar com
  // um mínimo inventado.
  const minimo = qtdMinChar ?? Number.POSITIVE_INFINITY;
  const busca = useBuscaProdutos(termo, { qtdMinCharParaConsulta: minimo, pagina });

  if (!aberto) {
    return null;
  }

  const termoLimpo = termo.trim();
  const abaixoDoMinimo = termoLimpo.length < minimo;

  async function selecionar(codigoProduto: string): Promise<void> {
    const resultado = await inserirPorSelecao(codigoProduto);
    if (resultado.situacao === 'edicao') {
      setPendente(resultado);
      return;
    }
    if (resultado.situacao === 'inserido') {
      onFechar();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-lg"
      data-testid="modal-busca-produto"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Buscar produto"
        className="flex max-h-full w-full max-w-2xl flex-col gap-base overflow-hidden rounded-xl bg-background p-base shadow-lg"
      >
        <header className="flex items-center justify-between gap-sm">
          <h2 className="text-lg font-medium">Buscar produto</h2>
          <Button type="button" variant="ghost" size="sm" onClick={onFechar}>
            Fechar
          </Button>
        </header>

        <label className="flex flex-col gap-xxs text-sm">
          Termo de busca
          <input
            className="h-10 rounded-lg border border-border px-3"
            data-testid="campo-busca-produto"
            autoComplete="off"
            autoFocus
            value={termo}
            onChange={(evento) => {
              setTermo(evento.target.value);
              // Nova busca sempre começa na página 1 — trocar o termo com a
              // página em 3, por exemplo, não deve reconsultar a página 3 do
              // resultado novo (que pode nem existir).
              setPagina(1);
            }}
          />
        </label>

        <div className="min-h-40 flex-1 overflow-y-auto" aria-live="polite">
          {abaixoDoMinimo ? (
            <p
              className="p-base text-sm text-muted-foreground"
              data-testid="busca-abaixo-do-minimo"
            >
              {qtdMinChar === null
                ? 'Aguardando a configuração do ponto de venda.'
                : `Digite ao menos ${String(qtdMinChar)} caracteres para buscar.`}
            </p>
          ) : busca.isPending || busca.isFetching ? (
            // O shimmer é gerado pelo Boneyard a partir da estrutura real; sem
            // os bones capturados (`npm run bones`), vale o `fallback` estático.
            <Skeleton
              name="busca-produtos"
              loading
              fixture={<EstruturaResultados />}
              fallback={<EstruturaResultados aria-hidden />}
            >
              <EstruturaResultados />
            </Skeleton>
          ) : busca.isError ? (
            <p className="p-base text-sm text-destructive">
              Não foi possível buscar produtos. Tente novamente.
            </p>
          ) : (
            <ResultadosDaBusca
              produtos={busca.data?.Produtos ?? []}
              onSelecionar={(codigo) => {
                void selecionar(codigo);
              }}
            />
          )}
        </div>

        {busca.data === undefined || abaixoDoMinimo ? null : (
          <footer
            className="flex items-center justify-between gap-sm text-sm text-muted-foreground"
            data-testid="paginacao-busca"
          >
            <span>
              Página {busca.data.PaginaAtual} de {busca.data.TotalPaginas} ·{' '}
              {busca.data.TotalRegistros} produto(s)
            </span>
            <div className="flex items-center gap-xs">
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="pagina-anterior"
                disabled={pagina <= 1}
                onClick={() => {
                  setPagina((atual) => Math.max(1, atual - 1));
                }}
              >
                Anterior
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="pagina-proxima"
                disabled={busca.data.PaginaAtual >= busca.data.TotalPaginas}
                onClick={() => {
                  setPagina((atual) => atual + 1);
                }}
              >
                Próxima
              </Button>
            </div>
          </footer>
        )}

        {pendente === null ? null : (
          <EdicaoItemEditavel
            pendente={pendente}
            onConfirmar={(ajustes) => {
              confirmarEdicao(pendente, ajustes);
              setPendente(null);
              onFechar();
            }}
            onCancelar={() => {
              setPendente(null);
            }}
          />
        )}
      </div>
    </div>
  );
}

interface ResultadosDaBuscaProps {
  readonly produtos: readonly {
    CodigoProduto: string;
    Descricao: string;
    Referencia: string;
    CodigoBarras: string;
    UDM: string;
  }[];
  readonly onSelecionar: (codigoProduto: string) => void;
}

function ResultadosDaBusca({ produtos, onSelecionar }: ResultadosDaBuscaProps): ReactElement {
  if (produtos.length === 0) {
    return (
      <p className="p-base text-sm text-muted-foreground" data-testid="busca-sem-resultados">
        Nenhum produto encontrado para o termo informado.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-xs" data-testid="resultados-busca">
      {produtos.map((produto) => (
        <li key={produto.CodigoProduto}>
          <button
            type="button"
            data-testid="candidato-produto"
            data-codigo-produto={produto.CodigoProduto}
            className="flex w-full flex-col gap-xxs rounded-lg border border-border px-base py-sm text-left hover:bg-accent"
            onClick={() => {
              onSelecionar(produto.CodigoProduto);
            }}
          >
            <span className="font-medium">{produto.Descricao}</span>
            <span className="text-sm text-muted-foreground">
              {produto.CodigoProduto} · {produto.Referencia} · {produto.CodigoBarras} ·{' '}
              {produto.UDM}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Estrutura de layout que o Boneyard fotografa para gerar o shimmer da lista. */
function EstruturaResultados(props: { 'aria-hidden'?: boolean }): ReactElement {
  return (
    <ul className="flex flex-col gap-xs" aria-hidden={props['aria-hidden']}>
      {Array.from({ length: 6 }, (_, indice) => (
        <li
          key={indice}
          className="flex flex-col gap-xxs rounded-lg border border-border px-base py-sm"
        >
          <div className="h-4.5 rounded-sm bg-secondary" style={{ width: `${80 - indice * 5}%` }} />
          <div className="h-3.5 rounded-sm bg-secondary" style={{ width: '45%' }} />
        </li>
      ))}
    </ul>
  );
}

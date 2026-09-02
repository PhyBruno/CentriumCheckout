import { ChevronLeft, ChevronRight, CircleCheck, PackageSearch, Search, X } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { Skeleton } from 'boneyard-js/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useBuscaProdutos } from '../../services/produto/produtoQueries';
import { useQtdMinCharParaConsulta } from './useCarrinho';

/**
 * Modal de busca de produto por termo livre (T015, `CART-01`) — réplica do
 * frame "PDV Online Web - Modal produto" do Pencil (`design/CentriumCheckout.pen`,
 * nó `UM0Ej`, confirmado via MCP do Pencil).
 *
 * O mockup do Pencil também desenha colunas "Saldo" e "Preço" e filtros de
 * grupo/estoque na barra de busca — **omitidos aqui de propósito**:
 * `GetListaProdutos` não devolve `PrecoVenda` nem estoque (comentário em
 * `produto.schema.ts`, AD-091) e não existe parâmetro de filtro por grupo no
 * contrato consumido por este componente. Mostrar essas colunas exigiria
 * inventar dado que o ERP não manda — exatamente o que este projeto proíbe.
 *
 * O modal é **só um seletor de código** — não resolve, não revisa e não
 * insere nada sozinho. Escolher um candidato só devolve o `CodigoProduto`
 * via `onProdutoSelecionado`; quem faz a chamada a `GetProduto`, decide se o
 * produto é editável/pesável e mostra os campos de revisão é a barra de
 * entrada rápida (`EntradaRapidaProduto`, que também é quem monta este
 * modal) — o mesmo caminho de quando o operador digita o código e aperta TAB.
 * Achado do usuário (2026-09-03): a revisão vivia por engano dentro deste
 * modal (via `EdicaoItemEditavel`), duplicando a UI que já existe na barra.
 */
export interface ModalBuscaProdutoProps {
  readonly aberto: boolean;
  readonly onFechar: () => void;
  readonly onProdutoSelecionado: (codigoProduto: string) => void;
}

/**
 * Espera sem digitar antes de consultar o ERP (achado da revisão de código):
 * sem isto, cada tecla acima do piso de `QtdMinCharParaConsulta` disparava uma
 * chamada real a `GetListaProdutos` — digitar um termo de 18 caracteres virava
 * ~15 requisições. O piso de caracteres (AD-024) continua reagindo à digitação
 * crua, sem debounce — só a chamada de rede espera o operador parar de digitar.
 */
const DEBOUNCE_BUSCA_MS = 300;

export function ModalBuscaProduto({
  aberto,
  onFechar,
  onProdutoSelecionado,
}: ModalBuscaProdutoProps): ReactElement | null {
  const [termo, setTermo] = useState('');
  const [termoDebounced, setTermoDebounced] = useState('');
  const [pagina, setPagina] = useState(1);
  const qtdMinChar = useQtdMinCharParaConsulta();

  // O componente nunca desmonta (`App.tsx` sempre o renderiza, `aberto` só
  // controla se devolve `null`) — sem isto, reabrir o modal reaproveitava o
  // termo/página da consulta anterior em vez de começar do zero. Reseta
  // durante a própria renderização (padrão oficial do React para "ajustar
  // estado quando uma prop muda"), não num `useEffect`: um efeito só rodaria
  // depois do primeiro render com `aberto=true`, e nesse meio-tempo
  // `useBuscaProdutos` já teria dado um flash de busca com o termo antigo.
  const [abertoAnterior, setAbertoAnterior] = useState(aberto);
  if (aberto !== abertoAnterior) {
    setAbertoAnterior(aberto);
    if (aberto) {
      setTermo('');
      setTermoDebounced('');
      setPagina(1);
    }
  }

  // O `useEffect` (e não o ajuste-durante-render acima) é obrigatório aqui:
  // debounce é inerentemente assíncrono — não existe "valor calculável agora"
  // para `termoDebounced`, só um efeito colateral (timer) que dispara no futuro.
  useEffect(() => {
    const temporizador = setTimeout(() => {
      setTermoDebounced(termo);
    }, DEBOUNCE_BUSCA_MS);
    return () => {
      clearTimeout(temporizador);
    };
  }, [termo]);

  // Piso vem do ERP (AD-024). Enquanto o bootstrap não chegou, um piso
  // inalcançável mantém a busca desligada — melhor não buscar do que buscar com
  // um mínimo inventado.
  const minimo = qtdMinChar ?? Number.POSITIVE_INFINITY;
  const busca = useBuscaProdutos(termoDebounced, { qtdMinCharParaConsulta: minimo, pagina });

  if (!aberto) {
    return null;
  }

  const termoLimpo = termo.trim();
  const abaixoDoMinimo = termoLimpo.length < minimo;

  function selecionar(codigoProduto: string): void {
    onProdutoSelecionado(codigoProduto);
    onFechar();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-lg"
      data-testid="modal-busca-produto"
      onKeyDown={(evento) => {
        if (evento.key === 'Escape') {
          onFechar();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Buscar produto"
        className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-background shadow-lg"
      >
        <header className="flex items-center justify-between gap-sm border-b border-border px-lg py-base">
          <div className="flex items-center gap-sm">
            <span className="flex size-[42px] shrink-0 items-center justify-center rounded-full bg-secondary">
              <PackageSearch className="size-5 text-primary" aria-hidden="true" />
            </span>
            <div className="flex flex-col gap-[2px]">
              <h2 className="text-xl font-semibold text-foreground">Consultar produto</h2>
              <p className="text-sm font-medium text-muted-foreground">
                Busque por código, descrição, SKU ou referência
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="icon-sm"
            className="size-10 shrink-0 rounded-full"
            aria-label="Fechar"
            onClick={onFechar}
          >
            <X className="size-4.5" aria-hidden="true" />
          </Button>
        </header>

        <div className="flex flex-col gap-sm border-b border-border px-lg py-base">
          <label className="flex h-11 items-center gap-sm rounded-full bg-secondary px-base text-sm font-medium text-foreground">
            <Search className="size-4.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">Termo de busca</span>
            <input
              className="h-full w-full bg-transparent outline-none placeholder:text-muted-foreground"
              data-testid="campo-busca-produto"
              autoComplete="off"
              autoFocus
              placeholder="Busque por código, descrição, SKU ou referência"
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
          {busca.data === undefined || abaixoDoMinimo ? null : (
            <p className="text-sm font-semibold text-foreground">
              {busca.data.TotalRegistros} produto(s) encontrado(s)
            </p>
          )}
        </div>

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
            className="flex items-center justify-between gap-sm border-t border-border px-lg py-sm"
            data-testid="paginacao-busca"
          >
            <span className="sr-only">
              Página {busca.data.PaginaAtual} de {busca.data.TotalPaginas} ·{' '}
              {busca.data.TotalRegistros} produto(s)
            </span>
            <div className="flex items-center gap-xs">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="gap-xs rounded-full"
                data-testid="pagina-anterior"
                disabled={pagina <= 1}
                onClick={() => {
                  setPagina((atual) => Math.max(1, atual - 1));
                }}
              >
                <ChevronLeft className="size-3.5" aria-hidden="true" />
                Anterior
              </Button>
              <span className="flex h-9 items-center rounded-full bg-secondary px-sm text-xs font-semibold text-foreground">
                {busca.data.PaginaAtual} de {busca.data.TotalPaginas}
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="gap-xs rounded-full"
                data-testid="pagina-proxima"
                disabled={busca.data.PaginaAtual >= busca.data.TotalPaginas}
                onClick={() => {
                  setPagina((atual) => atual + 1);
                }}
              >
                Próxima
                <ChevronRight className="size-3.5" aria-hidden="true" />
              </Button>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="gap-xs rounded-full"
              onClick={onFechar}
            >
              <X className="size-3.5" aria-hidden="true" />
              Cancelar
            </Button>
          </footer>
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

const classeCelulaCabecalho =
  'flex h-full items-center px-sm text-xs font-bold text-muted-foreground';

function ResultadosDaBusca({ produtos, onSelecionar }: ResultadosDaBuscaProps): ReactElement {
  if (produtos.length === 0) {
    return (
      <p className="p-base text-sm text-muted-foreground" data-testid="busca-sem-resultados">
        Nenhum produto encontrado para o termo informado.
      </p>
    );
  }

  return (
    <div data-testid="resultados-busca">
      <div className="flex h-9 border-y border-border bg-muted" aria-hidden="true">
        <span className={cn(classeCelulaCabecalho, 'w-11')} />
        <span className={cn(classeCelulaCabecalho, 'w-32')}>Código</span>
        <span className={cn(classeCelulaCabecalho, 'flex-1')}>Produto</span>
        <span className={cn(classeCelulaCabecalho, 'w-24')}>Unidade</span>
      </div>
      <ul>
        {produtos.map((produto) => (
          <li key={produto.CodigoProduto} className="border-b border-border last:border-b-0">
            <button
              type="button"
              data-testid="candidato-produto"
              data-codigo-produto={produto.CodigoProduto}
              className="flex w-full items-center py-sm text-left hover:bg-accent"
              onClick={() => {
                onSelecionar(produto.CodigoProduto);
              }}
            >
              {/* `circle-check` do Pencil (MCP, nó `UM0Ej`, "Resultado produto
                  ... check"): indica que escolher a linha carrega o código no
                  campo — correção do usuário, 2026-09-03 (era `Circle`). */}
              <span className="flex w-11 shrink-0 items-center justify-center">
                <CircleCheck className="size-4 text-muted-foreground/60" aria-hidden="true" />
              </span>
              <span className="w-32 shrink-0 px-sm font-mono text-sm font-bold tabular-nums">
                {produto.CodigoProduto}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-xxs px-sm">
                <span className="truncate font-medium">{produto.Descricao}</span>
                <span className="truncate text-xs text-muted-foreground">
                  Referência: {produto.Referencia} · EAN: {produto.CodigoBarras}
                </span>
              </span>
              <span className="w-24 shrink-0 px-sm text-sm font-medium">{produto.UDM}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Estrutura de layout que o Boneyard fotografa para gerar o shimmer da lista. */
function EstruturaResultados(props: { 'aria-hidden'?: boolean }): ReactElement {
  return (
    <ul className="flex flex-col gap-xs p-base" aria-hidden={props['aria-hidden']}>
      {Array.from({ length: 6 }, (_, indice) => (
        <li key={indice} className="flex flex-col gap-xxs rounded-lg border border-border p-sm">
          <div className="h-4.5 rounded-sm bg-secondary" style={{ width: `${80 - indice * 5}%` }} />
          <div className="h-3.5 rounded-sm bg-secondary" style={{ width: '45%' }} />
        </li>
      ))}
    </ul>
  );
}

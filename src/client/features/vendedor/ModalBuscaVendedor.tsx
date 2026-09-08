import { ChevronLeft, ChevronRight, CircleCheck, Search, UserRound, X } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { Skeleton } from 'boneyard-js/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useFocoDeModal } from '@/lib/useFocoDeModal';
import { DURACAO_SAIDA_MODAL_MS, usePresenca } from '@/lib/usePresenca';
import type { VendedorDaLista } from '../../../shared/schemas/vendedor.schema';
import { useBuscaVendedores } from '../../services/vendedor/vendedorQueries';
import { useQtdMinCharParaConsulta } from './useVendedor';

/**
 * Modal de busca de vendedor por termo livre (T013, `VEND-01`/`VEND-02`) —
 * réplica do frame "Modal consulta de vendedor" do Pencil (nó `Modal consulta
 * de vendedor` em `design/CentriumCheckout.pen`): 960px, raio 24, cabeçalho de
 * 78px com ícone `user-round` em pílula de 42px, barra de filtros de 108px,
 * tabela com cabeçalho de 38px e linhas de 50px, rodapé de 60px com paginação.
 *
 * **Três ausências deliberadas em relação ao mockup** (AD-103, mesma decisão de
 * AD-093 para cliente): o chip de filtro "Ativo", a coluna "Status" e o
 * subtítulo de função da linha ("Vendedora responsável"). `GetListaVendedores`
 * não tem parâmetro de status nem campo de status/função na resposta —
 * desenhá-los exigiria inventar o estado e o cargo do cadastro. A ausência é o
 * comportamento correto, não uma regressão (`quickstart.md`, Cenário 2).
 *
 * A quarta ausência é o rótulo "Origem: vendedor da NFCe" do rodapé de filtros:
 * o campo de vendedor **não** distingue de onde o vendedor veio (I5/AD-053), e
 * um texto de origem no modal contradiria isso — o subtítulo do cabeçalho já
 * diz para que serve a escolha.
 *
 * Ao contrário de `ModalBuscaCliente`, o clique numa linha é **definitivo**: o
 * item da lista já traz `VendedorCodigo` e `VendedorNome`, que é tudo que a
 * venda consome, e não existe endpoint singular de vendedor no contrato
 * (`research.md` D1). Não há segunda chamada e não há CTA de cadastro —
 * vendedor não é cadastrado pelo Checkout (`FR-015`).
 */
export interface VendedorEscolhido {
  readonly codigo: number;
  readonly nome: string;
}

export interface ModalBuscaVendedorProps {
  readonly aberto: boolean;
  readonly onFechar: () => void;
  /**
   * Recebe o vendedor já montado a partir do item da lista — definitivo
   * (`research.md` D1). Quem chama fecha o modal sem exigir confirmação
   * separada (`VEND-02`).
   */
  readonly onVendedorSelecionado: (vendedor: VendedorEscolhido) => void;
}

/** Mesmo debounce das buscas de produto e cliente. */
const DEBOUNCE_BUSCA_MS = 300;

export function ModalBuscaVendedor({
  aberto,
  onFechar,
  onVendedorSelecionado,
}: ModalBuscaVendedorProps): ReactElement | null {
  const [termo, setTermo] = useState('');
  const [termoDebounced, setTermoDebounced] = useState('');
  const [pagina, setPagina] = useState(1);
  const qtdMinChar = useQtdMinCharParaConsulta();

  const [abertoAnterior, setAbertoAnterior] = useState(aberto);
  if (aberto !== abertoAnterior) {
    setAbertoAnterior(aberto);
    if (aberto) {
      setTermo('');
      setTermoDebounced('');
      setPagina(1);
    }
  }

  useEffect(() => {
    const temporizador = setTimeout(() => {
      setTermoDebounced(termo);
    }, DEBOUNCE_BUSCA_MS);
    return () => {
      clearTimeout(temporizador);
    };
  }, [termo]);

  // Piso vem do ERP (AD-024). Sem bootstrap, um piso inalcançável mantém a
  // busca desligada — melhor não buscar do que buscar com um mínimo inventado.
  const minimo = qtdMinChar ?? Number.POSITIVE_INFINITY;
  const busca = useBuscaVendedores(termoDebounced, {
    qtdMinCharParaConsulta: minimo,
    pagina,
  });

  const { montado, saindo } = usePresenca(aberto, DURACAO_SAIDA_MODAL_MS);
  const janelaRef = useFocoDeModal<HTMLDivElement>(aberto);

  // Fechar não desmonta na hora: o overlay fica no DOM pelo tempo da animação
  // de saída (`usePresenca`).
  if (!montado) {
    return null;
  }

  const abaixoDoMinimo = termo.trim().length < minimo;
  const semResultado = busca.data !== undefined && busca.data.Vendedores.length === 0;

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-start justify-center bg-[color-mix(in_srgb,var(--cc-color-ink)_40%,transparent)] p-lg',
        saindo ? 'cc-backdrop-sai' : 'cc-backdrop-entra',
      )}
      data-testid="modal-busca-vendedor"
      onKeyDown={(evento) => {
        if (evento.key === 'Escape') {
          onFechar();
        }
      }}
    >
      <div
        ref={janelaRef}
        role="dialog"
        aria-modal="true"
        aria-label="Consultar vendedor"
        className={cn(
          'flex max-h-full w-full max-w-[960px] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-lg',
          saindo ? 'cc-modal-sai' : 'cc-modal-entra',
        )}
      >
        <header className="flex h-[78px] shrink-0 items-center justify-between gap-sm border-b border-border px-lg">
          <div className="flex items-center gap-sm">
            <span className="flex size-[42px] shrink-0 items-center justify-center rounded-full bg-secondary">
              <UserRound className="size-5 text-primary" aria-hidden="true" />
            </span>
            <div className="flex flex-col gap-[2px]">
              <h2 className="text-xl font-semibold text-foreground">Consultar vendedor</h2>
              <p className="text-sm font-medium text-muted-foreground">
                Selecione o vendedor informado na NFCe
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="icon-lg"
            className="shrink-0 rounded-full"
            aria-label="Fechar"
            onClick={onFechar}
          >
            <X className="size-4.5" aria-hidden="true" />
          </Button>
        </header>

        <div className="flex shrink-0 flex-col gap-xs border-b border-border px-lg py-[14px]">
          <label className="flex h-11 items-center gap-xs rounded-full bg-secondary px-base text-md font-medium text-foreground">
            <Search className="size-4.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">Termo de busca</span>
            <input
              className="h-full w-full bg-transparent outline-none placeholder:text-muted-foreground"
              data-testid="campo-busca-vendedor"
              autoComplete="off"
              autoFocus
              placeholder="Busque o vendedor pelo nome"
              value={termo}
              onChange={(evento) => {
                setTermo(evento.target.value);
                setPagina(1);
              }}
            />
          </label>
          {busca.data === undefined || abaixoDoMinimo ? null : (
            <p className="text-base font-semibold text-foreground">
              {busca.data.TotalRegistros} vendedor(es) encontrado(s)
            </p>
          )}
        </div>

        <div className="min-h-40 flex-1 overflow-y-auto" aria-live="polite">
          {abaixoDoMinimo ? (
            <p
              className="p-base text-md text-muted-foreground"
              data-testid="busca-vendedor-abaixo-do-minimo"
            >
              {qtdMinChar === null
                ? 'Aguardando a configuração do ponto de venda.'
                : `Digite ao menos ${String(qtdMinChar)} caracteres para buscar.`}
            </p>
          ) : busca.isPending || busca.isFetching ? (
            <Skeleton
              name="busca-vendedores"
              loading
              fixture={<EstruturaResultados />}
              fallback={<EstruturaResultados aria-hidden />}
            >
              <EstruturaResultados />
            </Skeleton>
          ) : busca.isError ? (
            <p className="p-base text-md text-destructive">
              Não foi possível buscar vendedores. Tente novamente.
            </p>
          ) : semResultado ? (
            /* Lista vazia **não** altera o vendedor atual e não bloqueia o
               fechamento (`FR-010`/`FR-011`) — o modal é só um seletor. */
            <p
              className="p-base text-md text-muted-foreground"
              data-testid="busca-vendedor-sem-resultados"
            >
              Nenhum vendedor encontrado para o termo informado.
            </p>
          ) : (
            <ResultadosDaBusca
              vendedores={busca.data?.Vendedores ?? []}
              onSelecionar={(vendedor) => {
                onVendedorSelecionado(vendedor);
                onFechar();
              }}
            />
          )}
        </div>

        {busca.data === undefined || abaixoDoMinimo ? null : (
          <footer
            className="flex h-[60px] shrink-0 items-center justify-between gap-sm border-t border-border px-lg"
            data-testid="paginacao-busca-vendedor"
          >
            <span className="sr-only">
              Página {busca.data.PaginaAtual} de {busca.data.TotalPaginas} ·{' '}
              {busca.data.TotalRegistros} vendedor(es)
            </span>
            <div className="flex items-center gap-xs">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-9 w-28 gap-xs rounded-full text-sm font-semibold"
                data-testid="vendedor-pagina-anterior"
                disabled={pagina <= 1}
                onClick={() => {
                  setPagina((atual) => Math.max(1, atual - 1));
                }}
              >
                <ChevronLeft className="size-3.5" aria-hidden="true" />
                Anterior
              </Button>
              <span className="flex h-9 items-center rounded-full bg-secondary px-sm text-sm font-semibold text-foreground">
                {busca.data.PaginaAtual} de {busca.data.TotalPaginas}
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-9 w-28 gap-xs rounded-full text-sm font-semibold"
                data-testid="vendedor-pagina-proxima"
                disabled={busca.data.PaginaAtual >= busca.data.TotalPaginas}
                onClick={() => {
                  setPagina((atual) => atual + 1);
                }}
              >
                Próxima
                <ChevronRight className="size-3.5" aria-hidden="true" />
              </Button>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}

interface ResultadosDaBuscaProps {
  readonly vendedores: readonly VendedorDaLista[];
  readonly onSelecionar: (vendedor: VendedorEscolhido) => void;
}

const classeCelulaCabecalho =
  'flex h-full items-center px-sm text-xs font-bold text-muted-foreground';

function ResultadosDaBusca({ vendedores, onSelecionar }: ResultadosDaBuscaProps): ReactElement {
  return (
    <div data-testid="resultados-busca-vendedor">
      <div className="flex h-[38px] border-y border-border bg-muted" aria-hidden="true">
        <span className={cn(classeCelulaCabecalho, 'w-[42px]')} />
        <span className={cn(classeCelulaCabecalho, 'w-[76px]')}>Código</span>
        <span className={cn(classeCelulaCabecalho, 'flex-1')}>Vendedor</span>
        <span className={cn(classeCelulaCabecalho, 'w-[130px]')}>CPF</span>
      </div>
      <ul>
        {vendedores.map((vendedor) => (
          <li key={vendedor.VendedorCodigo} className="border-b border-border last:border-b-0">
            <button
              type="button"
              data-testid="candidato-vendedor"
              data-codigo-vendedor={vendedor.VendedorCodigo}
              className="flex h-[50px] w-full items-center text-left hover:bg-accent"
              onClick={() => {
                onSelecionar({ codigo: vendedor.VendedorCodigo, nome: vendedor.VendedorNome });
              }}
            >
              <span className="flex w-[42px] shrink-0 items-center justify-center">
                <CircleCheck className="size-4 text-muted-foreground/60" aria-hidden="true" />
              </span>
              <span className="w-[76px] shrink-0 px-sm font-mono text-base font-semibold tabular-nums">
                {vendedor.VendedorCodigo}
              </span>
              <span className="min-w-0 flex-1 truncate px-sm text-base font-bold">
                {vendedor.VendedorNome}
              </span>
              <span className="w-[130px] shrink-0 truncate px-sm font-mono text-sm font-medium tabular-nums">
                {vendedor.VendedorCGC}
              </span>
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

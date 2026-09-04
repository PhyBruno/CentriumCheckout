import {
  ArchiveRestore,
  ArrowDownToLine,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleCheck,
  Search,
  X,
} from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { Skeleton } from 'boneyard-js/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DURACAO_SAIDA_MODAL_MS, usePresenca } from '@/lib/usePresenca';
import { formatarCentavos } from '../../domain/precificacao/dinheiro';
import type { ImportacaoVendaDeps } from '../../services/importacao/importarVendaExistente';
import { useListaNFCes, type RascunhoListado } from '../../services/recuperacao/recuperacaoQueries';
import { useRecuperacaoNFCe } from './useRecuperacaoNFCe';

/**
 * Janela de recuperação de NFCe (T009/T023, `NFCE-01`/`NFCE-02`) — réplica do
 * frame "PDV Online Web - Modal Recuperação NFCe" do Pencil
 * (`design/CentriumCheckout.pen`, nó `XxdSt`/`xkc5i`): 1120×720, raio 24,
 * cabeçalho de 78px com ícone `archive-restore`, faixa de filtros de 14/24 de
 * folga, tabela com cabeçalho de 38px e linhas de 52px, rodapé de 60px com
 * paginação à esquerda e ações à direita.
 *
 * Desktop-only (AD-046): não há equivalente no wizard mobile, mesma decisão da
 * janela de DAV.
 *
 * **Ausências deliberadas em relação ao mockup**, todas por falta de dado real
 * no contrato de `GetListaNFCes` (só `Txtbusca`/`Pagina`/`Tamanhopagina`
 * existem, e a linha traz `NumeroNota`/`Cliente`/`Vendedor`/`Operador`/
 * `Emissao`/`Total`) — mesmo critério já aplicado ao modal de DAV (AD-024/
 * AD-095) e ao de cliente (AD-093):
 *
 * - Filtros "Status", "Vendedor", "Caixa" e "Série" — nenhum tem parâmetro
 *   correspondente. Desenhá-los produziria controles que não filtram nada.
 * - Coluna "Série" — não existe no contrato da listagem. O lugar dela exibe
 *   **Emissão**, que existe e é o que distingue dois rascunhos do mesmo
 *   cliente. (A série usada para carregar é sempre a da sessão,
 *   `SessaoUsuario.CadSerieNFCe`, `research.md` D4 — nunca uma da lista, então
 *   uma coluna de série repetiria o mesmo valor em toda linha.)
 * - Coluna "Caixa" ("PDV 03"/"Loja 01" no desenho) — não há terminal nem loja
 *   no contrato. O lugar dela exibe **Operador**, que existe e responde à
 *   mesma pergunta: quem deixou esta venda suspensa.
 *
 * **Uma constante mantida**: a coluna "Status" exibe sempre "Suspensa". Não é
 * dado inventado — `GetListaNFCes` devolve, por construção, só rascunhos
 * suspensos (`CheckoutListaRascunhos`), então a afirmação é verdadeira para
 * toda linha que chega aqui.
 */

export interface ModalRecuperacaoNFCeProps {
  readonly aberto: boolean;
  readonly onFechar: () => void;
  /** Portas injetáveis em teste (stub da feature 012, rede). */
  readonly deps?: Partial<ImportacaoVendaDeps>;
}

/** Mesmo debounce dos demais modais de busca desta base. */
const DEBOUNCE_BUSCA_MS = 300;

/**
 * `Emissao` chega em ISO 8601 (`2026-09-01T14:32:00`) e é quebrada **por
 * texto**, nunca por `new Date()`.
 *
 * Construir um `Date` aplicaria o fuso do navegador do PDV a um instante que o
 * servidor já resolveu, e um rascunho suspenso às 23:40 apareceria no dia
 * seguinte. O Checkout não reinterpreta data do ERP (Constitution III) —
 * formato inesperado é exibido cru, em vez de escondido.
 */
function formatarEmissao(iso: string): { readonly data: string; readonly hora: string } {
  const [dataParte = '', horaParte = ''] = iso.split('T');
  const partes = dataParte.split('-');
  const [ano, mes, dia] = partes;

  if (partes.length !== 3 || ano === undefined || mes === undefined || dia === undefined) {
    return { data: iso, hora: '' };
  }

  return { data: `${dia}/${mes}/${ano}`, hora: horaParte.slice(0, 5) };
}

export function ModalRecuperacaoNFCe({
  aberto,
  onFechar,
  deps = {},
}: ModalRecuperacaoNFCeProps): ReactElement | null {
  const [termo, setTermo] = useState('');
  const [termoDebounced, setTermoDebounced] = useState('');
  const [pagina, setPagina] = useState(1);
  const [selecionado, setSelecionado] = useState<number | null>(null);
  const [carregando, setCarregando] = useState(false);

  const [abertoAnterior, setAbertoAnterior] = useState(aberto);
  if (aberto !== abertoAnterior) {
    setAbertoAnterior(aberto);
    if (aberto) {
      setTermo('');
      setTermoDebounced('');
      setPagina(1);
      setSelecionado(null);
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

  // ESC fecha a janela, pelo ouvinte de `window` e não por `onKeyDown` no
  // backdrop: aquele só dispararia com o foco dentro do modal, e bastaria um
  // clique no fundo para a tecla não fazer nada. Nada foi retomado neste ponto,
  // então sair é sempre seguro.
  useEffect(() => {
    if (!aberto) {
      return;
    }
    const aoTeclar = (evento: KeyboardEvent): void => {
      if (evento.key === 'Escape') {
        onFechar();
      }
    };
    window.addEventListener('keydown', aoTeclar);
    return () => {
      window.removeEventListener('keydown', aoTeclar);
    };
  }, [aberto, onFechar]);

  // Sem piso de caracteres: termo vazio é consulta legítima — "todos os
  // rascunhos suspensos" é exatamente o que o operador vê ao abrir a janela.
  const lista = useListaNFCes({ txtBusca: termoDebounced, pagina }, aberto);

  const { retomar } = useRecuperacaoNFCe(deps);
  const { montado, saindo } = usePresenca(aberto, DURACAO_SAIDA_MODAL_MS);

  if (!montado) {
    return null;
  }

  const rascunhos = lista.data?.rascunhos ?? [];
  const rascunhoSelecionado = rascunhos.find((item) => item.numeroNota === selecionado) ?? null;
  const semResultado = lista.data !== undefined && rascunhos.length === 0;

  async function confirmarRecuperacao(): Promise<void> {
    if (rascunhoSelecionado === null || carregando) {
      return;
    }
    setCarregando(true);
    try {
      // Sucesso fecha a janela; erro a mantém aberta, com o toast já exibido
      // pelo hook e o carrinho intacto. É o caminho do `404` de `CarregarNFCe`
      // — rascunho faturado por outro operador entre a listagem e a seleção
      // (AD-052): erro de negócio, sem retry automático.
      if (await retomar(rascunhoSelecionado)) {
        onFechar();
      }
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-start justify-center bg-[color-mix(in_srgb,var(--cc-color-ink)_40%,transparent)] p-lg',
        saindo ? 'cc-backdrop-sai' : 'cc-backdrop-entra',
      )}
      data-testid="modal-recuperacao-nfce"
      onKeyDown={(evento) => {
        // Enter carrega o rascunho já selecionado, de qualquer ponto da janela
        // — o mesmo que clicar em "Carregar NFCe". A linha da tabela trata a
        // tecla por conta própria e interrompe a propagação: lá o Enter ainda
        // pode significar "selecionar esta linha", e carregar a anterior seria
        // o documento errado.
        if (evento.key === 'Enter') {
          void confirmarRecuperacao();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Recuperação NFCe"
        className={cn(
          'flex max-h-full w-full max-w-[1120px] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-lg',
          saindo ? 'cc-modal-sai' : 'cc-modal-entra',
        )}
      >
        <header className="flex h-[78px] shrink-0 items-center justify-between gap-sm border-b border-border px-lg">
          <div className="flex items-center gap-sm">
            <span className="flex size-[42px] shrink-0 items-center justify-center rounded-full bg-secondary">
              <ArchiveRestore className="size-5 text-primary" aria-hidden="true" />
            </span>
            <div className="flex flex-col gap-[2px]">
              <h2 className="text-xl font-semibold text-foreground">Recuperação NFCe</h2>
              <p className="text-sm font-medium text-muted-foreground">
                Carregue uma NFCe suspensa para a venda atual
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

        <div className="flex shrink-0 flex-col gap-[10px] border-b border-border px-lg py-[14px]">
          <label className="flex h-11 items-center gap-xs rounded-full bg-secondary px-base text-md font-medium text-foreground">
            <Search className="size-4.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">Termo de busca</span>
            <input
              className="h-full w-full bg-transparent outline-none placeholder:text-muted-foreground"
              data-testid="campo-busca-nfce"
              autoComplete="off"
              autoFocus
              // O ERP filtra só nome de cliente e de vendedor: busca por número
              // da nota não retorna nada (`research.md` D1). O texto do campo
              // diz isso, para o operador não concluir que o rascunho sumiu.
              placeholder="Busque por nome do cliente ou do vendedor"
              value={termo}
              onChange={(evento) => {
                setTermo(evento.target.value);
                setPagina(1);
                setSelecionado(null);
              }}
            />
          </label>

          {lista.data === undefined ? null : (
            <p className="text-base font-semibold text-foreground" data-testid="contagem-nfce">
              {lista.data.totalRegistros} NFCe(s) suspensa(s) encontrada(s)
            </p>
          )}
        </div>

        <div className="min-h-40 flex-1 overflow-y-auto" aria-live="polite">
          {lista.isPending || lista.isFetching ? (
            <Skeleton
              name="lista-nfces"
              loading
              fixture={<EstruturaResultados />}
              fallback={<EstruturaResultados aria-hidden />}
            >
              <EstruturaResultados />
            </Skeleton>
          ) : lista.isError ? (
            <p className="p-base text-md text-destructive">
              Não foi possível carregar as NFCes suspensas. Tente novamente.
            </p>
          ) : semResultado ? (
            <p className="p-base text-md text-muted-foreground" data-testid="nfce-sem-resultados">
              Nenhuma NFCe suspensa encontrada para a busca informada.
            </p>
          ) : (
            <TabelaDeRascunhos
              rascunhos={rascunhos}
              selecionado={selecionado}
              onSelecionar={setSelecionado}
              onConfirmar={() => {
                void confirmarRecuperacao();
              }}
            />
          )}
        </div>

        <footer className="flex h-[60px] shrink-0 items-center justify-between gap-sm border-t border-border px-lg">
          <div className="flex items-center gap-xs" data-testid="paginacao-nfce">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-9 w-28 gap-xs rounded-full text-sm font-semibold"
              data-testid="nfce-pagina-anterior"
              disabled={pagina <= 1}
              onClick={() => {
                setPagina((atual) => Math.max(1, atual - 1));
                setSelecionado(null);
              }}
            >
              <ChevronLeft className="size-3.5" aria-hidden="true" />
              Anterior
            </Button>
            <span className="flex h-9 items-center rounded-full bg-secondary px-sm text-sm font-semibold text-foreground">
              {lista.data?.paginaAtual ?? pagina} de {lista.data?.totalPaginas ?? 1}
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-9 w-28 gap-xs rounded-full text-sm font-semibold"
              data-testid="nfce-pagina-proxima"
              disabled={
                lista.data === undefined || lista.data.paginaAtual >= lista.data.totalPaginas
              }
              onClick={() => {
                setPagina((atual) => atual + 1);
                setSelecionado(null);
              }}
            >
              Próxima
              <ChevronRight className="size-3.5" aria-hidden="true" />
            </Button>
          </div>

          <div className="flex items-center gap-[10px]">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-9 w-28 gap-xs rounded-full text-sm font-semibold"
              onClick={onFechar}
            >
              <X className="size-3.5" aria-hidden="true" />
              Cancelar
            </Button>
            <Button
              type="button"
              className="h-11 w-[156px] gap-xs rounded-full text-md font-bold"
              data-testid="confirmar-recuperacao-nfce"
              disabled={rascunhoSelecionado === null || carregando}
              onClick={() => {
                void confirmarRecuperacao();
              }}
            >
              <ArrowDownToLine className="size-4.5" aria-hidden="true" />
              Carregar NFCe
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}

interface TabelaDeRascunhosProps {
  readonly rascunhos: readonly RascunhoListado[];
  readonly selecionado: number | null;
  readonly onSelecionar: (numeroNota: number) => void;
  /** Enter sobre a linha já selecionada — carrega sem passar pelo rodapé. */
  readonly onConfirmar: () => void;
}

const classeCelulaCabecalho =
  'flex h-full items-center px-[10px] text-xs font-bold text-muted-foreground';

function TabelaDeRascunhos({
  rascunhos,
  selecionado,
  onSelecionar,
  onConfirmar,
}: TabelaDeRascunhosProps): ReactElement {
  return (
    <div data-testid="resultados-nfce">
      <div className="flex h-[38px] border-y border-border bg-muted" aria-hidden="true">
        <span className={cn(classeCelulaCabecalho, 'w-[42px]')} />
        <span className={cn(classeCelulaCabecalho, 'w-[90px]')}>NFCe</span>
        <span className={cn(classeCelulaCabecalho, 'flex-1')}>Cliente</span>
        <span className={cn(classeCelulaCabecalho, 'w-[100px]')}>Operador</span>
        <span className={cn(classeCelulaCabecalho, 'w-[108px]')}>Emissão</span>
        <span className={cn(classeCelulaCabecalho, 'w-[116px]')}>Total</span>
        <span className={cn(classeCelulaCabecalho, 'w-[100px] justify-end')}>Status</span>
      </div>
      <ul>
        {rascunhos.map((rascunho) => {
          const ativo = rascunho.numeroNota === selecionado;
          const emissao = formatarEmissao(rascunho.emissao);
          return (
            <li key={rascunho.numeroNota} className="border-b border-border last:border-b-0">
              <button
                type="button"
                data-testid="linha-nfce"
                data-numero-nota={rascunho.numeroNota}
                aria-pressed={ativo}
                className={cn(
                  'flex h-[52px] w-full items-center text-left hover:bg-accent',
                  ativo ? 'bg-secondary' : 'bg-card',
                )}
                onClick={() => {
                  onSelecionar(rascunho.numeroNota);
                }}
                onKeyDown={(evento) => {
                  if (evento.key !== 'Enter') {
                    return;
                  }
                  // A tecla é resolvida aqui, e não pelo ouvinte da janela: no
                  // teclado o Enter chega à linha que **tem o foco**, que pode
                  // não ser a selecionada. Primeiro Enter escolhe a linha,
                  // segundo carrega — dois passos, nunca o documento errado.
                  evento.preventDefault();
                  evento.stopPropagation();
                  if (ativo) {
                    onConfirmar();
                    return;
                  }
                  onSelecionar(rascunho.numeroNota);
                }}
              >
                <span className="flex w-[42px] shrink-0 items-center justify-center">
                  {ativo ? (
                    <CircleCheck className="size-4 text-primary" aria-hidden="true" />
                  ) : (
                    <Circle className="size-4 text-muted-foreground/60" aria-hidden="true" />
                  )}
                </span>
                <span className="w-[90px] shrink-0 px-[10px] font-mono text-xs font-bold tabular-nums">
                  {rascunho.numeroNota}
                </span>
                <span className="flex min-w-0 flex-1 flex-col px-[10px]">
                  <span className="truncate text-sm font-bold">{rascunho.cliente}</span>
                  {/* Ao contrário de `ListaDAVs` (AD-095), este contrato devolve
                      o nome do vendedor — não há código cru a exibir aqui. */}
                  <span className="truncate text-xs font-medium text-muted-foreground">
                    Vendedor {rascunho.vendedor}
                  </span>
                </span>
                <span className="w-[100px] shrink-0 truncate px-[10px] text-xs font-semibold">
                  {rascunho.operador}
                </span>
                <span className="flex w-[108px] shrink-0 flex-col px-[10px] font-mono tabular-nums">
                  <span className="text-xs font-semibold">{emissao.data}</span>
                  {emissao.hora === '' ? null : (
                    <span className="text-[10px] font-medium text-muted-foreground">
                      {emissao.hora}
                    </span>
                  )}
                </span>
                <span className="w-[116px] shrink-0 px-[10px] font-mono text-sm font-bold tabular-nums">
                  {formatarCentavos(rascunho.total)}
                </span>
                {/* Constante por construção do endpoint: `GetListaNFCes` só
                    devolve rascunhos suspensos. */}
                <span className="w-[100px] shrink-0 px-[10px] text-right text-xs font-bold text-primary">
                  Suspensa
                </span>
              </button>
            </li>
          );
        })}
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

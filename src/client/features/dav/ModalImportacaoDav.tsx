import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleCheck,
  FileCheck,
  ReceiptText,
  Search,
  X,
} from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { Skeleton } from 'boneyard-js/react';
import { Button } from '@/components/ui/button';
import { CampoData, isoRelativoAHoje } from '@/components/ui/campo-data';
import { cn } from '@/lib/utils';
import { useFocoDeModal } from '@/lib/useFocoDeModal';
import { DURACAO_SAIDA_MODAL_MS, usePresenca } from '@/lib/usePresenca';
import { formatarCentavos } from '../../domain/precificacao/dinheiro';
import { useListaDavs, type DavListado } from '../../services/dav/davQueries';
import type { ImportacaoVendaDeps } from '../../services/importacao/importarVendaExistente';
import { useImportacaoDav } from './useImportacaoDav';

/**
 * Janela de importação de DAV (T008/T018, `DAV-01`/`DAV-02`) — réplica do frame
 * "PDV Online Web - Modal DAV" do Pencil (`design/CentriumCheckout.pen`, nó
 * `jfZtk`/`Hao17`): 1120×720, raio 24, cabeçalho de 78px com ícone
 * `receipt-text`, faixa de filtros de 14/24 de folga, tabela com cabeçalho de
 * 38px e linhas de 52px, rodapé de 60px com paginação à esquerda e ações à
 * direita.
 *
 * Desktop-only (AD-046): não há equivalente no wizard mobile, mesma decisão já
 * tomada para o modal de recuperação de NFCe (011).
 *
 * **Quatro ausências deliberadas em relação ao mockup**, todas por falta de
 * dado real no contrato do ERP (AD-024/AD-095), mesmo critério já aplicado ao
 * modal de cliente (AD-093):
 *
 * - Filtros "Status", "Vendedor", "Tipo" e "Origem" — `ListaDAVs` não tem
 *   nenhum parâmetro correspondente; só `Txtbusca` e o período de emissão
 *   existem. Desenhá-los produziria controles que não filtram nada.
 * - Colunas "Origem" e "Status" — `CheckoutListaDAVs.DAV_DAV` não tem esses
 *   campos. Exibi-los exigiria inventar o estado do documento.
 * - Ação de reimpressão por linha — proibida por `FR-009`/AD-035, removida
 *   ainda na fase de plano.
 * - O nome do vendedor na coluna "Cliente" — o contrato só devolve o código
 *   (AD-095), então a linha exibe "Vendedor #&lt;código&gt;" até o operador
 *   reabrir o modal de vendedor.
 *
 * **Um desvio de rótulo**: o botão do rodapé é "Importar DAV", não "Faturar
 * DAV" como no desenho. Confirmar aqui **não fatura** — popula o carrinho, e a
 * venda segue o fluxo normal de pagamento e finalização (`FR-008`). Rotular de
 * "Faturar" prometeria ao operador uma emissão que este clique não faz.
 */

export interface ModalImportacaoDavProps {
  readonly aberto: boolean;
  readonly onFechar: () => void;
  /** Portas injetáveis em teste (stubs das features 008/012, rede). */
  readonly deps?: Partial<ImportacaoVendaDeps>;
}

/** Mesmo debounce dos demais modais de busca desta base. */
const DEBOUNCE_BUSCA_MS = 300;

/**
 * Período de emissão pré-aplicado ao abrir a janela (pedido do usuário,
 * 2026-09-03): dos últimos 7 dias até hoje.
 *
 * O teto é o **dia** de hoje, não um instante: `Datainicial`/`Datafinal` são
 * `format: date` no contrato (`YYYY-MM-DD`), então "hoje" já inclui tudo o que
 * foi emitido até as 23:59 — não há horário a enviar nem a exibir.
 */
const DIAS_DO_PERIODO_PADRAO = 7;

function periodoPadrao(): { readonly inicial: string; readonly final: string } {
  return { inicial: isoRelativoAHoje(-DIAS_DO_PERIODO_PADRAO), final: isoRelativoAHoje(0) };
}

/** `YYYY-MM-DD` (contrato) → `DD/MM/AAAA` (leitura do operador). */
function formatarDataEmissao(iso: string): string {
  const partes = iso.split('-');
  const [ano, mes, dia] = partes;
  if (partes.length !== 3 || ano === undefined || mes === undefined || dia === undefined) {
    // Formato inesperado: exibe cru em vez de esconder o dado. O Checkout não
    // reinterpreta o que o ERP mandou (Constitution III).
    return iso;
  }
  return `${dia}/${mes}/${ano}`;
}

export function ModalImportacaoDav({
  aberto,
  onFechar,
  deps = {},
}: ModalImportacaoDavProps): ReactElement | null {
  const [termo, setTermo] = useState('');
  const [termoDebounced, setTermoDebounced] = useState('');
  const [dataInicial, setDataInicial] = useState(() => periodoPadrao().inicial);
  const [dataFinal, setDataFinal] = useState(() => periodoPadrao().final);
  const [pagina, setPagina] = useState(1);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);

  const [abertoAnterior, setAbertoAnterior] = useState(aberto);
  if (aberto !== abertoAnterior) {
    setAbertoAnterior(aberto);
    if (aberto) {
      const periodo = periodoPadrao();
      setTermo('');
      setTermoDebounced('');
      // Recalculado a cada abertura, não só na montagem: o Checkout fica aberto
      // o turno inteiro, e uma janela montada ontem ofereceria o período de
      // ontem ao operador que a reabre hoje.
      setDataInicial(periodo.inicial);
      setDataFinal(periodo.final);
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

  // ESC fecha a janela (pedido do usuário, 2026-09-03). O ouvinte é de
  // `window`, e não um `onKeyDown` no backdrop como antes: aquele só disparava
  // com o foco dentro do modal, e bastava um clique no fundo — ou o calendário
  // de um filtro devolvendo o foco ao `body` — para a tecla não fazer nada.
  // Nada foi importado neste ponto, então sair é sempre seguro.
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

  // Ao contrário da busca de cliente/produto, não há piso de caracteres: termo
  // vazio é uma consulta legítima — "todos os DAVs prontos para faturamento" é
  // exatamente o que o operador vê ao abrir a janela (`FR-001`).
  const lista = useListaDavs({ txtBusca: termoDebounced, dataInicial, dataFinal, pagina }, aberto);

  const { importar } = useImportacaoDav(deps);
  const { montado, saindo } = usePresenca(aberto, DURACAO_SAIDA_MODAL_MS);
  const janelaRef = useFocoDeModal<HTMLDivElement>(aberto);

  if (!montado) {
    return null;
  }

  const davs = lista.data?.davs ?? [];
  const davSelecionado = davs.find((dav) => dav.numeroDav === selecionado) ?? null;
  const semResultado = lista.data !== undefined && davs.length === 0;

  /**
   * Trocar qualquer uma das datas reinicia a paginação e solta a seleção: a
   * linha escolhida pode não existir no novo período, e importar o índice
   * antigo seria o documento errado.
   */
  function aoTrocarData(definir: (iso: string) => void): (iso: string) => void {
    return (iso) => {
      definir(iso);
      setPagina(1);
      setSelecionado(null);
    };
  }

  async function confirmarImportacao(): Promise<void> {
    if (davSelecionado === null || importando) {
      return;
    }
    setImportando(true);
    try {
      // Sucesso fecha a janela; erro a mantém aberta, com o toast já exibido
      // pelo hook e o carrinho intacto (D7/AD-052).
      if (await importar(davSelecionado)) {
        onFechar();
      }
    } finally {
      setImportando(false);
    }
  }

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-start justify-center bg-[color-mix(in_srgb,var(--cc-color-ink)_40%,transparent)] p-lg',
        saindo ? 'cc-backdrop-sai' : 'cc-backdrop-entra',
      )}
      data-testid="modal-importacao-dav"
      onKeyDown={(evento) => {
        if (evento.key !== 'Enter') {
          return;
        }
        // Enter **em cima de um botão** é o clique daquele botão, e nada mais:
        // sem esta guarda o evento borbulhava até aqui e a janela importava o
        // documento selecionado antes de executar a ação escolhida — teclar
        // Enter em "Cancelar" importava e só então fechava, que é o oposto do
        // gesto do operador. As linhas da tabela já se defendiam com
        // `stopPropagation`; o rodapé e o "X" não.
        if (evento.target instanceof HTMLElement && evento.target.closest('button') !== null) {
          return;
        }
        // Fora dos botões, Enter importa o documento já selecionado de
        // qualquer ponto da janela (pedido do usuário, 2026-09-03) — o mesmo
        // que clicar em "Importar DAV".
        void confirmarImportacao();
      }}
    >
      <div
        ref={janelaRef}
        role="dialog"
        aria-modal="true"
        aria-label="Menu Importação"
        className={cn(
          'flex max-h-full w-full max-w-[1120px] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-lg',
          saindo ? 'cc-modal-sai' : 'cc-modal-entra',
        )}
      >
        <header className="flex h-[78px] shrink-0 items-center justify-between gap-sm border-b border-border px-lg">
          <div className="flex items-center gap-sm">
            <span className="flex size-[42px] shrink-0 items-center justify-center rounded-full bg-secondary">
              <ReceiptText className="size-5 text-primary" aria-hidden="true" />
            </span>
            <div className="flex flex-col gap-[2px]">
              <h2 className="text-xl font-semibold text-foreground">Menu DAV</h2>
              <p className="text-sm font-medium text-muted-foreground">
                Selecione um documento para importar para a venda
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
          <div className="flex items-center gap-[10px]">
            <label className="flex h-11 flex-1 items-center gap-xs rounded-full bg-secondary px-base text-md font-medium text-foreground">
              <Search className="size-4.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="sr-only">Termo de busca</span>
              <input
                className="h-full w-full bg-transparent outline-none placeholder:text-muted-foreground"
                data-testid="campo-busca-dav"
                autoComplete="off"
                autoFocus
                placeholder="Busque por número, título ou cliente"
                value={termo}
                onChange={(evento) => {
                  setTermo(evento.target.value);
                  setPagina(1);
                  setSelecionado(null);
                }}
              />
            </label>

            {/* O Pencil desenha o período como **uma** pílula estática
                ("Emissão: 01/06 - 11/06"). Aqui ela vira duas pílulas
                independentes — início e fim, que é o que o contrato permite
                filtrar (`Datainicial`/`Datafinal`) —, cada uma com o seu
                calendário, que abre a qualquer clique no campo. A separação é
                pedido do usuário (2026-09-03): dentro de um invólucro só, as
                duas datas liam como um campo único e nada dizia qual metade
                estava sendo editada. Cada pílula conserva a forma do desenho
                (altura 36, raio total, superfície secundária, ícone
                `calendar-days`) e o mesmo vão de 10 que separa os filtros. */}
            <div className="flex shrink-0 items-center gap-[10px]">
              <FiltroDeData
                etiqueta="Emissão de"
                rotulo="Data inicial de emissão"
                testId="dav-data-inicial"
                valor={dataInicial}
                onChange={aoTrocarData(setDataInicial)}
              />
              <FiltroDeData
                etiqueta="até"
                rotulo="Data final de emissão"
                testId="dav-data-final"
                valor={dataFinal}
                onChange={aoTrocarData(setDataFinal)}
              />
            </div>
          </div>

          {lista.data === undefined ? null : (
            <p className="text-base font-semibold text-foreground" data-testid="contagem-dav">
              {lista.data.totalRegistros} DAV(s) encontrada(s)
            </p>
          )}
        </div>

        <div className="min-h-40 flex-1 overflow-y-auto" aria-live="polite">
          {lista.isPending || lista.isFetching ? (
            <Skeleton
              name="lista-davs"
              loading
              fixture={<EstruturaResultados />}
              fallback={<EstruturaResultados aria-hidden />}
            >
              <EstruturaResultados />
            </Skeleton>
          ) : lista.isError ? (
            <p className="p-base text-md text-destructive">
              Não foi possível carregar os documentos. Tente novamente.
            </p>
          ) : semResultado ? (
            <p className="p-base text-md text-muted-foreground" data-testid="dav-sem-resultados">
              Nenhum documento encontrado para os filtros informados.
            </p>
          ) : (
            <TabelaDeDavs
              davs={davs}
              selecionado={selecionado}
              onSelecionar={setSelecionado}
              onConfirmar={() => {
                void confirmarImportacao();
              }}
            />
          )}
        </div>

        <footer className="flex h-[60px] shrink-0 items-center justify-between gap-sm border-t border-border px-lg">
          <div className="flex items-center gap-xs" data-testid="paginacao-dav">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-9 w-28 gap-xs rounded-full text-sm font-semibold"
              data-testid="dav-pagina-anterior"
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
              data-testid="dav-pagina-proxima"
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
              className="h-11 w-[156px] gap-xs rounded-full text-md font-bold"
              data-testid="confirmar-importacao-dav"
              disabled={davSelecionado === null || importando}
              onClick={() => {
                void confirmarImportacao();
              }}
            >
              <FileCheck className="size-4.5" aria-hidden="true" />
              Importar DAV
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}

interface FiltroDeDataProps {
  /** Texto visível dentro da pílula ("Emissão de", "até"). */
  readonly etiqueta: string;
  /** Nome acessível do campo, que a etiqueta curta sozinha não daria. */
  readonly rotulo: string;
  readonly testId: string;
  /** `YYYY-MM-DD`. */
  readonly valor: string;
  readonly onChange: (iso: string) => void;
}

/** Uma das duas pílulas de data da faixa de filtros. */
function FiltroDeData({
  etiqueta,
  rotulo,
  testId,
  valor,
  onChange,
}: FiltroDeDataProps): ReactElement {
  return (
    <div className="flex h-9 shrink-0 items-center gap-xs rounded-full bg-secondary px-sm text-xs font-semibold text-foreground">
      <CalendarDays className="size-[15px] shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="shrink-0">{etiqueta}</span>
      <CampoData rotulo={rotulo} testId={testId} valor={valor} onChange={onChange} />
    </div>
  );
}

interface TabelaDeDavsProps {
  readonly davs: readonly DavListado[];
  readonly selecionado: string | null;
  readonly onSelecionar: (numeroDav: string) => void;
  /** Enter sobre a linha já selecionada — importa sem passar pelo rodapé. */
  readonly onConfirmar: () => void;
}

const classeCelulaCabecalho =
  'flex h-full items-center px-[10px] text-xs font-bold text-muted-foreground';

function TabelaDeDavs({
  davs,
  selecionado,
  onSelecionar,
  onConfirmar,
}: TabelaDeDavsProps): ReactElement {
  return (
    <div data-testid="resultados-dav">
      <div className="flex h-[38px] border-y border-border bg-muted" aria-hidden="true">
        <span className={cn(classeCelulaCabecalho, 'w-[42px]')} />
        <span className={cn(classeCelulaCabecalho, 'w-[86px]')}>DAV</span>
        <span className={cn(classeCelulaCabecalho, 'w-[116px]')}>Documento</span>
        <span className={cn(classeCelulaCabecalho, 'flex-1')}>Cliente</span>
        <span className={cn(classeCelulaCabecalho, 'w-[108px]')}>Emissão</span>
        <span className={cn(classeCelulaCabecalho, 'w-[116px]')}>Total</span>
      </div>
      <ul>
        {davs.map((dav) => {
          const ativo = dav.numeroDav === selecionado;
          return (
            <li key={dav.numeroDav} className="border-b border-border last:border-b-0">
              <button
                type="button"
                data-testid="linha-dav"
                data-numero-dav={dav.numeroDav}
                aria-pressed={ativo}
                className={cn(
                  'flex h-[52px] w-full items-center text-left hover:bg-accent',
                  ativo ? 'bg-secondary' : 'bg-card',
                )}
                onClick={() => {
                  onSelecionar(dav.numeroDav);
                }}
                onKeyDown={(evento) => {
                  if (evento.key !== 'Enter') {
                    return;
                  }
                  // A tecla é resolvida aqui, e não pelo ouvinte da janela: no
                  // teclado o Enter chega à linha que **tem o foco**, que pode
                  // não ser a selecionada. Primeiro Enter escolhe a linha,
                  // segundo importa — dois passos, nunca o documento errado.
                  evento.preventDefault();
                  evento.stopPropagation();
                  if (ativo) {
                    onConfirmar();
                    return;
                  }
                  onSelecionar(dav.numeroDav);
                }}
              >
                <span className="flex w-[42px] shrink-0 items-center justify-center">
                  {ativo ? (
                    <CircleCheck className="size-4 text-primary" aria-hidden="true" />
                  ) : (
                    <Circle className="size-4 text-muted-foreground/60" aria-hidden="true" />
                  )}
                </span>
                <span className="w-[86px] shrink-0 px-[10px] font-mono text-xs font-bold tabular-nums">
                  {dav.numeroDav}
                </span>
                <span className="w-[116px] shrink-0 truncate px-[10px] font-mono text-xs font-semibold">
                  {dav.titulo}
                </span>
                <span className="flex min-w-0 flex-1 flex-col px-[10px]">
                  <span className="truncate text-sm font-bold">{dav.clienteNome}</span>
                  {/* `ListaDAVs` não devolve o nome do vendedor (AD-095): o
                      código é o único identificador disponível até o operador
                      reabrir o modal de vendedor. */}
                  <span className="truncate text-xs font-medium text-muted-foreground">
                    Vendedor #{dav.vendedorCodigo}
                  </span>
                </span>
                <span className="w-[108px] shrink-0 px-[10px] font-mono text-xs font-semibold tabular-nums">
                  {formatarDataEmissao(dav.dataEmissao)}
                </span>
                <span className="w-[116px] shrink-0 px-[10px] font-mono text-sm font-bold tabular-nums">
                  {formatarCentavos(dav.valorTotal)}
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

import { ArchiveUp, CheckCircle, Import, Record, Search, X } from 'reicon-react';
import { useEffect, useState, type ReactElement } from 'react';
import { Skeleton } from 'boneyard-js/react';
import { Button } from '@/components/ui/button';
import {
  CabecalhoOrdenavel,
  useOrdenacaoDeTabela,
  type OrdenacaoAtiva,
  type ValoresDeColuna,
} from '@/components/ui/cabecalho-ordenavel';
import { ControlePaginacao } from '@/components/ui/controle-paginacao';
import { cn } from '@/lib/utils';
import { useFocoDeModal } from '@/lib/useFocoDeModal';
import { DURACAO_SAIDA_MODAL_MS, usePresenca } from '@/lib/usePresenca';
import { formatarCentavos } from '../../domain/precificacao/dinheiro';
import type { ImportacaoVendaDeps } from '../../services/importacao/importarVendaExistente';
import { ITENS_POR_PAGINA } from '../../services/paginacao';
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
 * - **Filtro de período**, o par de pílulas que a janela de DAV tem. Pedido
 *   para cá em 2026-09-11 e **não implementado por decisão do usuário na mesma
 *   conversa**, depois de medir o endpoint real: `GetListaNFCes` devolve os
 *   mesmos 123 registros com e sem `Datainicial`/`Datafinal` — ignora os dois
 *   parâmetros, que nem constam do contrato. As pílulas existiriam sem filtrar
 *   nada. Entra quando o ERP aceitar o período (pendência 53).
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

type ColunaNFCe = 'nfce' | 'cliente' | 'operador' | 'emissao' | 'total' | 'status';

/**
 * O valor que cada coluna compara ao ordenar a página (ver
 * `useOrdenacaoDeTabela`). Constante de módulo de propósito: o mapa entra nas
 * dependências do `useMemo` que ordena.
 *
 * `emissao` é comparada no ISO cru que o ERP devolve, e não no `DD/MM/AAAA` da
 * célula — o formato brasileiro ordenaria por dia do mês, misturando anos. Pelo
 * mesmo motivo de sempre (Constitution III), ordenar não constrói `Date`: a
 * comparação lexicográfica de ISO 8601 já é cronológica.
 */
const VALORES_DE_COLUNA_NFCE: ValoresDeColuna<RascunhoListado, ColunaNFCe> = {
  nfce: (rascunho) => rascunho.numeroNota,
  cliente: (rascunho) => rascunho.cliente,
  operador: (rascunho) => rascunho.operador,
  emissao: (rascunho) => rascunho.emissao,
  total: (rascunho) => rascunho.total,
  // `GetListaNFCes` só devolve rascunhos suspensos, então hoje o valor é o
  // mesmo em toda linha e ordenar por ele preserva a ordem (o `sort` é
  // estável). A coluna é ordenável mesmo assim: se o endpoint passar a
  // devolver mais de um status, a tela acompanha sem alteração.
  status: () => 'Suspensa',
};

/** Identidade estável para a página ainda não carregada — sem ela o `useMemo` da ordenação reinicia a cada render. */
const SEM_RASCUNHOS: readonly RascunhoListado[] = [];

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

/**
 * O que o leitor de tela anuncia ao chegar numa linha.
 *
 * A tabela é montada com `div`/`span`, e o seu cabeçalho não é estrutura de
 * tabela: mesmo agora que ele expõe os botões de ordenação, nada liga uma
 * célula da linha à coluna correspondente. Sem este rótulo a linha é lida como
 * uma sequência crua de valores ("90210 CLIENTE TESTE 01 CAIXA 03 01/09/2026
 * 14:32 R$ 18,50 Suspensa"), sem dizer qual campo é qual. Nomear os campos aqui
 * é mais barato — e mais fiel ao desenho — do que converter o bloco numa
 * `<table>` só para recuperar o cabeçalho.
 */
function rotuloDaLinha(
  rascunho: RascunhoListado,
  emissao: { readonly data: string; readonly hora: string },
): string {
  const quando = emissao.hora === '' ? emissao.data : `${emissao.data} às ${emissao.hora}`;
  return [
    `NFCe ${String(rascunho.numeroNota)}`,
    `cliente ${rascunho.cliente}`,
    `vendedor ${rascunho.vendedor}`,
    `operador ${rascunho.operador}`,
    `emissão ${quando}`,
    `total ${formatarCentavos(rascunho.total)}`,
    'suspensa',
  ].join(', ');
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
  const janelaRef = useFocoDeModal<HTMLDivElement>(aberto);

  // A ordenação mora aqui, e não dentro de `TabelaDeRascunhos`: durante o
  // `isFetching` da página seguinte a tabela dá lugar ao skeleton e desmonta —
  // um estado local nela perderia a coluna escolhida justo na troca de página,
  // que é onde o operador espera que ela continue valendo.
  const {
    linhas: rascunhos,
    ordenacao,
    alternar: alternarOrdenacao,
  } = useOrdenacaoDeTabela(lista.data?.rascunhos ?? SEM_RASCUNHOS, VALORES_DE_COLUNA_NFCE);

  if (!montado) {
    return null;
  }

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
        // — o mesmo que clicar em "Importar NFCe". A linha da tabela trata a
        // tecla por conta própria e interrompe a propagação: lá o Enter ainda
        // pode significar "selecionar esta linha", e carregar a anterior seria
        // o documento errado.
        if (evento.key !== 'Enter') {
          return;
        }
        // Enter **em cima de um botão** é o clique daquele botão, e nada mais:
        // sem esta guarda o evento borbulhava até aqui e a janela retomava o
        // rascunho selecionado antes de executar a ação escolhida — teclar
        // Enter em "Cancelar" importava o documento e só então fechava a
        // janela, que é o oposto do gesto do operador. As linhas da tabela já
        // se defendiam com `stopPropagation`; o rodapé e o "X" não.
        if (evento.target instanceof HTMLElement && evento.target.closest('button') !== null) {
          return;
        }
        // Fora dos botões, Enter carrega o rascunho já selecionado de qualquer
        // ponto da janela — o mesmo que clicar em "Importar NFCe".
        void confirmarRecuperacao();
      }}
    >
      <div
        ref={janelaRef}
        role="dialog"
        aria-modal="true"
        aria-label="Importação de NFCe"
        className={cn(
          'flex max-h-full w-full max-w-[1120px] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-lg',
          saindo ? 'cc-modal-sai' : 'cc-modal-entra',
        )}
      >
        <header className="flex h-[78px] shrink-0 items-center justify-between gap-sm border-b border-border px-lg">
          <div className="flex items-center gap-sm">
            <span className="flex size-[42px] shrink-0 items-center justify-center rounded-full bg-secondary">
              <ArchiveUp className="size-5 text-primary" aria-hidden="true" />
            </span>
            <div className="flex flex-col gap-[2px]">
              <h2 className="text-xl font-semibold text-foreground">Importação de NFCe</h2>
              {/* Mesma frase do modal de DAV, de propósito: as duas janelas
                  fazem a mesma coisa com documentos de origem diferentes, e
                  descrevê-las igual evita que o operador procure diferença
                  onde não há. */}
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
              ordenacao={ordenacao}
              selecionado={selecionado}
              onAlternarOrdenacao={alternarOrdenacao}
              onSelecionar={setSelecionado}
              onConfirmar={() => {
                void confirmarRecuperacao();
              }}
            />
          )}
        </div>

        <footer className="flex h-[60px] shrink-0 items-center justify-between gap-sm border-t border-border px-lg">
          <ControlePaginacao
            pagina={pagina}
            totalPaginas={lista.data?.totalPaginas}
            testIdPrefixo="nfce"
            onTrocarPagina={(proxima) => {
              setPagina(proxima);
              setSelecionado(null);
            }}
          />

          <div className="flex items-center gap-[10px]">
            <Button
              type="button"
              className="h-11 w-[156px] gap-xs rounded-full text-md font-bold"
              data-testid="confirmar-recuperacao-nfce"
              disabled={rascunhoSelecionado === null || carregando}
              onClick={() => {
                void confirmarRecuperacao();
              }}
            >
              <Import className="size-4.5" aria-hidden="true" />
              Importar NFCe
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}

interface TabelaDeRascunhosProps {
  readonly rascunhos: readonly RascunhoListado[];
  readonly ordenacao: OrdenacaoAtiva<ColunaNFCe> | null;
  readonly selecionado: number | null;
  readonly onAlternarOrdenacao: (chave: ColunaNFCe) => void;
  readonly onSelecionar: (numeroNota: number) => void;
  /** Enter sobre a linha já selecionada — carrega sem passar pelo rodapé. */
  readonly onConfirmar: () => void;
}

const classeCelulaCabecalho =
  'flex h-full items-center px-[10px] text-xs font-bold text-muted-foreground';

function TabelaDeRascunhos({
  rascunhos,
  ordenacao,
  selecionado,
  onAlternarOrdenacao,
  onSelecionar,
  onConfirmar,
}: TabelaDeRascunhosProps): ReactElement {
  return (
    <div data-testid="resultados-nfce">
      {/* O bloco deixou de ser `aria-hidden` ao ganhar os botões de ordenação:
          esconder um controle operável da árvore de acessibilidade tiraria a
          ordenação de quem navega por teclado ou leitor de tela. Só a primeira
          coluna — a do marcador de seleção, sem rótulo — segue oculta. */}
      <div className="flex h-[38px] border-y border-border bg-muted">
        <span className={cn(classeCelulaCabecalho, 'w-[42px]')} aria-hidden="true" />
        <CabecalhoOrdenavel
          chaveDaColuna="nfce"
          rotulo="NFCe"
          ordenacao={ordenacao}
          className="w-[90px] shrink-0"
          onAlternar={onAlternarOrdenacao}
        />
        <CabecalhoOrdenavel
          chaveDaColuna="cliente"
          rotulo="Cliente"
          ordenacao={ordenacao}
          className="min-w-0 flex-1"
          onAlternar={onAlternarOrdenacao}
        />
        <CabecalhoOrdenavel
          chaveDaColuna="operador"
          rotulo="Operador"
          ordenacao={ordenacao}
          className="w-[100px] shrink-0"
          onAlternar={onAlternarOrdenacao}
        />
        <CabecalhoOrdenavel
          chaveDaColuna="emissao"
          rotulo="Emissão"
          ordenacao={ordenacao}
          className="w-[108px] shrink-0"
          onAlternar={onAlternarOrdenacao}
        />
        <CabecalhoOrdenavel
          chaveDaColuna="total"
          rotulo="Total"
          ordenacao={ordenacao}
          className="w-[116px] shrink-0"
          onAlternar={onAlternarOrdenacao}
        />
        <CabecalhoOrdenavel
          chaveDaColuna="status"
          rotulo="Status"
          ordenacao={ordenacao}
          className="w-[100px] shrink-0"
          alinharADireita
          onAlternar={onAlternarOrdenacao}
        />
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
                aria-label={rotuloDaLinha(rascunho, emissao)}
                className={cn(
                  'flex h-10 w-full items-center text-left hover:bg-accent',
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
                    <CheckCircle className="size-4 text-primary" aria-hidden="true" />
                  ) : (
                    <Record className="size-4 text-muted-foreground/60" aria-hidden="true" />
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

/**
 * Estrutura de layout que o Boneyard fotografa para gerar o shimmer da lista.
 *
 * **Uma linha por item da página, na altura da linha carregada** — não mais seis
 * cartões soltos: assim a área de resultados tem a mesma altura antes e depois
 * de o resultado chegar, e a janela não salta de tamanho no meio da consulta.
 */
function EstruturaResultados(props: { 'aria-hidden'?: boolean }): ReactElement {
  return (
    <ul aria-hidden={props['aria-hidden']}>
      {Array.from({ length: ITENS_POR_PAGINA }, (_, indice) => (
        <li
          key={indice}
          className="flex h-10 items-center border-b border-border px-base last:border-b-0"
        >
          <div className="h-3.5 rounded-sm bg-secondary" style={{ width: `${80 - indice * 5}%` }} />
        </li>
      ))}
    </ul>
  );
}

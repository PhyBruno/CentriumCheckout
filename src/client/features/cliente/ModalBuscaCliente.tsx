import {
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Search,
  UserPlus,
  UserRound,
  X,
} from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { Skeleton } from 'boneyard-js/react';
import { notificar } from '@/lib/notificar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useFocoDeModal } from '@/lib/useFocoDeModal';
import { DURACAO_SAIDA_MODAL_MS, usePresenca } from '@/lib/usePresenca';
import {
  documentoEhPessoaJuridica,
  MOTIVO_VENDA_PESSOA_JURIDICA,
} from '../../domain/cliente/documento';
import type { ClienteDaLista } from '../../../shared/schemas/cliente.schema';
import { useBuscaClientes } from '../../services/cliente/clienteQueries';
import { useQtdMinCharParaConsulta } from './useCliente';

/**
 * Modal de busca de cliente por termo livre (T017/T018, `CLI-02`) — réplica do
 * frame "PDV Online Web - Modal cliente" do Pencil
 * (`design/CentriumCheckout.pen`, nó `P52V0I`/`C1Gd61`, lido via MCP): 960px,
 * cabeçalho de 78px com ícone `user-round`, barra de filtros de 108px, tabela
 * com cabeçalho de 38px e linhas de 50px, rodapé de 60px com paginação.
 *
 * **Duas ausências deliberadas em relação ao mockup**, ambas por falta de dado
 * real no contrato do ERP (AD-093): o chip de filtro "Ativo" e a coluna
 * "Status". `GetListaClientes`/`GetCliente` não têm campo de status nem
 * parâmetro para filtrá-lo — desenhá-los exigiria inventar o estado do
 * cadastro. A ausência é o comportamento correto, não uma regressão
 * (`quickstart.md`, verificações manuais).
 *
 * O modal é **só um seletor**: escolher um candidato devolve a identidade dele
 * por `onCandidatoSelecionado` (código e documento) e quem chama resolve o
 * cliente completo por `GetCliente` antes de associar à venda (`research.md`
 * D1) — a lista não traz `DescontoConvenio`/`CodigoConvenio`, e montar o
 * snapshot a partir dela deixaria o desconto de convênio sempre nulo, um bug
 * silencioso de preço.
 *
 * A busca **por documento** (`CLI-01`) não vive aqui: é o campo "CPF/CNPJ" do
 * card da venda (`CampoClienteVenda`), como o Pencil desenha. São dois fluxos
 * de UI e dois endpoints distintos, sem heurística que escolha um pelo formato
 * digitado (`research.md` D2).
 */
export interface CandidatoEscolhido {
  readonly codigo: number;
  readonly cpf: string;
}

export interface ModalBuscaClienteProps {
  readonly aberto: boolean;
  readonly onFechar: () => void;
  /**
   * Recebe a **identidade** do candidato escolhido — nunca o registro montado
   * da lista, que não traz `DescontoConvenio`/`CodigoConvenio`.
   *
   * Leva código e documento: o `CodCliente` sempre existe, o `CPF` pode vir
   * vazio (cliente cadastrado sem documento), e quem chama decide por qual
   * resolver o cadastro completo.
   */
  readonly onCandidatoSelecionado: (candidato: CandidatoEscolhido) => void;
  /** Abre o cadastro simplificado, já com o termo digitado como CPF sugerido. */
  readonly onCadastrarNovo: (termo: string) => void;
}

/** Mesmo debounce da busca de produto: o piso de caracteres reage à digitação
 *  crua, só a chamada de rede espera o operador parar. */
const DEBOUNCE_BUSCA_MS = 300;

/**
 * Recusa de pessoa jurídica na busca (Ajuste SINIEF 11/2025) — o motivo é o
 * mesmo do campo CPF/CNPJ da venda, só a instrução muda: aqui o operador não
 * digita código de cliente, ele busca por nome, e-mail, telefone ou documento.
 */
const AVISO_CNPJ = `${MOTIVO_VENDA_PESSOA_JURIDICA} Busque o cliente por CPF ou por nome.`;

export function ModalBuscaCliente({
  aberto,
  onFechar,
  onCandidatoSelecionado,
  onCadastrarNovo,
}: ModalBuscaClienteProps): ReactElement | null {
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

  /**
   * Termo que é um CNPJ inteiro: a busca **não** acontece (Ajuste SINIEF
   * 11/2025 — venda para pessoa jurídica exige NFe, emitida pelo ERP).
   *
   * Antes era o contrário (`research.md` D4): buscava-se o CNPJ e só o CTA de
   * cadastro sumia, porque um cliente PJ podia legitimamente ser associado à
   * venda. Com a norma, associar é que deixou de ser possível — e listar
   * candidatos que o operador não pode escolher só produziria um clique morto.
   *
   * Reage ao termo cru, não ao `debounced`: a recusa é local, não custa rede, e
   * esperar 300ms para dizer "não" atrasaria a correção do operador.
   */
  const termoEhCnpj = documentoEhPessoaJuridica(termo.trim());

  useEffect(() => {
    if (termoEhCnpj) {
      notificar.aviso(AVISO_CNPJ);
    }
  }, [termoEhCnpj]);

  // Piso vem do ERP (AD-024). Sem bootstrap, um piso inalcançável mantém a
  // busca desligada — melhor não buscar do que buscar com um mínimo inventado.
  const minimo = qtdMinChar ?? Number.POSITIVE_INFINITY;
  // Termo vazio para o hook = consulta desligada pelo `enabled` dele: é assim
  // que o CNPJ não chega a `GetListaClientes`. Consulta desligada nunca sai de
  // `isPending`, então o CNPJ precisa do desvio explícito na área de
  // resultados abaixo — sem ele o skeleton ficaria girando para sempre
  // (achado do usuário, 2026-09-03).
  const busca = useBuscaClientes(termoEhCnpj ? '' : termoDebounced, {
    qtdMinCharParaConsulta: minimo,
    pagina,
  });

  const { montado, saindo } = usePresenca(aberto, DURACAO_SAIDA_MODAL_MS);
  const janelaRef = useFocoDeModal<HTMLDivElement>(aberto);

  // Fechar não desmonta na hora: o overlay fica no DOM pelo tempo da
  // animação de saída (`usePresenca`).
  if (!montado) {
    return null;
  }

  const termoLimpo = termo.trim();
  const abaixoDoMinimo = termoLimpo.length < minimo;
  const semResultado = busca.data !== undefined && busca.data.Clientes.length === 0;

  function cadastrarNovo(): void {
    if (termoEhCnpj) {
      notificar.aviso(AVISO_CNPJ);
      return;
    }
    onCadastrarNovo(termoLimpo);
  }

  return (
    <div
      className={cn(
        // Sem folga no compacto: a janela ocupa a tela inteira (ver a classe
        // dela logo abaixo), então o `p-lg` só encolheria a área útil.
        'fixed inset-0 z-50 flex items-start justify-center bg-[color-mix(in_srgb,var(--cc-color-ink)_40%,transparent)] md:p-lg',
        saindo ? 'cc-backdrop-sai' : 'cc-backdrop-entra',
      )}
      data-testid="modal-busca-cliente"
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
        aria-label="Consultar cliente"
        className={cn(
          // **Tela cheia no compacto, janela a partir de `md:`** (pedido do
          // usuário, 2026-09-09). Espremida em 390px, a janela flutuante
          // desperdiçava as bordas justamente onde a lista precisa de largura,
          // e a tabela de dentro se sobrepunha. Em tela cheia o seletor tem a
          // largura toda e vira o que ele é no mobile: uma etapa de escolha, não
          // um pop-up. No desktop nada muda — os 960px e o raio 24 do Pencil
          // continuam valendo.
          'flex h-full w-full flex-col overflow-hidden bg-background md:h-auto md:max-h-full md:max-w-[960px] md:rounded-xl md:border md:border-border md:shadow-lg',
          saindo ? 'cc-modal-sai' : 'cc-modal-entra',
        )}
      >
        <header className="flex shrink-0 items-center justify-between gap-sm border-b border-border px-base py-2.5 md:h-[78px] md:px-lg md:py-0">
          <div className="flex min-w-0 items-center gap-sm">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary md:size-[42px]">
              <UserRound className="size-4.5 text-primary md:size-5" aria-hidden="true" />
            </span>
            <div className="flex min-w-0 flex-col gap-[2px]">
              <h2 className="truncate text-lg font-semibold text-foreground md:text-xl">
                Consultar cliente
              </h2>
              {/* O subtítulo some no compacto: em 390px ele empurrava o
                  cabeçalho para duas linhas e repete o que o título já diz. */}
              <p className="hidden text-sm font-medium text-muted-foreground md:block">
                Selecione um cadastro para identificar a venda
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

        <div className="flex shrink-0 flex-col gap-xs border-b border-border px-base py-2.5 md:px-lg md:py-[14px]">
          {/* Quebra em duas faixas no compacto: o campo de busca ocupa a
              largura toda (é o gesto principal do seletor) e o "Novo cliente"
              cai embaixo, em vez de disputar 390px com ele. */}
          <div className="flex flex-wrap items-center gap-xs">
            <label className="flex h-11 w-full flex-1 basis-full items-center gap-xs rounded-full bg-secondary px-base text-md font-medium text-foreground md:w-auto md:basis-auto">
              <Search className="size-4.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="sr-only">Termo de busca</span>
              <input
                className="h-full w-full bg-transparent outline-none placeholder:text-muted-foreground"
                data-testid="campo-busca-cliente"
                autoComplete="off"
                autoFocus
                placeholder="Busque por nome, e-mail, telefone ou documento"
                value={termo}
                onChange={(evento) => {
                  setTermo(evento.target.value);
                  setPagina(1);
                }}
              />
            </label>
            <Button
              type="button"
              size="sm"
              className="h-9 gap-xs rounded-full px-sm text-sm font-semibold"
              data-testid="novo-cliente"
              onClick={cadastrarNovo}
            >
              <UserPlus className="size-3.5" aria-hidden="true" />
              Novo cliente
            </Button>
          </div>
          {busca.data === undefined || abaixoDoMinimo ? null : (
            <p className="text-base font-semibold text-foreground">
              {busca.data.TotalRegistros} cliente(s) encontrado(s)
            </p>
          )}
        </div>

        <div className="min-h-40 flex-1 overflow-y-auto" aria-live="polite">
          {abaixoDoMinimo ? (
            <p
              className="p-base text-md text-muted-foreground"
              data-testid="busca-cliente-abaixo-do-minimo"
            >
              {qtdMinChar === null
                ? 'Aguardando a configuração do ponto de venda.'
                : `Digite ao menos ${String(qtdMinChar)} caracteres para buscar.`}
            </p>
          ) : termoEhCnpj ? (
            <SemResultados />
          ) : busca.isPending || busca.isFetching ? (
            <Skeleton
              name="busca-clientes"
              loading
              fixture={<EstruturaResultados />}
              fallback={<EstruturaResultados aria-hidden />}
            >
              <EstruturaResultados />
            </Skeleton>
          ) : busca.isError ? (
            <p className="p-base text-md text-destructive">
              Não foi possível buscar clientes. Tente novamente.
            </p>
          ) : semResultado ? (
            <SemResultados />
          ) : (
            <ResultadosDaBusca
              clientes={busca.data?.Clientes ?? []}
              onSelecionar={(candidato) => {
                onCandidatoSelecionado(candidato);
                onFechar();
              }}
            />
          )}
        </div>

        {busca.data === undefined || abaixoDoMinimo ? null : (
          <footer
            className="flex h-[60px] shrink-0 items-center justify-between gap-sm border-t border-border px-base md:px-lg"
            data-testid="paginacao-busca-cliente"
          >
            <span className="sr-only">
              Página {busca.data.PaginaAtual} de {busca.data.TotalPaginas} ·{' '}
              {busca.data.TotalRegistros} cliente(s)
            </span>
            <div className="flex items-center gap-xs">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-9 gap-xs rounded-full px-sm text-sm font-semibold md:w-28 md:px-0"
                data-testid="cliente-pagina-anterior"
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
                className="h-9 gap-xs rounded-full px-sm text-sm font-semibold md:w-28 md:px-0"
                data-testid="cliente-pagina-proxima"
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

/**
 * Estado "a busca não achou nada" — mensagem apenas, **sem CTA de cadastro**
 * (pedido do usuário, 2026-09-03): "Novo cliente" já mora na barra de filtros,
 * e dois botões para a mesma ação dentro do mesmo modal só faziam o operador
 * escolher entre caminhos idênticos.
 *
 * Serve também ao termo de pessoa jurídica, que nem chega a ser buscado
 * (Ajuste SINIEF 11/2025): para o operador o desfecho é o mesmo — nenhum
 * cadastro selecionável —, e o motivo já veio pelo toast.
 */
function SemResultados(): ReactElement {
  return (
    <div
      className="flex flex-col items-start gap-sm p-base"
      data-testid="busca-cliente-sem-resultados"
    >
      <p className="text-md text-muted-foreground">
        Nenhum cliente encontrado para o termo informado.
      </p>
    </div>
  );
}

interface ResultadosDaBuscaProps {
  readonly clientes: readonly ClienteDaLista[];
  readonly onSelecionar: (candidato: CandidatoEscolhido) => void;
}

const classeCelulaCabecalho =
  'flex h-full items-center px-sm text-xs font-bold text-muted-foreground';

/**
 * A lista de candidatos — **tabela no desktop, cartão de duas linhas no
 * compacto** (pedido do usuário, 2026-09-09: "as colunas sobrepondo uma a
 * outra, sem tamanho para exibição").
 *
 * Seis colunas de largura fixa somam 640px; em 390px elas não cabiam de jeito
 * nenhum e o `truncate` de cada uma apagava justamente o dado que identifica o
 * cadastro. No compacto a linha vira `flex-wrap`: o **nome** ganha a primeira
 * faixa inteira (`basis-full`, e `order-first` porque no DOM ele vem depois do
 * código, que é a ordem da tabela) e código, documento, telefone e cidade
 * dividem a segunda como texto secundário.
 *
 * **Uma marcação só, com utilitários responsivos**, e não dois blocos de JSX:
 * duplicar as células duplicaria a leitura de cada campo de `ClienteDaLista`, e
 * a próxima mudança de contrato teria dois lugares para acertar.
 */
function ResultadosDaBusca({ clientes, onSelecionar }: ResultadosDaBuscaProps): ReactElement {
  return (
    <div data-testid="resultados-busca-cliente">
      {/* O cabeçalho de colunas só faz sentido onde há colunas. */}
      <div className="hidden h-[38px] border-y border-border bg-muted md:flex" aria-hidden="true">
        <span className={cn(classeCelulaCabecalho, 'w-[42px]')} />
        <span className={cn(classeCelulaCabecalho, 'w-[76px]')}>Código</span>
        <span className={cn(classeCelulaCabecalho, 'flex-1')}>Cliente</span>
        <span className={cn(classeCelulaCabecalho, 'w-[130px]')}>CPF/CNPJ</span>
        <span className={cn(classeCelulaCabecalho, 'w-[130px]')}>Telefone</span>
        <span className={cn(classeCelulaCabecalho, 'w-[120px]')}>Cidade</span>
      </div>
      <ul>
        {clientes.map((cliente) => (
          <li key={cliente.ClienteCodigo} className="border-b border-border last:border-b-0">
            <button
              type="button"
              data-testid="candidato-cliente"
              data-codigo-cliente={cliente.ClienteCodigo}
              className="flex w-full flex-wrap items-center gap-x-sm gap-y-0.5 px-base py-2.5 text-left hover:bg-accent md:h-[50px] md:flex-nowrap md:gap-0 md:px-0 md:py-0"
              onClick={() => {
                onSelecionar({ codigo: cliente.ClienteCodigo, cpf: cliente.CPF });
              }}
            >
              <span className="hidden w-[42px] shrink-0 items-center justify-center md:flex">
                <CircleCheck className="size-4 text-muted-foreground/60" aria-hidden="true" />
              </span>
              <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-muted-foreground md:w-[76px] md:px-sm md:text-base md:text-foreground">
                {cliente.ClienteCodigo}
              </span>
              <span className="order-first min-w-0 basis-full truncate text-base font-bold md:order-none md:flex-1 md:basis-auto md:px-sm">
                {cliente.ClienteNome}
              </span>
              <span className="min-w-0 shrink truncate font-mono text-sm font-medium tabular-nums text-muted-foreground md:w-[130px] md:shrink-0 md:px-sm md:text-foreground">
                {cliente.CPF}
              </span>
              <span className="min-w-0 shrink truncate font-mono text-sm font-medium tabular-nums text-muted-foreground md:w-[130px] md:shrink-0 md:px-sm md:text-foreground">
                {cliente.Celular === '' ? cliente.Telefone : cliente.Celular}
              </span>
              <span className="min-w-0 shrink truncate text-sm font-semibold text-muted-foreground md:w-[120px] md:shrink-0 md:px-sm md:text-foreground">
                {cliente.Endereco.cidade}
                {cliente.Endereco.uf === '' ? '' : `-${cliente.Endereco.uf}`}
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

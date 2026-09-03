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
import { gooeyToast } from 'goey-toast';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
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
      gooeyToast.warning(AVISO_CNPJ);
    }
  }, [termoEhCnpj]);

  // Piso vem do ERP (AD-024). Sem bootstrap, um piso inalcançável mantém a
  // busca desligada — melhor não buscar do que buscar com um mínimo inventado.
  const minimo = qtdMinChar ?? Number.POSITIVE_INFINITY;
  // Termo vazio para o hook = consulta desligada pelo `enabled` dele: é assim
  // que o CNPJ não chega a `GetListaClientes`.
  const busca = useBuscaClientes(termoEhCnpj ? '' : termoDebounced, {
    qtdMinCharParaConsulta: minimo,
    pagina,
  });

  const { montado, saindo } = usePresenca(aberto, DURACAO_SAIDA_MODAL_MS);

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
      gooeyToast.warning(AVISO_CNPJ);
      return;
    }
    onCadastrarNovo(termoLimpo);
  }

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-start justify-center bg-[color-mix(in_srgb,var(--cc-color-ink)_40%,transparent)] p-lg',
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
        role="dialog"
        aria-modal="true"
        aria-label="Consultar cliente"
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
              <h2 className="text-xl font-semibold text-foreground">Consultar cliente</h2>
              <p className="text-sm font-medium text-muted-foreground">
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

        <div className="flex shrink-0 flex-col gap-xs border-b border-border px-lg py-[14px]">
          <div className="flex items-center gap-xs">
            <label className="flex h-11 flex-1 items-center gap-xs rounded-full bg-secondary px-base text-md font-medium text-foreground">
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
          {termoEhCnpj ? (
            // O toast avisa; este texto **permanece** enquanto o CNPJ estiver no
            // campo, para o operador não ficar diante de uma lista vazia sem
            // motivo depois que a notificação some.
            <p
              className="p-base text-md text-[var(--cc-color-warning-ink)]"
              data-testid="aviso-cnpj"
            >
              {AVISO_CNPJ}
            </p>
          ) : abaixoDoMinimo ? (
            <p
              className="p-base text-md text-muted-foreground"
              data-testid="busca-cliente-abaixo-do-minimo"
            >
              {qtdMinChar === null
                ? 'Aguardando a configuração do ponto de venda.'
                : `Digite ao menos ${String(qtdMinChar)} caracteres para buscar.`}
            </p>
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
            <SemResultados
              onCadastrarNovo={() => {
                onCadastrarNovo(termoLimpo);
              }}
            />
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
            className="flex h-[60px] shrink-0 items-center justify-between gap-sm border-t border-border px-lg"
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
                className="h-9 w-28 gap-xs rounded-full text-sm font-semibold"
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
                className="h-9 w-28 gap-xs rounded-full text-sm font-semibold"
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
          </footer>
        )}
      </div>
    </div>
  );
}

interface SemResultadosProps {
  readonly onCadastrarNovo: () => void;
}

/**
 * O CTA de cadastro aparece sempre que a busca não achou nada — não há mais o
 * desvio para CNPJ: um termo de pessoa jurídica nem chega a ser buscado, então
 * "sem resultado" aqui só pode ser pessoa física ainda não cadastrada.
 */
function SemResultados({ onCadastrarNovo }: SemResultadosProps): ReactElement {
  return (
    <div
      className="flex flex-col items-start gap-sm p-base"
      data-testid="busca-cliente-sem-resultados"
    >
      <p className="text-md text-muted-foreground">
        Nenhum cliente encontrado para o termo informado.
      </p>
      <Button
        type="button"
        className="gap-xs rounded-full px-sm text-sm font-semibold"
        data-testid="cadastro-simplificado"
        onClick={onCadastrarNovo}
      >
        <UserPlus className="size-3.5" aria-hidden="true" />
        Cadastrar cliente
      </Button>
    </div>
  );
}

interface ResultadosDaBuscaProps {
  readonly clientes: readonly ClienteDaLista[];
  readonly onSelecionar: (candidato: CandidatoEscolhido) => void;
}

const classeCelulaCabecalho =
  'flex h-full items-center px-sm text-xs font-bold text-muted-foreground';

function ResultadosDaBusca({ clientes, onSelecionar }: ResultadosDaBuscaProps): ReactElement {
  return (
    <div data-testid="resultados-busca-cliente">
      <div className="flex h-[38px] border-y border-border bg-muted" aria-hidden="true">
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
              className="flex h-[50px] w-full items-center text-left hover:bg-accent"
              onClick={() => {
                onSelecionar({ codigo: cliente.ClienteCodigo, cpf: cliente.CPF });
              }}
            >
              <span className="flex w-[42px] shrink-0 items-center justify-center">
                <CircleCheck className="size-4 text-muted-foreground/60" aria-hidden="true" />
              </span>
              <span className="w-[76px] shrink-0 px-sm font-mono text-base font-semibold tabular-nums">
                {cliente.ClienteCodigo}
              </span>
              <span className="min-w-0 flex-1 truncate px-sm text-base font-bold">
                {cliente.ClienteNome}
              </span>
              <span className="w-[130px] shrink-0 truncate px-sm font-mono text-sm font-medium tabular-nums">
                {cliente.CPF}
              </span>
              <span className="w-[130px] shrink-0 truncate px-sm font-mono text-sm font-medium tabular-nums">
                {cliente.Celular === '' ? cliente.Telefone : cliente.Celular}
              </span>
              <span className="w-[120px] shrink-0 truncate px-sm text-sm font-semibold">
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

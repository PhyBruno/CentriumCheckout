import { Phone, ScanLine, Search, UserCheck, UserRound } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { gooeyToast } from 'goey-toast';
import { Button } from '@/components/ui/button';
import { classificarDocumento } from '../../domain/cliente/documento';
import { useVendaStore } from '../../stores/vendaStore';
import { FormCadastroSimplificado } from './FormCadastroSimplificado';
import { ModalBuscaCliente } from './ModalBuscaCliente';
import { useIdentificacaoCliente } from './useCliente';

/**
 * Cliente da venda (T019) — réplica do card "Cliente da venda expansível" do
 * Pencil (`design/CentriumCheckout.pen`, nó `AasDP`, lido via MCP): card de
 * raio 24 e borda `$hairline`, cabeçalho de 26px com o rótulo "Cliente" e o
 * badge de status, e a linha de campos de 42px — CPF/CNPJ (243px), nome
 * (preenche), lupa circular (42px) e o botão "Identificar" (126px).
 *
 * O card do desenho também abriga "Vendedor"/"Vendedor NFCe" e "Operador":
 * **não** implementados aqui porque são de outras features (012 e 002) — este
 * componente cobre só o cliente, e acrescentar campos vazios de vendedor seria
 * exibir dado que esta feature não tem.
 *
 * **Sem indicador de origem** (`FR-006`, AD-053): o badge mostra o nome do
 * cliente atual sem distinguir se veio do padrão da empresa (AD-032) ou de uma
 * escolha do operador. O único estado que ele diferencia é a ausência de
 * cliente — que é `FR-005`, não origem.
 *
 * Os dois caminhos de identificação são superfícies distintas, como o desenho
 * separa (`research.md` D2): o campo CPF/CNPJ resolve por `GetCliente`
 * (`CLI-01`) e a lupa abre a busca por termo livre (`CLI-02`).
 */
export function CampoClienteVenda(): ReactElement {
  const clienteAtual = useVendaStore((estado) => estado.clienteAtual);
  const { identificarPorDocumento, cadastrar } = useIdentificacaoCliente();

  const [documento, setDocumento] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [cadastroAberto, setCadastroAberto] = useState(false);
  const [cpfSugerido, setCpfSugerido] = useState('');

  /**
   * `FR-010`/D4: um CNPJ **pode** ser buscado (o cliente PJ pode existir,
   * cadastrado fora do Checkout). O que não existe é o caminho de criação — daí
   * o aviso, em vez do cadastro, quando a busca por CNPJ não acha nada.
   */
  function tratarNaoEncontrado(termo: string): void {
    if (classificarDocumento(termo) === 'CNPJ') {
      gooeyToast.warning(
        'Nenhum cliente com esse CNPJ. O cadastro simplificado do Checkout cria apenas pessoa física — use o cadastro completo do ERP.',
      );
      return;
    }
    setCpfSugerido(termo);
    setCadastroAberto(true);
  }

  async function identificar(): Promise<void> {
    const termo = documento.trim();
    if (termo === '' || buscando) {
      return;
    }

    setBuscando(true);
    try {
      const resultado = await identificarPorDocumento(termo, 'BUSCA_DOCUMENTO');
      if (resultado.situacao === 'nao-encontrado') {
        tratarNaoEncontrado(termo);
        return;
      }
      if (resultado.situacao === 'identificado') {
        setDocumento('');
      }
    } finally {
      setBuscando(false);
    }
  }

  async function selecionarCandidato(cpf: string): Promise<void> {
    // A lista só capta o documento; quem resolve o cadastro completo é sempre
    // `GetCliente` (`research.md` D1).
    const resultado = await identificarPorDocumento(cpf, 'BUSCA_LIVRE');
    if (resultado.situacao === 'nao-encontrado') {
      tratarNaoEncontrado(cpf);
    }
  }

  return (
    <section
      className="flex flex-col gap-sm rounded-xl border border-border bg-background p-[14px]"
      data-testid="cliente-da-venda"
      aria-label="Cliente da venda"
    >
      <header className="flex h-[26px] items-center gap-[9px]">
        <UserRound className="size-4.5 shrink-0 text-foreground" aria-hidden="true" />
        <span className="text-lg font-semibold text-foreground">Cliente</span>
        <span
          className="flex items-center gap-[6px] rounded-full bg-secondary px-[10px] py-[5px]"
          data-testid="status-cliente"
        >
          {clienteAtual === null ? (
            <>
              <span
                className="size-2 rounded-full bg-[var(--cc-color-accent-yellow)]"
                aria-hidden="true"
              />
              <span className="text-sm font-semibold text-foreground">Não identificado</span>
            </>
          ) : (
            <span className="text-sm font-semibold text-foreground">{clienteAtual.nome}</span>
          )}
        </span>
      </header>

      <div className="flex h-[42px] items-center gap-[10px]">
        <label className="flex h-full w-[243px] shrink-0 items-center gap-[9px] rounded-lg border border-border bg-[var(--cc-color-surface-soft)] px-sm">
          <ScanLine className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="flex min-w-0 flex-1 flex-col gap-[1px]">
            <span className="text-[10px] font-semibold text-muted-foreground">CPF/CNPJ</span>
            <input
              className="w-full bg-transparent text-base font-medium outline-none placeholder:text-muted-foreground"
              data-testid="campo-documento-cliente"
              autoComplete="off"
              inputMode="numeric"
              placeholder="Digite"
              value={documento}
              onChange={(evento) => {
                setDocumento(evento.target.value);
              }}
              onKeyDown={(evento) => {
                if (evento.key === 'Enter') {
                  evento.preventDefault();
                  void identificar();
                }
              }}
            />
          </span>
        </label>

        <div className="flex h-full min-w-0 flex-1 items-center gap-[9px] rounded-lg border border-border bg-[var(--cc-color-surface-soft)] px-sm">
          <UserRound className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="flex min-w-0 flex-1 flex-col gap-[1px]">
            <span className="text-[10px] font-semibold text-muted-foreground">Nome / telefone</span>
            <span
              className="truncate text-base font-medium text-foreground"
              data-testid="nome-cliente"
            >
              {clienteAtual?.nome === undefined || clienteAtual.nome === ''
                ? 'Buscar cliente cadastrado'
                : clienteAtual.nome}
            </span>
          </span>
        </div>

        <Button
          type="button"
          variant="secondary"
          size="icon-lg"
          className="size-[42px] shrink-0 rounded-full"
          data-testid="abrir-busca-cliente"
          aria-label="Buscar cliente"
          onClick={() => {
            setModalAberto(true);
          }}
        >
          <Search className="size-4" aria-hidden="true" />
        </Button>

        <Button
          type="button"
          className="h-[42px] w-[126px] shrink-0 gap-[7px] rounded-full text-base font-bold"
          data-testid="identificar-cliente"
          disabled={documento.trim() === '' || buscando}
          onClick={() => {
            void identificar();
          }}
        >
          <UserCheck className="size-4" aria-hidden="true" />
          Identificar
        </Button>
      </div>

      <div className="flex h-[42px] w-[243px] items-center gap-[9px] rounded-lg border border-border bg-[var(--cc-color-surface-soft)] px-sm">
        <Phone className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="flex min-w-0 flex-1 flex-col gap-[1px]">
          <span className="text-[10px] font-semibold text-muted-foreground">Contato</span>
          <span
            className="truncate text-base font-medium text-foreground"
            data-testid="contato-cliente"
          >
            {clienteAtual?.celular === undefined || clienteAtual.celular === null
              ? '—'
              : clienteAtual.celular}
          </span>
        </span>
      </div>

      <ModalBuscaCliente
        aberto={modalAberto}
        onFechar={() => {
          setModalAberto(false);
        }}
        onCandidatoSelecionado={(cpf) => {
          void selecionarCandidato(cpf);
        }}
        onCadastrarNovo={(termo) => {
          setModalAberto(false);
          setCpfSugerido(classificarDocumento(termo) === 'CPF' ? termo : '');
          setCadastroAberto(true);
        }}
      />

      <FormCadastroSimplificado
        aberto={cadastroAberto}
        cpfInicial={cpfSugerido}
        onFechar={() => {
          setCadastroAberto(false);
        }}
        onConfirmar={async (dados) => {
          const resultado = await cadastrar(dados);
          if (resultado.situacao === 'identificado') {
            setCadastroAberto(false);
            setDocumento('');
          }
        }}
      />
    </section>
  );
}

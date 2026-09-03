import {
  ChevronDown,
  ChevronUp,
  Phone,
  ScanLine,
  Search,
  UserCheck,
  UserPen,
  UserRound,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { gooeyToast } from 'goey-toast';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  apenasDigitos,
  classificarEntradaCliente,
  formatarDocumento,
  MOTIVO_VENDA_PESSOA_JURIDICA,
} from '../../domain/cliente/documento';
import { useFocoVendaStore } from '../../stores/focoVendaStore';
import { useSessionStore } from '../../stores/sessionStore';
import { useVendaStore } from '../../stores/vendaStore';
import { FormCadastroSimplificado } from './FormCadastroSimplificado';
import { ModalBuscaCliente, type CandidatoEscolhido } from './ModalBuscaCliente';
import { useIdentificacaoCliente } from './useCliente';

/**
 * Cliente da venda (T019) — réplica do card "Cliente da venda expansível" do
 * Pencil (`design/CentriumCheckout.pen`, nó `AasDP`, lido via MCP): card de
 * raio 24 e borda `$hairline`, cabeçalho de 26px com as pílulas de Cliente,
 * Vendedor e Operador mais o controle de expandir, e a linha de campos de 42px
 * — CPF/CNPJ (243px), nome (preenche), lupa circular (42px) e "Identificar"
 * (126px).
 *
 * **Nasce colapsado** (pedido do usuário, 2026-09-03): o cabeçalho já responde
 * "quem é o cliente desta venda", que é a pergunta do dia a dia; os campos de
 * identificação são exceção, e mantê-los sempre abertos custaria uma faixa de
 * altura permanente ao carrinho.
 *
 * **A pílula do Vendedor vem de `SessaoUsuario`, não de `GetCliente`**: o
 * schema `ClienteCheckout` do contrato não tem nenhum campo de vendedor
 * (verificado em `ApiCentriumOAuth.yaml`) — o cadastro do cliente não carrega
 * vendedor associado. `VendedorCodigo`/`VendedorNome` são do PDV; trocar o
 * vendedor durante a venda é a feature 012 (`GetListaVendedores`), e o campo
 * "Vendedor NFCe" do mesmo card do desenho pertence a ela.
 *
 * **Sem indicador de origem** (`FR-006`, AD-053): a pílula mostra o nome do
 * cliente atual sem distinguir se veio do padrão da empresa (AD-032) ou de uma
 * escolha do operador. O único estado que ela diferencia é a ausência de
 * cliente — que é `FR-005`, não origem.
 *
 * Os dois caminhos de identificação são superfícies distintas, como o desenho
 * separa (`research.md` D2): o campo de identificação resolve por
 * `GetCliente` (`CLI-01`) e a lupa abre a busca por termo livre (`CLI-02`).
 *
 * **Um desvio deliberado do Pencil**: o rótulo do primeiro campo é "Código do
 * cliente ou CPF", não o "CPF/CNPJ" desenhado (pedido do usuário,
 * 2026-09-03). O desenho é anterior a duas decisões que mudaram o que o campo
 * aceita — ele passou a receber também o código do cliente e deixou de
 * receber CNPJ (AD-133) —, e um rótulo que anuncia CNPJ ofereceria justamente
 * o que a norma proíbe.
 */
export function CampoClienteVenda(): ReactElement {
  const clienteAtual = useVendaStore((estado) => estado.clienteAtual);
  const sessao = useSessionStore((estado) => estado.registro?.SessaoUsuario ?? null);
  const { identificarPorDocumento, identificarPorCodigo, cadastrar } = useIdentificacaoCliente();
  const focarCodigoProduto = useFocoVendaStore((estado) => estado.focarCodigoProduto);

  const [expandido, setExpandido] = useState(false);
  const campoDocumento = useRef<HTMLInputElement>(null);
  const [documento, setDocumento] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [cadastroAberto, setCadastroAberto] = useState(false);
  const [cpfSugerido, setCpfSugerido] = useState('');
  /**
   * A última tentativa de identificação foi recusada por ser pessoa jurídica
   * (AD-133).
   *
   * Zera o bloco inteiro — campo de documento, nome, contato e as pílulas —
   * até a próxima ação do operador (pedido do usuário, 2026-09-03). O cliente
   * em si já foi limpo do estado da venda por `limparCliente`; este sinal
   * existe para o que **não** vem do cliente: a pílula de vendedor, que é do
   * PDV (`SessaoUsuario`) e não sumiria sozinha.
   */
  const [recusaPessoaJuridica, setRecusaPessoaJuridica] = useState(false);

  /**
   * Contador de pedidos de foco no campo de documento — mesmo motivo do
   * `focoVendaStore`: duas recusas seguidas precisam disparar o efeito duas
   * vezes, e um booleano ficaria `true` na primeira sem mudar na segunda.
   *
   * O foco vai por efeito, e não por `focus()` dentro do handler, porque a
   * recusa também reabre o bloco: enquanto ele está recolhido o campo é
   * `inert`, e `focus()` antes de o React aplicar o novo render não teria
   * efeito nenhum.
   */
  const [pedidosDeFocoNoDocumento, setPedidosDeFocoNoDocumento] = useState(0);

  useEffect(() => {
    if (pedidosDeFocoNoDocumento === 0) {
      return;
    }
    campoDocumento.current?.focus();
  }, [pedidosDeFocoNoDocumento]);

  /**
   * Qual das duas identidades do cliente o campo mostra depois de identificar:
   * o **código** ou o **documento**.
   *
   * O campo aceita as duas (`classificarEntradaCliente`), e o operador vê de
   * volta a que ele próprio usou — quem digitou `1255` continua lendo
   * `1255`, quem digitou o CPF continua lendo o CPF com máscara (pedido do
   * usuário, 2026-09-03). Trocar a face por conta própria faria o campo
   * "corrigir" a entrada do operador para uma identidade que ele não escolheu.
   *
   * `'codigo'` é o padrão porque é a face de quem **não** digitou nada no
   * campo: o cliente default (`GetSessao` não devolve documento, AD-108), o
   * candidato escolhido no modal e o cliente recém-cadastrado — nos dois
   * últimos o operador buscou por nome ou preencheu um formulário, e o código é
   * o que identifica o cadastro que passou a valer.
   */
  const [faceDaIdentificacao, setFaceDaIdentificacao] = useState<'codigo' | 'documento'>('codigo');

  /**
   * O campo mostra a identificação do cliente atual, com máscara de leitura
   * quando é documento (pedido do usuário, 2026-09-03) — antes ele era
   * esvaziado depois da busca, e o operador perdia de vista quem tinha
   * identificado a venda.
   *
   * Ajustado durante a renderização, não num efeito: é "estado derivado de uma
   * prop que mudou" (o cliente do store), e um efeito daria um quadro com o
   * valor antigo em tela. `documentoEspelhado` guarda o valor que a
   * sincronização já aplicou, para o operador poder digitar por cima sem o
   * campo voltar sozinho ao cliente atual a cada tecla.
   *
   * Documento vazio cai no código pelo mesmo motivo do cliente default: existe
   * cadastro sem CPF no varejo, e um campo em branco esconderia quem está na
   * venda.
   */
  const documentoDoCliente =
    clienteAtual === null || clienteAtual.documento === null || clienteAtual.documento === ''
      ? null
      : clienteAtual.documento;
  /**
   * Celular vazio conta como ausente, junto com `null`: o cadastro sem
   * telefone chega das duas formas — `GetSessao` não devolve contato do
   * cliente default e `GetCliente` devolve string vazia — e para o operador é
   * o mesmo caso.
   */
  const contatoDoCliente =
    clienteAtual?.celular === undefined ||
    clienteAtual.celular === null ||
    clienteAtual.celular === ''
      ? null
      : clienteAtual.celular;

  const identificacaoDoCliente =
    clienteAtual === null
      ? null
      : faceDaIdentificacao === 'documento' && documentoDoCliente !== null
        ? documentoDoCliente
        : String(clienteAtual.codigoCliente);
  const [documentoEspelhado, setDocumentoEspelhado] = useState(identificacaoDoCliente);
  if (identificacaoDoCliente !== documentoEspelhado) {
    setDocumentoEspelhado(identificacaoDoCliente);
    setDocumento(identificacaoDoCliente === null ? '' : formatarDocumento(identificacaoDoCliente));
  }

  /**
   * Cliente identificado: o card recolhe e o foco volta ao código do produto
   * (pedido do usuário, 2026-09-03).
   *
   * Vale para os três caminhos — documento, escolha no modal e cadastro
   * simplificado —, porque os três terminam no mesmo ponto do fluxo do caixa:
   * o cliente está resolvido e o próximo gesto é bipar um item. Deixar o card
   * aberto custaria altura ao carrinho e um clique a mais.
   */
  function concluirIdentificacao(): void {
    setRecusaPessoaJuridica(false);
    setExpandido(false);
    focarCodigoProduto();
  }

  /**
   * Documento sem cadastro correspondente abre o cadastro simplificado, já com
   * o que o operador digitou.
   *
   * **Sem desvio para CNPJ**: nenhum documento de pessoa jurídica chega até
   * aqui — a recusa acontece antes de qualquer consulta ao ERP, em
   * `identificar()` (Ajuste SINIEF 11/2025).
   */
  function abrirCadastroPara(documento: string): void {
    setCpfSugerido(documento);
    setCadastroAberto(true);
  }

  /**
   * Devolve o bloco de identificação ao estado "nada identificado".
   *
   * O toast já explicou o motivo; o que não pode ficar é a tela sugerindo que
   * a venda seguiu com algum cliente.
   *
   * **Ao contrário de `concluirIdentificacao`, o card fica aberto e o foco
   * volta ao campo de documento** (pedido do usuário, 2026-09-03): recolher e
   * mandar o caixa para o código do produto é o desfecho de quem *tem*
   * cliente — aqui a venda ficou sem nenhum, e o próximo gesto é redigitar a
   * identificação, não bipar um item. Devolver o foco só é seguro porque o
   * campo foi esvaziado: com o valor recusado ainda nele, o próximo `blur`
   * repetiria a mesma consulta em laço.
   */
  function zerarIdentificacao(): void {
    setRecusaPessoaJuridica(true);
    setDocumento('');
    setExpandido(true);
    setPedidosDeFocoNoDocumento((atual) => atual + 1);
  }

  async function identificar(): Promise<void> {
    const termo = documento.trim();
    if (termo === '' || buscando) {
      return;
    }

    // O documento já associado à venda não precisa de nova consulta: sem esta
    // guarda, sair do campo (TAB, clique fora) rebuscaria o mesmo cliente a
    // cada passagem de foco.
    //
    // Compara **dígitos**, não o texto mascarado: redigitar `12298023980` sobre
    // o `122.980.239-80` exibido é o gesto natural com leitor ou teclado
    // numérico, e uma comparação literal chamaria o ERP à toa.
    if (
      identificacaoDoCliente !== null &&
      apenasDigitos(termo) === apenasDigitos(identificacaoDoCliente)
    ) {
      return;
    }

    // Código ou documento? A contagem de dígitos decide, e o ERP recebe só
    // dígitos — `GetCliente` tem um parâmetro para cada caso.
    const entrada = classificarEntradaCliente(termo);

    // Mais de 11 dígitos é pessoa jurídica: a venda não pode acontecer no
    // Checkout (Ajuste SINIEF 11/2025), então o ERP nem é consultado — buscar
    // um cadastro que não poderia ser usado só gastaria uma ida à rede e
    // sugeriria ao operador que o caminho existe.
    if (entrada.tipo === 'PESSOA_JURIDICA') {
      gooeyToast.warning(
        `${MOTIVO_VENDA_PESSOA_JURIDICA} Informe um CPF (11 dígitos) ou o código do cliente.`,
      );
      return;
    }
    if (entrada.tipo === 'INVALIDO') {
      gooeyToast.warning('Informe o código do cliente (até 6 dígitos) ou um CPF (11 dígitos).');
      return;
    }

    setBuscando(true);
    try {
      const resultado =
        entrada.tipo === 'CODIGO'
          ? await identificarPorCodigo(entrada.codigo, 'BUSCA_DOCUMENTO')
          : await identificarPorDocumento(entrada.documento, 'BUSCA_DOCUMENTO');

      if (resultado.situacao === 'recusado-pessoa-juridica') {
        zerarIdentificacao();
        return;
      }
      if (resultado.situacao === 'nao-encontrado') {
        // Código sem cadastro não abre o cadastro simplificado: o operador
        // errou o número, não descobriu um cliente novo — criar um cliente
        // aqui inventaria um cadastro que ele não pediu.
        // Sem recolher nem mexer no foco, como em todo desfecho de erro: o
        // card só recolhe quando a venda ficou com um cliente. O valor
        // continua no campo justamente para o operador corrigir o dígito
        // errado — por isso aqui não se força o foco de volta, que somado ao
        // `onBlur` faria a mesma consulta sair de novo a cada TAB.
        if (entrada.tipo === 'CODIGO') {
          gooeyToast.warning(`Nenhum cliente com o código ${String(entrada.codigo)}.`);
          return;
        }
        abrirCadastroPara(entrada.documento);
        return;
      }
      if (resultado.situacao === 'identificado') {
        // A face segue o que o operador digitou, não o que o ERP devolveu: o
        // cadastro resolvido tem as duas identidades, e trocar uma pela outra
        // reescreveria a entrada dele.
        setFaceDaIdentificacao(entrada.tipo === 'CPF' ? 'documento' : 'codigo');
        concluirIdentificacao();
      }
    } finally {
      setBuscando(false);
    }
  }

  async function selecionarCandidato(candidato: CandidatoEscolhido): Promise<void> {
    // A lista só capta a identidade; quem resolve o cadastro completo é sempre
    // `GetCliente` (`research.md` D1). Pelo **código**, não pelo documento: o
    // `CodCliente` sempre existe, enquanto o `CPF` do candidato pode vir vazio
    // (cliente cadastrado sem documento) — e aí a busca por documento abriria o
    // cadastro simplificado sozinho.
    const resultado = await identificarPorCodigo(candidato.codigo, 'BUSCA_LIVRE');
    if (resultado.situacao === 'recusado-pessoa-juridica') {
      zerarIdentificacao();
      return;
    }
    if (resultado.situacao === 'nao-encontrado') {
      abrirCadastroPara(candidato.cpf);
      return;
    }
    if (resultado.situacao === 'identificado') {
      // Busca por termo livre não passa pelo campo: o operador procurou por
      // nome, e o código é o que identifica o cadastro escolhido.
      setFaceDaIdentificacao('codigo');
      concluirIdentificacao();
    }
  }

  const Chevron = expandido ? ChevronUp : ChevronDown;

  return (
    /* Sem `gap` entre o cabeçalho e o bloco colapsável: o espaço que os
       separa mora **dentro** do bloco (`pt-sm` no conteúdo). Um `gap` aqui
       continuaria valendo com o bloco recolhido — ele separa o cabeçalho de um
       filho de altura zero —, e sobrava uma faixa em branco antes da borda
       inferior do card (achado do usuário, 2026-09-03). Dentro do bloco, o
       mesmo espaço é comprimido pela animação de altura e some junto com o
       conteúdo. */
    <section
      className="flex flex-col rounded-xl border border-border bg-background p-[14px]"
      data-testid="cliente-da-venda"
      aria-label="Cliente da venda"
    >
      <header className="flex h-[26px] items-center justify-between gap-[9px]">
        <div className="flex min-w-0 items-center gap-md">
          <Pilula icone={<UserRound className="size-4.5 text-foreground" />} rotulo="Cliente">
            {clienteAtual === null ? (
              <>
                <span
                  className="size-2 shrink-0 rounded-full bg-[var(--cc-color-accent-yellow)]"
                  aria-hidden="true"
                />
                Não identificado
              </>
            ) : (
              clienteAtual.nome
            )}
          </Pilula>

          {/* Vendedor e operador do PDV (`SessaoUsuario`): rótulo, não decisão
              de venda — sem o dado, a pílula simplesmente não aparece. */}
          {recusaPessoaJuridica ||
          sessao?.VendedorNome === undefined ||
          sessao.VendedorNome === '' ? null : (
            <Pilula
              icone={<UserRound className="size-4.5 text-foreground" />}
              rotulo="Vendedor"
              testId="pilula-vendedor"
            >
              {sessao.VendedorNome}
            </Pilula>
          )}

          {sessao?.UsuarioNome === undefined || sessao.UsuarioNome === '' ? null : (
            <Pilula
              icone={<UserPen className="size-4.5 text-foreground" />}
              rotulo="Operador"
              testId="pilula-operador"
            >
              {sessao.UsuarioNome}
            </Pilula>
          )}
        </div>

        <button
          type="button"
          className="flex shrink-0 items-center gap-[7px] text-sm font-semibold text-muted-foreground"
          data-testid="alternar-cliente-expandido"
          aria-expanded={expandido}
          aria-controls="campos-cliente-venda"
          onClick={() => {
            setExpandido((atual) => !atual);
          }}
        >
          {expandido ? 'Expandido' : 'Recolhido'}
          <Chevron className="size-4" aria-hidden="true" />
        </button>
      </header>

      {/* Recolhe animando a altura sem `height` fixa nem medição em JS: o
          conteúdo segue definindo o próprio tamanho e o navegador interpola
          `0fr → 1fr` (`cc-colapsavel`, `global.css`). Continua montado quando
          recolhido, então os campos existem no DOM — por isso `inert`, que os
          tira da navegação por TAB e de leitores de tela enquanto invisíveis. */}
      <div
        id="campos-cliente-venda"
        data-testid="campos-cliente-venda"
        className={cn('cc-colapsavel', expandido && 'cc-colapsavel-aberto')}
        {...(expandido ? {} : { inert: true })}
      >
        {/* Caixa de corte, sem estilo próprio: é ela que `cc-colapsavel > *`
            zera (`min-height: 0`) e recorta. O espaçamento vai no filho de
            dentro porque `grid-template-rows: 0fr` respeita o min-content da
            linha — `min-height: 0` zera o conteúdo, mas não o padding, e um
            `pt` aqui viraria 12px de altura residual com o bloco recolhido. */}
        <div>
          <div className="flex flex-col gap-sm pt-sm">
            <div className="flex h-[42px] items-center gap-[10px]">
              <label className="flex h-full w-[243px] shrink-0 items-center gap-[9px] rounded-lg border border-border bg-[var(--cc-color-surface-soft)] px-sm">
                <ScanLine className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="flex min-w-0 flex-1 flex-col gap-[1px]">
                  <span className="text-[10px] font-semibold text-muted-foreground">
                    Código do cliente ou CPF
                  </span>
                  <input
                    className="w-full bg-transparent font-mono text-base font-medium tabular-nums outline-none placeholder:font-sans placeholder:text-muted-foreground"
                    data-testid="campo-documento-cliente"
                    ref={campoDocumento}
                    autoComplete="off"
                    inputMode="numeric"
                    placeholder="Digite"
                    value={documento}
                    onChange={(evento) => {
                      setDocumento(evento.target.value);
                      setRecusaPessoaJuridica(false);
                    }}
                    // Sair do campo (TAB, clique fora) já dispara a consulta ao
                    // ERP — pedido do usuário, 2026-09-03: no ritmo do caixa, o
                    // documento é digitado e o foco segue para o produto, sem
                    // passar pelo botão.
                    onBlur={() => {
                      void identificar();
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
                  <span className="text-[10px] font-semibold text-muted-foreground">
                    Nome / telefone
                  </span>
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
                {/* Sem contato, o campo se comporta como um placeholder — texto
                    e cor secundária, como o "Bipe ou digite" da barra de produto
                    (pedido do usuário, 2026-09-03). O traço anterior era ambíguo:
                    lido rápido, parecia um contato curto ou um campo quebrado, e
                    não dizia que o cadastro simplesmente não tem telefone. */}
                <span
                  className={cn(
                    'truncate text-base font-medium',
                    contatoDoCliente === null ? 'text-muted-foreground' : 'text-foreground',
                  )}
                  data-testid="contato-cliente"
                >
                  {contatoDoCliente ?? 'Não informado'}
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <ModalBuscaCliente
        aberto={modalAberto}
        onFechar={() => {
          setModalAberto(false);
        }}
        onCandidatoSelecionado={(candidato) => {
          void selecionarCandidato(candidato);
        }}
        onCadastrarNovo={(termo) => {
          setModalAberto(false);
          const entrada = classificarEntradaCliente(termo);
          setCpfSugerido(entrada.tipo === 'CPF' ? entrada.documento : '');
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
          // O cliente recém-criado já entra na venda pelo próprio slice
          // (`CLIENTE_CRIADO`); aqui só se fecha o modal e se devolve o caixa
          // ao ritmo dele.
          const resultado = await cadastrar(dados);
          if (resultado.situacao === 'identificado') {
            // O `CodCliente` só existe depois do `PostCliente`: é o dado novo
            // da operação, e o que o operador precisa anotar do cadastro que
            // acabou de criar.
            setFaceDaIdentificacao('codigo');
            setCadastroAberto(false);
            concluirIdentificacao();
          }
        }}
      />
    </section>
  );
}

interface PilulaProps {
  readonly icone: ReactNode;
  readonly rotulo: string;
  readonly children: ReactNode;
  readonly testId?: string;
}

/** Par "ícone + rótulo + pílula" do cabeçalho do card (nós `L0vfd`/`dIKvg`). */
function Pilula({ icone, rotulo, children, testId }: PilulaProps): ReactElement {
  return (
    <div className="flex min-w-0 items-center gap-[9px]">
      <span className="shrink-0" aria-hidden="true">
        {icone}
      </span>
      <span className="shrink-0 text-lg font-semibold text-foreground">{rotulo}</span>
      {/* `truncate` fica no wrapper de texto de cada caller, não aqui: o estado
          "não identificado" traz um ponto colorido ao lado do texto, e cortar o
          conteúdo inteiro esconderia o ponto junto. */}
      <span
        className="flex min-w-0 items-center gap-[6px] truncate rounded-full bg-secondary px-[10px] py-[5px] text-sm font-semibold whitespace-nowrap text-foreground"
        data-testid={testId ?? 'status-cliente'}
      >
        {children}
      </span>
    </div>
  );
}

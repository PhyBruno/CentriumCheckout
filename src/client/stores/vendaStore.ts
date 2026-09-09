import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { notificadorDeVeredito, notificar } from '@/lib/notificar';
import { criarAuditoriaSlice } from './slices/auditoriaSlice';
import type { AuditoriaSlice } from './slices/auditoriaSlice';
import { criarCarrinhoSlice } from './slices/carrinhoSlice';
import type { CarrinhoDeps, CarrinhoSlice } from './slices/carrinhoSlice';
import { criarClienteSlice } from './slices/clienteSlice';
import type { ClienteDeps, ClienteSlice } from './slices/clienteSlice';
import { criarIdentidadeVendaSlice } from './slices/identidadeVendaSlice';
import type { IdentidadeVendaDeps, IdentidadeVendaSlice } from './slices/identidadeVendaSlice';
import { criarPagamentoSlice } from './slices/pagamentoSlice';
import type { PagamentoDeps, PagamentoSlice } from './slices/pagamentoSlice';
import { criarValidacaoVendaSlice } from './slices/validacaoVendaSlice';
import type { ValidacaoDeps, ValidacaoVendaSlice } from './slices/validacaoVendaSlice';
import { criarVendedorSlice } from './slices/vendedorSlice';
import type { VendedorDeps, VendedorSlice } from './slices/vendedorSlice';
import { useSessionStore } from './sessionStore';
import type { OrigemVenda } from '../domain/auditoria/eventos';
import type { CapacidadesPagamento } from '../domain/pagamento/roteamentoIntegracao';
import type { LinhaRateavel } from '../domain/pagamento/descontoCapa';
import type { SnapshotVenda } from '../domain/venda/montarRetratoVenda';
import { notificarVeredito } from '../features/validacao/notificarVeredito';
import { enviarValidarNFCe } from '../services/validacao/validarNFCeMutation';
import { linhasAtivas, totalLinha, totalVenda } from '../domain/precificacao/linha';
import { fetchProduto } from '../services/produto/produtoQueries';
import { validarTicket } from '../services/pagamento/pagamentoQueries';
import { paraCapacidadesPagamento } from '../services/pagamento/pagamentoMapper';
import { sessaoPagamentoSchema } from '../../shared/schemas/pagamento.schema';

/**
 * Store da venda em andamento — **sem `persist`** (AD-006, Constitution VI):
 * o carrinho e tudo que o acompanha morrem num F5, por decisão de arquitetura,
 * não por esquecimento.
 *
 * Montado pelo padrão de slices do Zustand para ficar aberto à extensão sem
 * alteração (Open/Closed): cada feature de venda acrescenta o seu slice à
 * interseção de `VendaState` e o seu slice creator ao spread abaixo. Existem os
 * slices de auditoria (001), carrinho (003), identidade da venda (004), cliente
 * (005), pagamento (008) e vendedor (012).
 *
 * **A interseção é um objeto único**: dois slices que declarem o mesmo nome de
 * campo compartilham o campo, não ganham um cada. É por isso que a flag interna
 * do vendedor se chama `houveEscolhaExplicitaDeVendedor` e não repete o
 * `houveEscolhaExplicita` do cliente.
 */
export type VendaState = AuditoriaSlice &
  CarrinhoSlice &
  IdentidadeVendaSlice &
  ClienteSlice &
  PagamentoSlice &
  ValidacaoVendaSlice &
  VendedorSlice;

/** Configuração do PDV ainda não carregada quando o carrinho precisou dela. */
export class ErroSessaoSemConfiguracao extends Error {
  constructor() {
    super(
      'Configuração do ponto de venda indisponível: o carrinho só opera depois do bootstrap concluído.',
    );
    this.name = 'ErroSessaoSemConfiguracao';
  }
}

/**
 * `SessaoUsuario.TipoPreco` do bootstrap (feature 002).
 *
 * Falha alto em vez de assumir um tipo qualquer: o carrinho só é alcançável
 * depois de `telaDeVendaLiberada`, então a ausência aqui é bug de composição —
 * e precificar com um `TipoPreco` inventado produziria preço errado em silêncio,
 * que é justamente o que a Constitution V existe para impedir.
 */
function tipoPrecoDoBootstrap(): number {
  const registro = useSessionStore.getState().registro;
  if (registro === null) {
    throw new ErroSessaoSemConfiguracao();
  }
  return registro.SessaoUsuario.TipoPreco;
}

/**
 * `SessaoUsuario.UsuarioTipoCodigoProduto` — enviado sempre, nunca inferido por
 * chamada (AD-033). Falha alto pelo mesmo motivo de `tipoPrecoDoBootstrap`.
 */
function tipoCodProdutoDoBootstrap(): string {
  const registro = useSessionStore.getState().registro;
  if (registro === null) {
    throw new ErroSessaoSemConfiguracao();
  }
  return registro.SessaoUsuario.UsuarioTipoCodigoProduto;
}

/**
 * Dependências do carrinho na composição real (Dependency Inversion — D8).
 *
 * `podeMutarCarrinho` está fechado pela 008: lê o seletor do slice de pagamento
 * no próprio store combinado — `false` a partir de qualquer pagamento
 * **aprovado** (invariante I7, AD-030/`CART-09`). Antes da 008 aqui havia o
 * stub `() => true`, que descrevia uma venda sem pagamento. `clienteAtual` já
 * estava fechado pela 005 pelo mesmo mecanismo: nenhum slice importa o outro,
 * a leitura é sempre pelo store montado.
 *
 * O mesmo predicado serve carrinho, cliente e identidade da venda — uma segunda
 * regra de "quando a venda pode mudar" divergiria em silêncio (AD-043). Com a
 * 008 ele passa a congelar também cliente, vendedor e desconto de capa, que é o
 * alcance ampliado de I12/`FR-023` (AD-113).
 */
export const carrinhoDepsPadrao: CarrinhoDeps = {
  podeMutarCarrinho: () => useVendaStore.getState().podeMutarCarrinho(),
  tipoPrecoAtual: tipoPrecoDoBootstrap,
  clienteAtual: () => {
    const cliente = useVendaStore.getState().clienteAtual;
    if (cliente === null) {
      return null;
    }
    return {
      codigo: cliente.codigoCliente,
      listaPreco: cliente.listaPreco,
      // `null` significa "o cadastro deste cliente não define convênio"
      // (cadastro simplificado, `research.md` D10) — para o cálculo, ausência
      // de convênio e convênio zero produzem o mesmo fator `1`.
      descontoConvenio: cliente.descontoConvenio ?? 0,
    };
  },
  // Lido do estado a cada checagem, como `podeMutarCarrinho`: a marca vive na
  // forma de pagamento, e não na identidade da venda, porque uma venda vinda de
  // DAV pendente de cobrança recebe formas do operador depois — e elas não são
  // do documento (AD-169).
  pagamentoVeioDeDocumento: () =>
    useVendaStore
      .getState()
      .pagamentos.some((pagamento) => pagamento.veioDeDocumento && pagamento.status === 'APROVADO'),
  avisar: (mensagem) => {
    notificar.aviso(mensagem);
  },
};

/**
 * Dependências do cliente na composição real (`research.md` D7/D8).
 *
 * `podeMutarCarrinho` é **o mesmo** predicado do carrinho, não um segundo:
 * cliente e carrinho compartilham a regra de "a venda ainda pode ser mutada"
 * (AD-043).
 */
export function clienteDepsPadrao(depsCarrinho: CarrinhoDeps): ClienteDeps {
  return {
    podeMutarCarrinho: depsCarrinho.podeMutarCarrinho,
    buscarSnapshotProduto: (codigoProduto, cliente) =>
      fetchProduto(codigoProduto, {
        tipoCodProduto: tipoCodProdutoDoBootstrap(),
        tipoPreco: depsCarrinho.tipoPrecoAtual(),
        codigoCliente: cliente.codigoCliente,
        listaPreco: cliente.listaPreco,
      }),
    ...(depsCarrinho.avisar ? { avisar: depsCarrinho.avisar } : {}),
  };
}

/**
 * Dependências da identidade da venda na composição real (AD-139).
 *
 * `podeMutarCarrinho` é **o mesmo** predicado do carrinho e do cliente, pelo
 * mesmo motivo de `clienteDepsPadrao`: uma terceira regra de "quando a venda
 * pode ser mutada" poderia divergir em silêncio (AD-043).
 */
export function identidadeVendaDepsPadrao(depsCarrinho: CarrinhoDeps): IdentidadeVendaDeps {
  return {
    podeMutarCarrinho: depsCarrinho.podeMutarCarrinho,
    ...(depsCarrinho.avisar ? { avisar: depsCarrinho.avisar } : {}),
  };
}

/**
 * Dependências do vendedor na composição real (`research.md` D5 da 012).
 *
 * `podeMutarCarrinho` é **o mesmo** predicado de carrinho, cliente e identidade
 * da venda — o quarto consumidor confirma que ele é o ponto único de verdade
 * sobre "quando a venda pode ser mutada" (AD-043). O slice de vendedor não
 * importa nenhum dos outros: só recebe esta porta.
 */
export function vendedorDepsPadrao(depsCarrinho: CarrinhoDeps): VendedorDeps {
  return {
    podeMutarCarrinho: depsCarrinho.podeMutarCarrinho,
    ...(depsCarrinho.avisar ? { avisar: depsCarrinho.avisar } : {}),
  };
}

/**
 * `ConfiguracoesTEF.TEFAtivo` e `ConfiguracoesPIX.UtilizaCentriumPAG` do
 * bootstrap (feature 002), lidos **no momento da chamada**.
 *
 * Leitura síncrona do `sessionStore` — e não da query de catálogo — porque o
 * roteamento de integração acontece dentro de `aplicarPagamento`, que não pode
 * esperar rede para decidir se aciona TEF/PIX. A query com `staleTime` de 30
 * min (`PAY-01`) continua sendo a origem do **catálogo** exibido; aqui só
 * interessam as duas flags, que a 002 já persistiu.
 *
 * Bootstrap ausente ou fora do contrato ⇒ **integração desligada**, não
 * habilitada por otimismo: assumir `true` faria o Checkout disparar uma cobrança
 * externa num ambiente que talvez nem tenha terminal, e o operador só
 * descobriria com o cliente na frente do caixa.
 */
function capacidadesDoBootstrap(): CapacidadesPagamento {
  const registro = useSessionStore.getState().registro;
  if (registro === null) {
    return { tefAtivo: false, pixAtivo: false };
  }

  const validado = sessaoPagamentoSchema.safeParse(registro.SessaoUsuario);
  if (!validado.success) {
    console.warn(
      'Bootstrap sem bloco de pagamento válido: TEF e PIX seguem desligados.',
      validado.error.message,
    );
    return { tefAtivo: false, pixAtivo: false };
  }

  return paraCapacidadesPagamento(validado.data);
}

/** Linhas ativas no formato que o rateio do desconto de capa consome (AD-098). */
function linhasRateaveisDoCarrinho(): readonly LinhaRateavel[] {
  return linhasAtivas(useVendaStore.getState().linhas).map((linha) => ({
    idLinha: linha.idLinha,
    totalLiquido: totalLinha(linha),
  }));
}

/**
 * Dependências do pagamento na composição real (T041,
 * `contracts/pagamento-domain-api.md` §2).
 *
 * Três portas ainda são **stubs**, e cada uma tem dono declarado. As assinaturas
 * já são as definitivas, desenhadas pelas features que as implementarão: ligar
 * as reais é substituir o corpo aqui, sem tocar no slice nem na UI — mesmo
 * padrão que a 004 e a 006 já usaram para as suas dependências futuras.
 *
 * `validarInsercao` e `invalidarVeredito` **deixaram de ser stub** com a feature
 * 014: apontam para as actions reais de `validacaoVendaSlice`, lidas do store
 * combinado a cada chamada — mesmo mecanismo de `podeMutarCarrinho`, e pelo
 * mesmo motivo (nenhum slice importa o outro).
 */
export const pagamentoDepsPadrao: PagamentoDeps = {
  subtotalCarrinho: () => totalVenda(useVendaStore.getState().linhas),
  linhasRateaveis: linhasRateaveisDoCarrinho,
  capacidades: capacidadesDoBootstrap,
  validarTicket: (codigo) => validarTicket(codigo),
  iniciarIntegracao: () => {
    /**
     * Continua no-op **de propósito**, e não por a 009 estar pendente.
     *
     * A feature 009 (PIX) já está implementada e liga a sua janela por outro
     * caminho: `ListaPagamentosAplicados` monta `ModalPix` a partir do próprio
     * `PagamentoAplicado` em `PENDENTE_INTEGRACAO` com `integracao ===
     * 'PIX_DINAMICO'` (ver `usePixPendente` naquele arquivo). Como a janela é
     * função do estado, chamar algo aqui criaria um **segundo** gatilho para o
     * mesmo desfecho — e dois disparos independentes divergiriam em silêncio,
     * que é exatamente o que a nota final de `specs/009-pagamento-pix/tasks.md`
     * proíbe.
     *
     * A porta permanece no contrato porque o veredito `TEF` (feature 010) ainda
     * não tem dono, e porque removê-la obrigaria o slice a conhecer quem executa
     * a integração (Constitution II).
     */
  },
  /**
   * Gate real da feature 014 (T009). O veredito completo é reduzido ao que esta
   * porta declara — `aceita` sim/não — porque é tudo que o slice de pagamento
   * precisa decidir (Interface Segregation).
   *
   * **Sem `motivo` no ramo de recusa, e isto é deliberado**: o slice de
   * validação já notificou o operador, uma notificação por mensagem, com o texto
   * íntegro do ERP (`FR-007`). Devolver um motivo aqui faria `aplicarNucleo`
   * emitir um segundo toast, resumindo numa frase o que o ERP explicou em
   * várias.
   */
  validarInsercao: async (candidata, origem) => {
    const veredito = await useVendaStore.getState().validarInsercao(candidata, origem);
    return veredito.resultado === 'ACEITA' ? { aceita: true } : { aceita: false };
  },
  invalidarVeredito: () => {
    useVendaStore.getState().invalidarVeredito();
  },
  validacaoDispensadaPorDocumento: () => {
    useVendaStore.getState().dispensarValidacaoPorDocumento();
  },
  avisar: (mensagem) => {
    notificar.aviso(mensagem);
  },
};

/**
 * Snapshot da venda para o retrato enviado ao gate (feature 014).
 *
 * Lê **o mesmo** que a finalização lê (`useFinalizarOuSuspenderVenda`), campo a
 * campo e com os mesmos fallbacks, porque a invariante I5 da 014 exige que o
 * retrato validado e o retrato emitido descrevam a mesma venda: um cliente ou
 * um vendedor resolvido de forma diferente aqui faria o ERP aprovar uma venda e
 * emitir outra, e a divergência só apareceria na nota.
 *
 * Falha alto sem bootstrap, como `tipoPrecoDoBootstrap`: a tela de venda só é
 * alcançável depois dele, então a ausência aqui é bug de composição — e validar
 * com `CadSerieNFCe` inventado consultaria o ERP sobre uma venda que não existe.
 */
function snapshotDaVendaCorrente(): SnapshotVenda {
  const registro = useSessionStore.getState().registro;
  if (registro === null) {
    throw new ErroSessaoSemConfiguracao();
  }

  const venda = useVendaStore.getState();
  const sessao = registro.SessaoUsuario;

  return {
    // Vai no corpo do retrato, não só no header do proxy — sem ele o ERP recusa
    // com "Empresa é obrigatório" antes de olhar qualquer outra regra (AD-188).
    empresa: registro.codigoEmpresa,
    linhas: venda.linhas,
    identidade: venda.identidadeVenda,
    cadSerieNFCe: sessao.CadSerieNFCe,
    // O cliente **da venda**, com o default do PDV só como fallback (AD-032) —
    // mesma regra da emissão.
    clienteCodigo: venda.clienteAtual?.codigoCliente ?? sessao.ClienteDefaultCodigo,
    // O vendedor **selecionado**, nunca o operador logado (`FR-010` da 012).
    vendedorCodigo: venda.vendedorAtual?.codigo ?? 0,
    condicaoPagamentoCodigo: venda.condicaoSelecionada?.codigo ?? 0,
    eventos: venda.eventos,
  };
}

/**
 * Dependências do gate de validação prévia na composição real (T008).
 *
 * Nenhuma é stub, ao contrário do padrão que as features 004 e 008 usaram para
 * consumir esta: a 014 é construída depois que todas as suas dependências já
 * existem — sessão (002), carrinho (003), pagamento (008), cliente (005),
 * vendedor (012) e auditoria (001).
 */
export const validacaoDepsPadrao: ValidacaoDeps = {
  snapshotVenda: snapshotDaVendaCorrente,
  pagamentosAplicados: () => useVendaStore.getState().pagamentos,
  // Vem de `montarPagamentosParaPayload`, e não de um rateio calculado aqui,
  // pelo mesmo motivo de `snapshotDaVendaCorrente`: é a função que a emissão
  // usa, e dois rateios independentes poderiam distribuir centavos diferentes
  // entre as mesmas linhas (I5).
  rateioDescontoCapa: () =>
    useVendaStore.getState().montarPagamentosParaPayload().rateioDescontoCapa,
  validar: (retrato) => enviarValidarNFCe(retrato),
  registrarEvento: (evento) => {
    useVendaStore.getState().registrarEventoAuditoria(evento);
  },
  notificar: (veredito) => {
    notificarVeredito(veredito, notificadorDeVeredito);
  },
};

export function criarVendaStore(
  depsCarrinho: CarrinhoDeps = carrinhoDepsPadrao,
  depsCliente: ClienteDeps = clienteDepsPadrao(depsCarrinho),
  depsIdentidade: IdentidadeVendaDeps = identidadeVendaDepsPadrao(depsCarrinho),
  depsPagamento: PagamentoDeps = pagamentoDepsPadrao,
  depsVendedor: VendedorDeps = vendedorDepsPadrao(depsCarrinho),
  depsValidacao: ValidacaoDeps = validacaoDepsPadrao,
) {
  return create<VendaState>()(
    immer((...args) => ({
      ...criarAuditoriaSlice(...args),
      ...criarCarrinhoSlice(depsCarrinho)(...args),
      ...criarIdentidadeVendaSlice(depsIdentidade)(...args),
      ...criarClienteSlice(depsCliente)(...args),
      ...criarPagamentoSlice(depsPagamento)(...args),
      ...criarValidacaoVendaSlice(depsValidacao)(...args),
      ...criarVendedorSlice(depsVendedor)(...args),
    })),
  );
}

export const useVendaStore = criarVendaStore();

/**
 * Abre uma sessão de venda: **único** ponto que toca `auditoria` e
 * `identidadeVenda` juntos (feature 004, `research.md` D1).
 *
 * Existir aqui, e não dentro de um dos dois slices, é o que garante a
 * invariante que D1 pede — o início de uma venda nunca zera um slice sem o
 * outro. Um slice que chamasse o outro precisaria conhecê-lo, acoplamento que
 * os slices existentes não têm entre si.
 *
 * Chamado ao abrir a tela de venda e depois de cada finalização/suspensão
 * bem-sucedida.
 *
 * **A importação de DAV (feature 006) não passa por aqui** (AD-137), embora
 * este TSDoc antecipasse que passaria: importar um documento acontece **no
 * meio** de uma venda, e `resetarAuditoria` apagaria o histórico do que o
 * operador já fez (contra `FR-009` da feature 001). A 006 grava só a identidade
 * — `definirIdentidadeVenda({ origem: 'DAV', numeroNota })` — e acrescenta
 * `DAV_IMPORTADO` à trilha existente. A feature 011 decidirá a sua por conta;
 * `abrirSessaoDeVenda` continua sendo o caminho de quem de fato **inicia** uma
 * sessão de venda do zero.
 *
 * As quatro ações que ela chama são as **não guardadas** por
 * `podeMutarCarrinho()` — `resetarAuditoria` (001), `iniciarIdentidadeVenda`
 * (004, AD-139), `inicializarClientePadrao` (005) e `inicializarVendedorPadrao`
 * (012) —, e é por isso que abrir a venda seguinte
 * continua funcionando no ponto em que ela é chamada: logo depois de
 * `FaturarNFCe` retornar sucesso, com o pagamento aprovado ainda em estado
 * (`useFinalizarOuSuspenderVenda.ts`). Trocar `iniciarIdentidadeVenda` pela
 * `definirIdentidadeVenda` guardada faria a abertura virar um no-op silencioso
 * assim que a feature 008 ligasse o predicado real.
 */
export function abrirSessaoDeVenda(origem: OrigemVenda, numeroNota = 0): void {
  const venda = useVendaStore.getState();
  venda.resetarAuditoria(origem);
  venda.iniciarIdentidadeVenda({ origem, numeroNota });

  // Pré-seleção do cliente default (feature 005, `FR-004`/AD-032): acontece
  // aqui, e não dentro de um slice, pelo mesmo motivo dos dois acima — é o
  // início da venda que precisa deixar auditoria, identidade e cliente
  // coerentes entre si, e nenhum slice conhece os outros. Sem registro de
  // bootstrap não há default a aplicar e o campo cliente nasce vazio
  // (`FR-005`), que é exatamente o estado inicial do slice.
  const registro = useSessionStore.getState().registro;
  if (registro !== null) {
    venda.inicializarClientePadrao(registro.SessaoUsuario);
    // Pré-seleção do vendedor default (feature 012, `FR-005`/AD-032): mesma
    // natureza da linha acima e o mesmo motivo para viver aqui. Sem registro de
    // bootstrap não há default a aplicar e o campo vendedor nasce vazio
    // (`FR-006`), que é o estado inicial do slice.
    venda.inicializarVendedorPadrao(registro.SessaoUsuario);
  }
}

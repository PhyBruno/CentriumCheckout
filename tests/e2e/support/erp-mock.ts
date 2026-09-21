import Fastify, { type FastifyInstance } from 'fastify';

/**
 * ERP mockado para os cenários do `quickstart.md`.
 *
 * Só existe em teste: reproduz `POST /oauth/access_token` e
 * `GET /ApiCentriumOAuth/*` no dialeto REAL confirmado ao vivo contra o ERP
 * em 2026-09-04 (AD-165) — não o shape "de livro" do YAML/`contracts/`, que
 * diverge em pontos importantes: a maioria dos endpoints de leitura devolve o
 * SDT flat na raiz (sem o envelope `Get<X>Output.<Campo>` que o YAML sugere e
 * sem `messages`). **O envelope não é propriedade de endpoint nenhum**: ele
 * aparece quando há `messages` a devolver junto, e some quando a coleção está
 * vazia — `GetDav`, `CarregarNFCe` e `FaturarNFCe` foram vistos nas duas formas
 * (2026-09-11; AD-165 achava que os dois primeiros sempre envelopavam, o que
 * valia só para as recusas que a amostra daquele dia continha). `PostCliente`
 * responde `{"messages":[…]}` inclusive no sucesso. Campos
 * `double`/muitos `int64` vêm como string JSON, não
 * número; `FormaIntegracaoCartao` vem `" "` (espaço), não `""`;
 * `GetStatusSistema` devolve `{"Status": 0}`, não o inteiro solto. Ver
 * memória do projeto `erp-real-oauth-latencia` para o levantamento completo.
 * Tem endpoints de controle (`/__mock/*`) para os testes configurarem falhas
 * e inspecionarem se o ERP chegou a ser chamado.
 *
 * Todos os valores são sintéticos.
 */
export interface ConfigMockErp {
  /** Status devolvido por `POST /oauth/access_token`. */
  statusToken: number;
  /** Status devolvido por `GET /ApiCentriumOAuth/GetSessao`. */
  statusGetSessao: number;
  /**
   * Quantas chamadas de negócio via `/api/erp/*` devem responder `401` antes de
   * voltarem a funcionar — simula token expirado (Cenário 5).
   */
  respostas401Pendentes: number;
  /** Valor de `SessaoUsuario.CadMaqCod` devolvido pelo bootstrap. */
  cadMaqCod: string;
  /**
   * Valor de `SessaoUsuario.TipoPreco`. O cenário de faixa de quantidade da
   * feature 003 precisa de `8`; os demais rodam com `1`.
   */
  tipoPreco: number;
  /** `SessaoUsuario.TipoImpressao` — `'E'` impressão direta, `'P'` PDF. */
  tipoImpressao: 'E' | 'P';
  /** Status devolvido por `POST /ApiCentriumOAuth/FaturarNFCe` (feature 004). */
  statusFaturarNFCe: number;
  /**
   * Veredito de `POST /ApiCentriumOAuth/ValidarNFCe` (feature 014).
   *
   * `'ACEITA'` por padrão, e não configurável por acidente: o gate roda em
   * **toda** inserção de pagamento, então qualquer outro default faria todo
   * cenário E2E das features 008/009/013 parar antes de aplicar a primeira
   * forma. Quem exercita a recusa muda isto explicitamente.
   *
   * `'ACEITA_COM_AVISO'` cobre a armadilha de AD-110 pelo lado feliz
   * (`EmpLimCre='A'`); `'RECUSADA_WARNING'` cobre o lado oposto — `Valido=false`
   * com `Type=Warning`, que bloqueia.
   */
  vereditoValidarNFCe: 'ACEITA' | 'ACEITA_COM_AVISO' | 'RECUSADA' | 'RECUSADA_WARNING';
  /** Status HTTP de `ValidarNFCe` — `500` exercita `INDISPONIVEL` (`FR-009`). */
  statusValidarNFCe: number;
  /**
   * Devolve `2xx` **sem** o bloco `NotaFiscal` e com a recusa em `messages[]` —
   * é como o ERP responde quando a chamada não chegou a virar documento. O
   * Checkout trata como falha de negócio e a venda continua no caixa
   * (`contracts/faturamento-api.md`).
   */
  faturarSemNotaFiscal: boolean;
  /**
   * Devolve `2xx` **com** o bloco `NotaFiscal` preenchido, `Autorizada = 'N'` e
   * `PDFImpressao`/`XMLImpressao` vazios — a NFCe rejeitada, já gravada do lado
   * do ERP (correção do usuário, 2026-09-10).
   *
   * Distinto de `faturarSemNotaFiscal` justamente pelo bloco: é ele que separa
   * "gravou e a SEFAZ recusou" (o caixa é liberado) de "não virou documento"
   * (a venda continua).
   */
  faturarNFCeRejeitada: boolean;
  /**
   * `SUSPENDER` **e** `FATURAR` gravam o rascunho e são recusados por uma
   * validação posterior (AD-235) — a forma de `PCheckout_FaturarNFCe` quando
   * `PNFCe_ValidaSaldoProdutos` recusa: envelope com o retrato ecoado,
   * `NumeroRascunho` já preenchido e `messages` com `Type: 1`. É o cenário em
   * que o Checkout adota o número para o reenvio.
   */
  faturarRecusaComRascunho: boolean;
  /**
   * `SUSPENDER`/`FATURAR` recusados por **cenário tributário** (AD-239): o ERP
   * responde com o envelope **zerado** (`NumeroRascunho: "0"`) e a razão em
   * `messages`, e ainda assim grava um rascunho vazio do outro lado. É o
   * desfecho em que o Checkout não tem o que corrigir: limpa o caixa e manda o
   * operador ao ERP.
   */
  faturarSemCenarioTributario: boolean;
  /**
   * `GetDav` recusa o documento — é como o ERP responde quando outro operador
   * já o faturou. O Checkout não tem lock nenhum (`FR-010`/AD-052): só reage
   * ao erro devolvido.
   */
  davJaFaturado: boolean;
  /**
   * `ConfiguracoesPIX.UtilizaCentriumPAG` (feature 009).
   *
   * **Ligado por padrão** desde 2026-09-04 (pedido do usuário): o `GetSessao`
   * sintético precisa expor PIX para que o fluxo da 009 seja testável à mão na
   * stack local, sem um `POST /__mock/config` antes de cada sessão.
   *
   * Não afeta as demais suítes: só a forma `Pix` roteia para `PIX_DINAMICO`
   * (`resolverIntegracao`), e nenhum outro cenário a aplica — os que quitam uma
   * venda usam dinheiro (`quitarVendaEmDinheiro`). Quem precisar do PIX
   * desligado — o cenário "forma indisponível" — manda `{"pixAtivo": false}`.
   */
  pixAtivo: boolean;
  /** `ConfiguracoesPIX.MinimoPix`, em **reais** (`double`), como o ERP devolve. */
  minimoPix: number;
  /**
   * Literais que `StatusPIX` devolve, um por consulta; o último se repete.
   *
   * **Vazio por padrão desde 2026-09-04** (pedido do usuário, item 4): sem
   * roteiro, o mock passa a decidir pelo **relógio** — devolve `'G'` até
   * `atrasoPagamentoPixMs` depois da geração e `'P'` a partir dali. É o que faz
   * a stack local se comportar como o mundo real, em que o cliente leva algum
   * tempo para abrir o app do banco; antes disto o `['G', 'P']` padrão marcava a
   * cobrança como paga no segundo tick, e o operador nunca via o estado de
   * espera.
   *
   * Um roteiro explícito continua tendo precedência e é o que os cenários
   * automatizados usam — `['G', 'R']` para recusa, `['G']` para uma cobrança que
   * nunca é paga —, porque teste não pode depender de relógio.
   */
  statusPixTransicoes: readonly string[];
  /**
   * Quanto tempo, em milissegundos, entre `GerarPIX` e o status virar pago
   * (`'P'`). Só vale quando `statusPixTransicoes` está vazio.
   */
  atrasoPagamentoPixMs: number;
  /**
   * `GetSessao` devolve `VendedorCodigo`/`VendedorNome` vazios — é a empresa que
   * nunca configurou vendedor default (`FR-006`/`VEND-07`, feature 012). A venda
   * nasce sem vendedor e exige seleção manual.
   */
  semVendedorDefault: boolean;
  /**
   * `SessaoUsuario.ClienteDefaultContato` (AD-237). Preenchido por padrão, como
   * no preview; `''` reproduz o cliente default sem celular cadastrado.
   */
  clienteDefaultContato: string;
  /**
   * `SessaoUsuario.UsuarioTipoCodigoProduto` — o campo que a empresa configura
   * e que decide, além do filtro de `GetProduto`, o rótulo da barra de entrada
   * (`rotuloTipoCodigoProduto`). Configurável porque `''` e `'R'` produzem o
   * **mesmo** rótulo: sem poder variar o valor, um teste de rótulo só
   * confirmaria o default e passaria mesmo que a leitura do campo tivesse
   * sido removida do componente.
   */
  tipoCodigoProduto: string;
  /**
   * `SessaoUsuario.FaturaProdutoSemSaldo` (AD-236): `'A'` avisa, `'B'` bloqueia
   * quantidade acima do saldo, `''` não valida.
   *
   * **`''` por padrão**, embora o tenant de preview use `'B'`: com a política
   * ligada, toda reinserção reconsulta o saldo, e as suítes que contam chamadas
   * a `GetProduto` (`CART-03`) mediriam outra coisa. Quem exercita a regra liga.
   */
  faturaProdutoSemSaldo: 'A' | 'B' | '';
  /**
   * `GetCliente` devolve o **SDT parcial** que o ERP devolvia até o contrato de
   * 2026-09-14: só `CodCliente`, `PermiteVendaCredito` e `ListaPreco`
   * preenchidos (medido em 2026-09-11). O ERP de 2026-09-14 devolve o cadastro
   * completo (AD-237), que é o **padrão** deste mock.
   *
   * **Desligado por padrão**; fica como regressão do caminho de recusa
   * (`ErroClienteIncompleto`, AD-204).
   */
  getClienteSemCadastro: boolean;
}

export interface ContadoresMockErp {
  token: number;
  getSessao: number;
  negocio: number;
  getProduto: number;
  getListaProdutos: number;
  faturarNFCe: number;
  /** Consultas ao gate da feature 014 — uma por inserção de pagamento (I2a). */
  validarNFCe: number;
  getStatusSistema: number;
  getCliente: number;
  getListaClientes: number;
  postCliente: number;
  getListaVendedores: number;
  listaDavs: number;
  getDav: number;
  gerarPix: number;
  statusPix: number;
}

const CONFIG_PADRAO: ConfigMockErp = {
  statusToken: 200,
  statusGetSessao: 200,
  respostas401Pendentes: 0,
  cadMaqCod: 'PDV01',
  tipoPreco: 1,
  tipoImpressao: 'E',
  statusFaturarNFCe: 200,
  vereditoValidarNFCe: 'ACEITA',
  statusValidarNFCe: 200,
  faturarSemNotaFiscal: false,
  faturarNFCeRejeitada: false,
  faturarRecusaComRascunho: false,
  faturarSemCenarioTributario: false,
  davJaFaturado: false,
  getClienteSemCadastro: false,
  pixAtivo: true,
  /**
   * R$ 5,00 — piso realista e **abaixo** do total de qualquer cenário que
   * aplique PIX, de modo que o valor mínimo nunca bloqueia por acidente. Quem
   * quiser exercitar o bloqueio (`FR-009`) sobe este número acima do total da
   * venda em vez de montar um carrinho menor.
   */
  minimoPix: 5,
  statusPixTransicoes: [],
  /** 20 segundos — o número que o usuário pediu para o teste manual (item 4). */
  atrasoPagamentoPixMs: 20_000,
  semVendedorDefault: false,
  clienteDefaultContato: '(99)99999-9999',
  tipoCodigoProduto: 'R',
  faturaProdutoSemSaldo: '',
};

/**
 * Textos do gate da 014, exportados para o E2E afirmar que a notificação mostra
 * o `Description` do ERP **íntegro** (`FR-007`, I11) — comparar com uma string
 * repetida no spec deixaria o teste passar mesmo se o Checkout reescrevesse a
 * frase.
 */
export const MENSAGEM_RECUSA_CREDITO_BLOQUEADO =
  'Cliente está com crédito bloqueado, não será possivel realizar venda a prazo!';
export const MENSAGEM_AVISO_LIMITE_CREDITO =
  'Cliente ultrapassou o limite de crédito; venda liberada por configuração da empresa.';
/** Texto real do ERP quando o retrato chega sem `Empresa` no corpo (AD-188). */
export const MENSAGEM_EMPRESA_OBRIGATORIA = 'Empresa é obrigatório';

const CONTADORES_ZERADOS: ContadoresMockErp = {
  token: 0,
  getSessao: 0,
  negocio: 0,
  getProduto: 0,
  getListaProdutos: 0,
  faturarNFCe: 0,
  validarNFCe: 0,
  getStatusSistema: 0,
  getCliente: 0,
  getListaClientes: 0,
  postCliente: 0,
  getListaVendedores: 0,
  listaDavs: 0,
  getDav: 0,
  gerarPix: 0,
  statusPix: 0,
};

/**
 * Tickets de devolução sintéticos, um por desfecho de `PValidaTicketNFCe`.
 * `ValorTicket` em reais, como o ERP devolve (`double`).
 */
const TICKETS_DEVOLUCAO: Record<
  string,
  { ValorTicket: number; Valido: boolean; Mensagem: string }
> = {
  /**
   * Ticket de mesa para uso manual: cobre exatamente o produto `001234` (10,00),
   * então digitar `VALE10` na janela de vale devolução fecha uma venda de um item
   * só, sem excedente e sem troco. É o caminho mais curto para ver a forma de
   * vale funcionando de ponta a ponta na stack local.
   *
   * Os `TCK-*` abaixo continuam existindo para os cenários automatizados, que
   * precisam de valores que **não** casam com o saldo — é assim que exercitam a
   * confirmação de excedente (`FR-026`).
   */
  VALE10: { ValorTicket: 10.0, Valido: true, Mensagem: 'Ticket Válido' },
  'TCK-VALIDO': { ValorTicket: 25.5, Valido: true, Mensagem: 'Ticket Válido' },
  /** Cabe numa venda pequena sem estourar o saldo — exercita `FR-024` pelo outro lado. */
  'TCK-PEQUENO': { ValorTicket: 5.0, Valido: true, Mensagem: 'Ticket Válido' },
  'TCK-USADO': {
    ValorTicket: 0,
    Valido: false,
    Mensagem: 'Ticket de devolução já foi utilizado no documento : 90210/1',
  },
  'TCK-VENCIDO': {
    ValorTicket: 0,
    Valido: false,
    Mensagem: 'Ticket de devolução vencido em 01/08/2026',
  },
  'TCK-NAO-EMITIDO': { ValorTicket: 0, Valido: false, Mensagem: 'Ticket ainda não emitido !' },
};

/** Base64 sintético — não é um PDF real, só precisa ser string não-vazia. */
const PDF_SINTETICO = 'JVBERi0xLjQtc2ludGV0aWNv';

/**
 * "Copia e cola" e QR Code sintéticos do PIX (feature 009).
 *
 * O payload segue a **forma** de um BR Code (EMV) sem ser um: o Checkout não o
 * interpreta, só o decodifica de base64 e o exibe. O `Trnbase64image` não é um
 * JPEG válido — basta ser base64 para o navegador aceitar a `data:` URL.
 */
const COPIA_E_COLA_PIX =
  '00020126580014BR.GOV.BCB.PIX0136sintetico-0000-4000-8000-00000000520400005303986540565.505802BR5913CENTRIUM LTDA6009SAO PAULO62070503***6304AB12';
/**
 * PNG **de verdade**, 116×116, com padrão de QR sintético — três marcadores de
 * canto, linhas de temporização e trama determinística.
 *
 * Substituiu um `/9j/…` de 32 caracteres que não era imagem nenhuma (correção do
 * usuário, 2026-09-04, item 5). Aquele valor bastava para o E2E afirmar o
 * formato da `data:` URL, mas na stack local o operador via um ícone de imagem
 * quebrada e não tinha como distinguir "o mock é falso" de "a decodificação está
 * errada" — que era justamente o defeito sendo investigado.
 *
 * Não codifica nenhum payload: escanear não leva a lugar nenhum, e não deveria —
 * é um mock. O que ele prova é o caminho inteiro, do `Trnbase64image` até os
 * 200×200 na tela, com o tipo MIME detectado a partir dos bytes (`image/png`,
 * não o `image/jpeg` que a versão anterior do modal declarava para tudo).
 */
const QRCODE_PIX_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAHQAAAB0CAAAAABx8Un7AAABX0lEQVR42u3aMZbDMAgEUN//0k6TJg4wA9ZYLkZNiij8vLdEILzHUazzu6r3o33VZ+AyugQ9g3UNmiHXz0T7oj1G9ShKkCypMqyKa3QvmgXODoEoEY2+C2UOgmq/0X0oe+BnyYWKwa0qY7SNMo3X5HXcDRq9hZ5gdQ7yKoF+YhqVotnfFxVvVBSYC5hRLZoFRQ0YkyxlEhmVoEyxrQIxF+O/OEZlaJRAVZPW/Z2Hr0alKLuxU9jZZDSqRVFFQAdAp1k3qkcnw6tqiFFdjI3uQ5mg44cGRqUoKtjshYoB05u4UQmKijWbcFSDZ1SKrhhIMl9g+RTUKD1LQo1ZlVxoIGn0GZR5QMcMG1sNt9FHUOaQZh68UwNmo1J08iABNV7MYNKoFoXN8WRiggq5UTlaBaaGisQF2ug7UObwZy9SRt+Dogvx6J/bjMpRdijRHYyMirjR2yhzcE/wbqEwugT9AFWb2HnFIHy/AAAAAElFTkSuQmCC';
const XML_SINTETICO = '<NFe><infNFe>sintetico</infNFe></NFe>';

/**
 * Catálogo sintético da feature 003 — um produto por fluxo de
 * `ProdutoPesavelEditavel` (`research.md`, D7). Preços em reais, como o ERP
 * devolve.
 *
 * `PrecoVenda*`/`QtdMinimaPreco2..5` são `String(...)`: o ERP real devolve
 * `double`/`int64` como string JSON, não número — confirmado ao vivo em
 * 2026-09-04 (AD-165, `numeroErp`/`inteiroErp` em
 * `src/shared/schemas/erpJson.ts` já toleram as duas formas).
 */
const CATALOGO: Record<string, Record<string, unknown>> = {
  '001234': {
    CodigoProduto: '001234',
    Descricao: 'PRODUTO COM FAIXA 500G',
    Referencia: 'REF-FAIXA',
    CodigoBarras: '7890000000001',
    PrecoVenda: String(10.0),
    PrecoVenda1: String(10.0),
    PrecoVenda2: String(9.0),
    PrecoVenda3: String(0),
    PrecoVenda4: String(0),
    PrecoVenda5: String(0),
    QtdMinimaPreco2: String(5),
    QtdMinimaPreco3: String(0),
    QtdMinimaPreco4: String(0),
    QtdMinimaPreco5: String(0),
    UDM: 'UN',
    ProdutoPesavelEditavel: '',
  },
  '002000': {
    CodigoProduto: '002000',
    Descricao: 'PRODUTO PESAVEL KG',
    Referencia: 'REF-PESAVEL',
    CodigoBarras: '7890000000002',
    PrecoVenda: String(10.0),
    PrecoVenda1: String(10.0),
    PrecoVenda2: String(0),
    PrecoVenda3: String(0),
    PrecoVenda4: String(0),
    PrecoVenda5: String(0),
    QtdMinimaPreco2: String(0),
    QtdMinimaPreco3: String(0),
    QtdMinimaPreco4: String(0),
    QtdMinimaPreco5: String(0),
    UDM: 'KG',
    ProdutoPesavelEditavel: 'S',
  },
  '003000': {
    CodigoProduto: '003000',
    Descricao: 'PRODUTO EDITAVEL',
    Referencia: 'REF-EDITAVEL',
    CodigoBarras: '7890000000003',
    PrecoVenda: String(20.0),
    PrecoVenda1: String(20.0),
    PrecoVenda2: String(0),
    PrecoVenda3: String(0),
    PrecoVenda4: String(0),
    PrecoVenda5: String(0),
    QtdMinimaPreco2: String(0),
    QtdMinimaPreco3: String(0),
    QtdMinimaPreco4: String(0),
    QtdMinimaPreco5: String(0),
    UDM: 'UN',
    ProdutoPesavelEditavel: 'E',
  },
  /**
   * Os três itens do fluxo dourado da feature 008 — 70,00 + 29,00 + 1,00 = 100,00
   * (`pagamento-geral.spec.ts`).
   *
   * **Faltavam.** A 006 e a 008 editaram este arquivo em branches paralelas e o
   * merge das PRs #50/#51 preservou o catálogo de pagamento da 008 mas não os
   * produtos que os cenários dela bipam: os três testes de `pagamento-geral`
   * falhavam em `biparProduto` desde então, antes de qualquer coisa da 009.
   *
   * O código de cada um codifica o próprio preço (`070000` → 70,00) para que a
   * conta do cenário continue legível ao ler o teste. Preço redondo, sem faixa de
   * quantidade e sem edição: o que esses cenários exercitam é o pagamento, não a
   * precificação.
   */
  '070000': {
    CodigoProduto: '070000',
    Descricao: 'PRODUTO 70 REAIS',
    Referencia: 'REF-070',
    CodigoBarras: '7890000000070',
    PrecoVenda: String(70.0),
    PrecoVenda1: String(70.0),
    PrecoVenda2: String(0),
    PrecoVenda3: String(0),
    PrecoVenda4: String(0),
    PrecoVenda5: String(0),
    QtdMinimaPreco2: String(0),
    QtdMinimaPreco3: String(0),
    QtdMinimaPreco4: String(0),
    QtdMinimaPreco5: String(0),
    UDM: 'UN',
    ProdutoPesavelEditavel: '',
  },
  '029000': {
    CodigoProduto: '029000',
    Descricao: 'PRODUTO 29 REAIS',
    Referencia: 'REF-029',
    CodigoBarras: '7890000000029',
    PrecoVenda: String(29.0),
    PrecoVenda1: String(29.0),
    PrecoVenda2: String(0),
    PrecoVenda3: String(0),
    PrecoVenda4: String(0),
    PrecoVenda5: String(0),
    QtdMinimaPreco2: String(0),
    QtdMinimaPreco3: String(0),
    QtdMinimaPreco4: String(0),
    QtdMinimaPreco5: String(0),
    UDM: 'UN',
    ProdutoPesavelEditavel: '',
  },
  '001000': {
    CodigoProduto: '001000',
    Descricao: 'PRODUTO 1 REAL',
    Referencia: 'REF-001',
    CodigoBarras: '7890000000010',
    PrecoVenda: String(1.0),
    PrecoVenda1: String(1.0),
    PrecoVenda2: String(0),
    PrecoVenda3: String(0),
    PrecoVenda4: String(0),
    PrecoVenda5: String(0),
    QtdMinimaPreco2: String(0),
    QtdMinimaPreco3: String(0),
    QtdMinimaPreco4: String(0),
    QtdMinimaPreco5: String(0),
    UDM: 'UN',
    ProdutoPesavelEditavel: '',
  },
  /**
   * Código de barras de uma embalagem real (EAN-13 com dígito verificador
   * válido), para bipar com a câmera do celular no teste manual pela rede
   * (pedido do usuário, 2026-09-15). Descrição e preço são sintéticos: nenhum
   * E2E bipa este produto.
   */
  '004273': {
    CodigoProduto: '004273',
    Descricao: 'PRODUTO TESTE ANDROID',
    Referencia: 'REF-ANDROID',
    CodigoBarras: '7908222424273',
    PrecoVenda: String(15.0),
    PrecoVenda1: String(15.0),
    PrecoVenda2: String(0),
    PrecoVenda3: String(0),
    PrecoVenda4: String(0),
    PrecoVenda5: String(0),
    QtdMinimaPreco2: String(0),
    QtdMinimaPreco3: String(0),
    QtdMinimaPreco4: String(0),
    QtdMinimaPreco5: String(0),
    UDM: 'UN',
    ProdutoPesavelEditavel: '',
  },
  /**
   * Produtos da regra de saldo (AD-236): um **sem** saldo e um com saldo
   * **negativo**, como o ERP de preview devolve (`"-205.000"`). Os dois barram
   * já a primeira unidade em `'B'`.
   */
  '005000': {
    CodigoProduto: '005000',
    Descricao: 'PRODUTO SEM SALDO',
    Referencia: 'REF-SEM-SALDO',
    CodigoBarras: '7890000000050',
    PrecoVenda: String(5.0),
    PrecoVenda1: String(5.0),
    PrecoVenda2: String(0),
    PrecoVenda3: String(0),
    PrecoVenda4: String(0),
    PrecoVenda5: String(0),
    QtdMinimaPreco2: String(0),
    QtdMinimaPreco3: String(0),
    QtdMinimaPreco4: String(0),
    QtdMinimaPreco5: String(0),
    UDM: 'UN',
    ProdutoPesavelEditavel: '',
    Saldo: '0.000',
  },
  '006000': {
    CodigoProduto: '006000',
    Descricao: 'PRODUTO SALDO NEGATIVO',
    Referencia: 'REF-SALDO-NEG',
    CodigoBarras: '7890000000060',
    PrecoVenda: String(6.0),
    PrecoVenda1: String(6.0),
    PrecoVenda2: String(0),
    PrecoVenda3: String(0),
    PrecoVenda4: String(0),
    PrecoVenda5: String(0),
    QtdMinimaPreco2: String(0),
    QtdMinimaPreco3: String(0),
    QtdMinimaPreco4: String(0),
    QtdMinimaPreco5: String(0),
    UDM: 'UN',
    ProdutoPesavelEditavel: '',
    Saldo: '-205.000',
  },
};

/**
 * Cadastro sintético de clientes da feature 005. `CLIENTE CONVENIADO` tem
 * convênio e lista de preço próprios — é o que deixa o E2E provar que trocar o
 * cliente reprecifica o carrinho. `NILMAQ` é pessoa jurídica: existe para
 * provar que o CNPJ é recusado **mesmo tendo cadastro** no ERP — pelo campo,
 * pela busca e ao ser escolhido pelo nome (Ajuste SINIEF 11/2025).
 *
 * `PostCliente` grava aqui, para a busca seguinte por documento encontrar o
 * cliente recém-criado — o ERP real não devolve o registro criado
 * (`contracts/erp-cliente-api.md`).
 */
/**
 * Vendedores sintéticos de `GetListaVendedores` (feature 012).
 *
 * **Nenhum campo de status/`Ativo` e nenhum campo de função/cargo**, como o
 * contrato real: `CheckoutListaVendedores.Vendedores_Vendedores` tem só estes
 * quatro campos (AD-103). O mock não pode oferecer o que o ERP não devolve.
 *
 * `21` é o `VendedorCodigo` default do `GetSessao` sintético — deliberadamente
 * **diferente** do `UsuarioCodigo` (42) do operador, para que "o vendedor da
 * venda não é o operador logado" (`FR-008`/`SC-001`) seja distinguível no
 * payload de `FaturarNFCe`. Os demais existem para a busca ter mais de um
 * candidato e para a sequência seleção → troca do Cenário 2 do `quickstart.md`.
 */
const VENDEDORES: readonly Record<string, unknown>[] = [
  {
    // `VendedorCodigo` vem **número** nativo, ao contrário do `ClienteCodigo`
    // de `GetListaClientes`, que vem string — os dois são `int64` no YAML e o
    // ERP serializa cada um de um jeito (medido ao vivo 2026-09-11).
    VendedorCodigo: 21,
    VendedorNome: 'Mariana Alves',
    VendedorCGC: '000.111.222-33',
    // Formato real: `(DD)9999-9999`, e um cadastro pode trazer dois números
    // separados por `/` no mesmo campo.
    VendedorFone: '(47)99900-0021',
  },
  {
    VendedorCodigo: 14,
    VendedorNome: 'Marcos Pereira',
    VendedorCGC: '111.222.333-44',
    VendedorFone: '(47)3274-4301/4302',
  },
  {
    VendedorCodigo: 8,
    VendedorNome: 'Marta Souza',
    // Um cadastro sem documento e sem telefone: o ERP devolve os dois vazios.
    VendedorCGC: '',
    VendedorFone: '',
  },
];

const CLIENTES: Record<string, Record<string, unknown>> = {
  '12298023980': {
    Empresa: String(1), // int64
    CodCliente: String(1255), // int64
    nome: 'CLIENTE VAREJO',
    cpf: '12298023980',
    email: 'varejo@example.test',
    // Formato que o ERP devolve de fato: `(DD)99999-9999`, sem código de país
    // e sem espaço depois do DDD (medido ao vivo 2026-09-11 em toda a lista de
    // clientes do tenant). Um cadastro pode vir só em dígitos — é o que o
    // `CLIENTE SEM DOCUMENTO` abaixo reproduz.
    celular: '(47)99988-2100',
    cep: '89000000',
    endereco: 'Rua Exemplo',
    bairro: 'Centro',
    numero: '100',
    cidade: 'AGUA DOCE',
    uf: 'SC',
    CodigoConvenio: 0, // int32
    NomeConvenio: '',
    DescontoConvenio: String(0), // double
    ListaPreco: String(3), // int64
    CliTip: 'F',
  },
  '89554068000': {
    Empresa: String(1), // int64
    CodCliente: String(2538), // int64
    nome: 'CLIENTE CONVENIADO',
    cpf: '89554068000',
    email: 'conveniado@example.test',
    celular: '(47)92238-6700',
    cep: '78550000',
    endereco: 'Avenida Exemplo',
    bairro: 'Jardim',
    numero: '200',
    cidade: 'SINOP',
    uf: 'MT',
    CodigoConvenio: 7, // int32
    NomeConvenio: 'CONVENIO EXEMPLO',
    DescontoConvenio: String(10), // double
    ListaPreco: String(7), // int64
    CliTip: 'F',
  },
  'CONSUMIDOR-FINAL': {
    Empresa: String(1), // int64
    CodCliente: String(1), // int64
    nome: 'CONSUMIDOR FINAL',
    cpf: '',
    email: '',
    celular: '',
    cep: '',
    endereco: '',
    bairro: '',
    numero: '',
    cidade: '',
    uf: '',
    CodigoConvenio: 0, // int32
    NomeConvenio: '',
    DescontoConvenio: String(0), // double
    ListaPreco: String(3), // int64
    CliTip: 'F',
  },
  'SEM-DOCUMENTO': {
    Empresa: String(1), // int64
    CodCliente: String(3100), // int64
    nome: 'CLIENTE SEM DOCUMENTO',
    cpf: '',
    email: '',
    // Só dígitos, sem máscara: as duas formas convivem no mesmo tenant real.
    celular: '47900003100',
    cep: '89000000',
    endereco: 'Rua Sem Documento',
    bairro: 'Centro',
    numero: '10',
    cidade: 'JOINVILLE',
    uf: 'SC',
    CodigoConvenio: 0, // int32
    NomeConvenio: '',
    DescontoConvenio: String(0), // double
    ListaPreco: String(3), // int64
    CliTip: 'F',
  },
  '52059715000113': {
    Empresa: String(1), // int64
    CodCliente: String(2209), // int64
    nome: 'NILMAQ COMERCIO DE PECAS',
    CliTip: 'J',
    cpf: '52059715000113',
    email: 'nilmaq@example.test',
    celular: '(14)9119-8027',
    cep: '83300000',
    endereco: 'Rodovia Exemplo',
    bairro: 'Distrito',
    numero: '300',
    cidade: 'PIRAQUARA',
    uf: 'PR',
    CodigoConvenio: 0, // int32
    NomeConvenio: '',
    DescontoConvenio: String(0), // double
    ListaPreco: String(3), // int64
  },
};

/**
 * DAVs prontos para faturamento (feature 006).
 *
 * O documento devolvido por `GetDav` tem **o mesmo shape** de `CarregarNFCe`/
 * `FaturarNFCe` (AD-057) e **não** traz `DavNum` (AD-107) nem descrição de
 * produto (AD-096) nem nome de vendedor (AD-095) — as três ausências são o
 * contrato real, não simplificação do mock.
 *
 * O preço de `001234` no documento é 7,77, deliberadamente diferente do 10,00
 * do `CATALOGO`: é o que deixa o E2E provar que a linha importada entra
 * congelada, com o preço do documento e não com o de catálogo (`FR-006`).
 */
/**
 * `YYYY-MM-DD` de hoje deslocado em dias.
 *
 * As emissões dos DAVs sintéticos são **relativas**, e não datas fixas de 2026:
 * a janela de importação abre com o período padrão dos últimos 7 dias (pedido
 * do usuário, 2026-09-03), e um documento com data fixa sairia da lista assim
 * que o calendário passasse dela — a suíte quebraria sozinha com o tempo.
 */
export function emissaoRelativa(dias: number): string {
  const hoje = new Date();
  const data = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + dias);
  const doisDigitos = (valor: number): string => String(valor).padStart(2, '0');
  return `${String(data.getFullYear())}-${doisDigitos(data.getMonth() + 1)}-${doisDigitos(data.getDate())}`;
}

/** Emissão de cada DAV sintético, em dias antes de hoje. */
export const DIAS_DE_EMISSAO = { conveniado: -1, varejo: -4 } as const;

const DAVS: Record<string, { lista: Record<string, unknown>; documento: Record<string, unknown> }> =
  {
    '004821': {
      lista: {
        NumeroDAV: '004821',
        Titulo: 'PV-11842',
        Senha: '',
        DataEmissao: emissaoRelativa(DIAS_DE_EMISSAO.conveniado),
        // `ClienteCodigo`/`VendedorCodigo` são `int64` no YAML mas vêm como
        // número NATIVO em `ListaDAVs` (confirmado ao vivo 2026-09-04) — ao
        // contrário de `ValorTotal` (`double`), que vem string. O padrão
        // "int64/double sempre string" não é universal; aqui é por campo.
        ClienteCodigo: 2538,
        ClienteNome: 'CLIENTE CONVENIADO',
        VendedorCodigo: 12,
        // AD-172: `VendedorNome` acrescentado ao SDT `CheckoutListaDAVs`.
        VendedorNome: 'MARIANA ALVES',
        ValorTotal: String(15.54), // double
      },
      documento: {
        Empresa: 1,
        SuspenderOuFaturar: '',
        // Confirmado ao vivo 2026-09-04 num `FaturarNFCe` real: estes quatro
        // (int64) vêm string; `Empresa`/`DescontoPercentual` abaixo, mesmo
        // sendo int64/double no YAML, vieram número nativo no mesmo payload —
        // provável eco do que foi enviado, não recalculo do ERP.
        clienteCodigo: String(2538),
        // Contrato de 2026-09-14 (AD-235): nome do cliente no primeiro nível.
        ClienteNome: 'CLIENTE CONVENIADO',
        vendedorCodigo: String(12),
        // AD-172: mesmo SDT de `GetDav` e `CarregarNFCe`, logo vale para as
        // duas importações.
        vendedorNome: 'MARIANA ALVES',
        CondicaoPagamentoCodigo: String(1),
        // `NumeroRascunho` (era `NumeroNota`), string como no preview (AD-235).
        NumeroRascunho: String(90210),
        CadSerieNFCe: '1',
        UsuarioCodigo: String(42),
        Log: '',
        produtos: [
          {
            sequencial: 1,
            codigoProduto: '001234',
            quantidade: String(2), // double
            precoUnitario: String(7.77), // double
            DescontoPercentual: 0,
            DescontoValor: String(0), // double
            UDM: 'UN',
            ValorBruto: String(15.54), // double
            ValorTotal: String(15.54), // double
          },
        ],
        /**
         * **Sem forma de pagamento** — um DAV é um documento pendente de
         * cobrança, e é o operador quem escolhe como recebê-lo no Checkout.
         *
         * Antes havia aqui uma forma com `FormaMeioPagtoNFe: '01'`. Ela foi
         * removida por ser descartada como "meio desconhecido" — diagnóstico
         * que **estava errado**: `'01'` é exatamente o que o ERP publica
         * (AD-204), e quem não o reconhecia era o Checkout. A forma nunca chegou
         * à venda em nenhum momento da história desta suíte, mas por defeito
         * nosso, não por defeito da fixture.
         *
         * A remoção **fica**, agora pelo motivo que já era o bom: um DAV é um
         * documento pendente de cobrança, e quem escolhe como recebê-lo é o
         * operador. Restaurá-la teria efeito colateral: um pagamento
         * importado entra `APROVADO`, e pagamento aprovado **congela a venda**
         * (I7) — o que contradiz os dois cenários que este DAV existe para
         * exercitar, "item novo é precificado normalmente" e "segundo documento
         * é recusado por já ter documento" (que passaria a ser recusado por já
         * ter pagamento). Remover a forma diz a verdade sobre o documento e
         * preserva o que cada cenário mede; a importação de formas continua
         * coberta por `mapearVendaExistente.spec.ts` e pelo `pagamentoSlice`.
         *
         * Quem finaliza uma venda importada quita antes pela UI
         * (`quitarVendaEmDinheiro`), como todo E2E desde a feature 008.
         */
        FormasDePagamento: [],
      },
    },
    '004790': {
      lista: {
        NumeroDAV: '004790',
        Titulo: 'ORC-00915',
        Senha: '',
        DataEmissao: emissaoRelativa(DIAS_DE_EMISSAO.varejo),
        ClienteCodigo: 1255,
        ClienteNome: 'CLIENTE VAREJO',
        VendedorCodigo: 8,
        VendedorNome: 'BRUNO SANTOS',
        ValorTotal: String(20.0), // double
      },
      documento: {
        Empresa: 1,
        SuspenderOuFaturar: '',
        clienteCodigo: String(1255),
        ClienteNome: 'CLIENTE VAREJO',
        vendedorCodigo: String(8),
        vendedorNome: 'BRUNO SANTOS',
        CondicaoPagamentoCodigo: String(1),
        NumeroRascunho: String(90211),
        CadSerieNFCe: '1',
        UsuarioCodigo: String(42),
        Log: '',
        produtos: [
          {
            sequencial: 1,
            codigoProduto: '003000',
            quantidade: String(1), // double
            precoUnitario: String(20.0), // double
            DescontoPercentual: 0,
            DescontoValor: String(0), // double
            UDM: 'UN',
            ValorBruto: String(20.0), // double
            ValorTotal: String(20.0), // double
          },
        ],
        FormasDePagamento: [],
      },
    },
  };

/**
 * A forma que quitou o rascunho antes de ele ser suspenso (AD-169).
 *
 * Dinheiro pelo total exato do documento: é a quitação mais simples que existe,
 * e o que interessa ao E2E é que a venda volte **paga** — o meio em si não muda
 * nada no caminho de retomada.
 *
 * `FormaMeioPagtoNFe: '01'` — o **código** da NFe, como o ERP real publica
 * (AD-204). A redação anterior deste bloco afirmava o contrário ("nunca o código
 * numérico; o domínio usa nomes, AD-023") e **estava errada**: os
 * `ControlValues` de `NFCe_FormaPagto` são `Character(2)`, pares
 * `descrição:código`, e é o código que trafega. Enquanto o mock falou nomes, ele
 * concordou com um Checkout que também falava nomes, e a suíte inteira passou
 * verde contra um ERP imaginário — o item 42 de `PENDENCIES.md` outra vez.
 *
 * O valor é **derivado** do documento, não fixo: os dois rascunhos sintéticos
 * têm totais diferentes, e um literal aqui dessincronizaria do primeiro produto
 * que alguém ajustasse — deixando um saldo residual que o E2E leria como bug do
 * Checkout.
 */
function quitacaoDoRascunho(documento: Record<string, unknown>): Record<string, unknown> {
  const produtos = (documento['produtos'] ?? []) as readonly Record<string, unknown>[];
  const total = produtos.reduce((soma, produto) => soma + Number(produto['ValorTotal']), 0);

  return {
    FormaCodigo: String(1), // int64 — 'DINHEIRO' do catálogo de `GetSessao`
    FormaMeioPagtoNFe: '01',
    FormaValor: String(total), // double
    FormaIntegracaoCartao: ' ',
    FormaFpgUtiCar: '',
    FormaEntrada: 'S',
    TEFidentificacao: String(0), // int64 — item não-TEF
    TEFCNPJ: '',
    TEFBandeira: '',
    TEFNumeroAutorizacao: '',
    TEFTipoIntegracao: '',
    FormaPixGUID: '',
    TicketDevolucao: '',
  };
}

/**
 * Resposta de lista paginada no dialeto **real** do `ApiCentriumOAuth`,
 * reconferido endpoint a endpoint ao vivo em 2026-09-11 (`GetListaClientes`,
 * `GetListaVendedores`, `GetListaProdutos`, `ListaDAVs`, `GetListaNFCes`).
 *
 * Três regras que o mock não seguia, e cada uma esconde um caminho de produção:
 *
 * 1. **O array vem primeiro**, antes de `PaginaAtual`. Irrelevante para um
 *    `JSON.parse`, mas é o que o ERP emite — e manter a ordem mantém a
 *    comparação byte a byte com uma captura real possível.
 * 2. **Busca sem resultado OMITE a chave do array** — não devolve `[]`. Este é
 *    o achado que motivou a rodada: `checkoutListaClientesSchema` exige
 *    `Clientes` (e os irmãos exigem `Produtos`/`Vendedores`/`DAV`/`Rascunho`),
 *    então contra o ERP real **toda busca sem resultado reprovava na fronteira**
 *    e o operador via erro de resposta inválida em vez de "nenhum encontrado".
 *    Com `Clientes: []` no mock, nenhum E2E jamais passou por esse caminho.
 * 3. **`TotalPaginas` é `0`** quando não há registro — não `1`. O mock forçava
 *    `Math.max(1, …)` e nunca produzia o zero real.
 *
 * `PaginaAtual`/`RegistrosPorPagina`/`TotalRegistros`/`TotalPaginas` vêm como
 * número nativo (`int32`), ao contrário dos campos de negócio do item.
 */
/**
 * Recusa de `GetDav`/`CarregarNFCe`: **HTTP 200**, envelope com o SDT zerado e a
 * razão em `messages` (AD-239, medido no preview em 2026-09-16).
 *
 * O `NumeroRascunho: "0"` é o que separa recusa de documento na fronteira Zod —
 * o schema exige rascunho positivo.
 */
function recusaDeDocumento(descricao: string): Record<string, unknown> {
  return {
    OutCheckoutFaturarNFCe: {
      Empresa: 0,
      SuspenderOuFaturar: '',
      clienteCodigo: '0',
      ClienteNome: '',
      vendedorCodigo: '0',
      vendedorNome: '',
      CondicaoPagamentoCodigo: '0',
      NumeroRascunho: '0',
      CadSerieNFCe: '',
      UsuarioCodigo: '0',
      Log: '',
    },
    messages: [{ Id: '', Type: 1, Description: descricao }],
  };
}

function respostaPaginada(
  chaveDoArray: string,
  itens: readonly unknown[],
  query: { Pagina?: string; Tamanhopagina?: string },
): Record<string, unknown> {
  const registrosPorPagina = Math.max(1, Number(query.Tamanhopagina) || 20);
  const totalPaginas = Math.ceil(itens.length / registrosPorPagina);
  const paginaPedida = Math.max(1, Number(query.Pagina) || 1);
  const paginaAtual = Math.min(paginaPedida, Math.max(1, totalPaginas));
  const inicio = (paginaAtual - 1) * registrosPorPagina;
  const pagina = itens.slice(inicio, inicio + registrosPorPagina);

  return {
    // Chave do array primeiro, e **ausente** quando a página é vazia.
    ...(pagina.length > 0 ? { [chaveDoArray]: pagina } : {}),
    PaginaAtual: paginaAtual,
    RegistrosPorPagina: registrosPorPagina,
    TotalRegistros: itens.length,
    TotalPaginas: totalPaginas,
  };
}

/**
 * `SDTCheckout_GetProduto` completo, na ordem e nos tipos que `GetProduto`
 * devolve de fato (medido ao vivo 2026-09-11 em três produtos do tenant).
 *
 * Oito campos que as fixtures não declaravam e o ERP **sempre** manda:
 * `PrecoMinimo`, `Estoque`, `CodigoGrupo`/`DescricaoGrupo`,
 * `CodigoSubgrupo`/`DescricaoSubgrupo`, `Aplicacao` e `GTINTributavel`. Cada
 * fixture pode sobrescrever o que interessar ao seu cenário; o resto recebe o
 * default do catálogo de demonstração.
 *
 * Tipos observados: preço e `Estoque` (`double`) vêm **string** (`"1.0000"`,
 * `"-205.000"`), `CodigoGrupo`/`CodigoSubgrupo`/`QtdMinimaPreco2..5` vêm
 * **número** — o mock mandava `QtdMinimaPreco*` como string.
 */
function produtoComoOErpResponde(produto: Record<string, unknown>): Record<string, unknown> {
  return {
    CodigoProduto: produto['CodigoProduto'],
    Descricao: produto['Descricao'],
    Referencia: produto['Referencia'],
    CodigoBarras: produto['CodigoBarras'],
    PrecoVenda: produto['PrecoVenda'],
    PrecoVenda1: produto['PrecoVenda1'],
    PrecoVenda2: produto['PrecoVenda2'],
    PrecoVenda3: produto['PrecoVenda3'],
    PrecoVenda4: produto['PrecoVenda4'],
    PrecoVenda5: produto['PrecoVenda5'],
    PrecoMinimo: produto['PrecoMinimo'] ?? '0.0000',
    Estoque: produto['Estoque'] ?? '10.000',
    CodigoGrupo: produto['CodigoGrupo'] ?? 1, // int32 — número nativo
    DescricaoGrupo: produto['DescricaoGrupo'] ?? 'GRUPO 1',
    CodigoSubgrupo: produto['CodigoSubgrupo'] ?? 1, // int32
    DescricaoSubgrupo: produto['DescricaoSubgrupo'] ?? 'GERAL',
    Aplicacao: produto['Aplicacao'] ?? '',
    GTINTributavel: produto['GTINTributavel'] ?? '',
    QtdMinimaPreco2: Number(produto['QtdMinimaPreco2'] ?? 0),
    QtdMinimaPreco3: Number(produto['QtdMinimaPreco3'] ?? 0),
    QtdMinimaPreco4: Number(produto['QtdMinimaPreco4'] ?? 0),
    QtdMinimaPreco5: Number(produto['QtdMinimaPreco5'] ?? 0),
    UDM: produto['UDM'],
    ProdutoPesavelEditavel: produto['ProdutoPesavelEditavel'],
    // Contrato de 2026-09-14 (AD-236): `double` como string, pode ser negativo.
    // `10.000` por padrão, folgado para os cenários que não são sobre saldo.
    Saldo: produto['Saldo'] ?? '10.000',
  };
}

/** SDT de produto **inteiramente zerado** — a resposta de "não achei". */
const PRODUTO_INEXISTENTE: Record<string, unknown> = {
  CodigoProduto: '',
  Descricao: '',
  Referencia: '',
  CodigoBarras: '',
  PrecoVenda: '0.0000',
  PrecoVenda1: '0.0000',
  PrecoVenda2: '0.0000',
  PrecoVenda3: '0.0000',
  PrecoVenda4: '0.0000',
  PrecoVenda5: '0.0000',
  PrecoMinimo: '0.0000',
  Estoque: '0.000',
  CodigoGrupo: 0,
  DescricaoGrupo: '',
  CodigoSubgrupo: 0,
  DescricaoSubgrupo: '',
  Aplicacao: '',
  GTINTributavel: '',
  QtdMinimaPreco2: 0,
  QtdMinimaPreco3: 0,
  QtdMinimaPreco4: 0,
  QtdMinimaPreco5: 0,
  UDM: '',
  ProdutoPesavelEditavel: '',
  Saldo: '0.000',
};

/**
 * O item de `GetListaProdutos`: o produto **menos** `PrecoVenda`, `PrecoMinimo`
 * e `ProdutoPesavelEditavel`.
 *
 * A leitura anterior — "a lista não traz preço nenhum" (AD-091) — era mais
 * forte do que a realidade: a lista traz `PrecoVenda1..5`, `Estoque` e os
 * grupos; o que ela **não** traz são exatamente os três campos acima
 * (2026-09-11). A conclusão prática de AD-091 não muda (a linha do carrinho não
 * pode ser montada daqui, porque o preço aplicado e a pesagem/edição vêm nos
 * campos ausentes), mas o mock estava escondendo dez campos que o ERP publica.
 */
const CAMPOS_FORA_DA_LISTA = ['PrecoVenda', 'PrecoMinimo', 'ProdutoPesavelEditavel'];

function itemDaListaDeProdutos(produto: Record<string, unknown>): Record<string, unknown> {
  const completo = produtoComoOErpResponde(produto);
  const item = Object.fromEntries(
    Object.entries(completo).filter(([campo]) => !CAMPOS_FORA_DA_LISTA.includes(campo)),
  );
  return item;
}

/** Só os dígitos — como o ERP compara documento (`57627754968`). */
function digitos(valor: string): string {
  return valor.replace(/\D/g, '');
}

/**
 * CPF **com máscara**, do jeito que `GetListaClientes` devolve
 * (`"576.277.549-68"`, confirmado ao vivo 2026-09-11).
 *
 * O mock devolvia dígitos crus, e por isso nenhum teste jamais exercitou o
 * caminho em que o `CPF` do candidato escolhido no modal volta formatado e
 * precisa ser normalizado antes de ir em `GetCliente` — que é justamente onde o
 * ERP real recusa a máscara (ver o handler de `GetCliente`).
 */
function cpfComMascara(cpf: string): string {
  const cru = digitos(cpf);
  if (cru.length !== 11) {
    return cpf;
  }
  return `${cru.slice(0, 3)}.${cru.slice(3, 6)}.${cru.slice(6, 9)}-${cru.slice(9)}`;
}

/**
 * `ClienteCheckout` do jeito que `GetCliente` responde.
 *
 * **Contrato de 2026-09-14 (AD-237): cadastro completo** — nome, cpf, email,
 * celular, endereço e `ListaPreco`, por `CodCliente`, `Codcliente` ou `CPFCNPJ`
 * (medido no preview com o cliente 17). Documento inexistente continua
 * devolvendo `CodCliente: 0` com tudo vazio.
 *
 * Até essa versão o ERP preenchia só `CodCliente`, `PermiteVendaCredito` e
 * `ListaPreco` (medido em 2026-09-11, AD-216), e o Checkout recusava com
 * `ErroClienteIncompleto` (AD-204). Os **dois modos** ficam:
 *
 * - `getClienteSemCadastro: false` (**padrão**) — cadastro completo, o ERP de
 *   2026-09-14.
 * - `getClienteSemCadastro: true` — o SDT parcial do ERP anterior, como
 *   regressão do caminho de recusa.
 *
 * Os tipos são os reais nos dois modos, e não os do YAML: `Empresa`/
 * `CodCliente`/`CodigoConvenio`/`DescontoConvenio`/`ListaPreco` vêm **número**
 * nativo, e `LimiteCredito` (`double`) vem **string** `"0.00"` — dois `double`
 * no mesmo SDT com serialização diferente.
 */
function clienteComoOErpResponde(
  cliente: Record<string, unknown> | undefined,
  semCadastro: boolean,
): Record<string, unknown> {
  // Existe = o `For Each` achou o registro. O único sinal disso na resposta é
  // `CodCliente > 0`, e vale nos dois modos.
  const achou = cliente !== undefined;
  // No modo defeituoso, tudo o que não é `CodCliente`/`PermiteVendaCredito`/
  // `ListaPreco` vem vazio, exista o cliente ou não.
  const doCadastro = (campo: string): string =>
    achou && !semCadastro ? String(cliente[campo] ?? '') : '';

  return {
    Empresa: achou && !semCadastro ? Number(cliente['Empresa']) : 0,
    CodCliente: Number(cliente?.['CodCliente'] ?? 0),
    nome: doCadastro('nome'),
    // Dígitos crus: o formato do `cpf` **neste** endpoint não é observável (vem
    // sempre vazio no ERP de hoje), então fica como estava — inventar a máscara
    // de `GetListaClientes` aqui seria afirmar o que não foi medido.
    cpf: doCadastro('cpf'),
    email: doCadastro('email'),
    celular: doCadastro('celular'),
    cep: doCadastro('cep'),
    endereco: doCadastro('endereco'),
    bairro: doCadastro('bairro'),
    numero: doCadastro('numero'),
    cidade: doCadastro('cidade'),
    uf: doCadastro('uf'),
    LimiteCredito: '0.00', // double — string, ao contrário de `DescontoConvenio`
    PermiteVendaCredito: achou,
    CodigoConvenio: achou && !semCadastro ? Number(cliente['CodigoConvenio']) : 0, // int32
    NomeConvenio: doCadastro('NomeConvenio'),
    // double — **número**, ao contrário de `LimiteCredito`, que vem string.
    DescontoConvenio: achou && !semCadastro ? Number(cliente['DescontoConvenio']) : 0,
    ListaPreco: achou ? Number(cliente['ListaPreco']) : 0,
  };
}

/**
 * `SessaoUsuario` zerado — a resposta de `GetSessao` sem o cabeçalho `Empresa`.
 *
 * São 21 campos, exatamente estes: os três blocos ricos
 * (`CondicoesDePagamento`, `ConfiguracoesTEF`, `ConfiguracoesPIX`) **não
 * aparecem** nesse caminho (medido ao vivo 2026-09-11).
 */
const SESSAO_ZERADA: Record<string, unknown> = {
  UsuarioCodigo: String(0),
  UsuarioNome: '',
  caixa: String(0),
  EmpresaRazaoSocial: '',
  EmpresaNomeFantasia: '',
  VendedorCodigo: String(0),
  VendedorNome: '',
  ClienteDefaultCodigo: String(0),
  ClienteDefaultNome: '',
  ClienteDefaultContato: '',
  UsuarioTipoCodigoProduto: '',
  Cliente_UtilizaSegundoNivelDeEnderecos: '',
  CadMaqCod: '',
  CadMaqHost: '',
  CadSerieNFCe: '',
  QtdMinCharParaConsulta: String(0),
  TipoPreco: 0,
  ListaPrecoDefault: 0,
  TipoImpressao: '',
  CenarioPagamento: '',
  ImagemLogoBase64: '',
  ImagemDisplaySecundarioBase64: '',
};

/** Texto real do ERP quando falta o cabeçalho `Empresa` (2026-09-11). */
export const MENSAGEM_CABECALHO_EMPRESA_OBRIGATORIO = 'Cabeçalho de Empresa é obrigatório';

/**
 * `GetCliente`/`GetSessao` exigem `Empresa` **no cabeçalho** da requisição, não
 * na query (AD-205), e quando ele falta a resposta muda de forma: volta **com o
 * envelope** do YAML (`Cliente`/`SessaoUsuario`) mais `messages`, com o SDT
 * zerado — confirmado ao vivo 2026-09-11. É o inverso do caso de sucesso, que
 * vem flat e sem `messages`.
 *
 * As listas (`GetListaClientes`, `GetListaVendedores`) também dependem do
 * cabeçalho, mas falham **em silêncio**: `200`, `TotalRegistros: 0` e nenhuma
 * `messages` — não há como distinguir "nada encontrado" de "cabeçalho ausente".
 */
function semCabecalhoEmpresa(headers: Record<string, unknown>): boolean {
  return String(headers['empresa'] ?? '').trim() === '';
}

function envelopeCabecalhoObrigatorio(chave: string, sdtZerado: unknown): Record<string, unknown> {
  return {
    [chave]: sdtZerado,
    messages: [{ Id: '9999', Type: 0, Description: MENSAGEM_CABECALHO_EMPRESA_OBRIGATORIO }],
  };
}

/**
 * `GetSessao` real devolve `SessaoUsuario` **direto na raiz**, sem envelope
 * nem `messages` — confirmado ao vivo em 2026-09-04 contra o ERP real
 * (`c0lj6mvzeh.apps.centrium.inf.br`): a procedure só tem um output de
 * verdade, então o GeneXus não embrulha (ver `erp-real-oauth-latencia` na
 * memória do projeto). `int64`/`double` do YAML vêm como **string**; só
 * `int32` fica número nativo — por isso os campos abaixo marcados `int64`
 * são `String(...)`.
 */
function payloadGetSessao(config: ConfigMockErp): unknown {
  return {
    UsuarioCodigo: String(42), // int64
    UsuarioNome: 'Operador de Teste',
    // Identidade exibida na barra superior — sintética, como o resto do mock.
    EmpresaNomeFantasia: 'Organizações Tabajara',
    EmpresaRazaoSocial: 'Tabajara Comércio Ltda',
    caixa: String(3), // int64
    TipoPreco: config.tipoPreco, // int32 — número nativo
    CadMaqCod: config.cadMaqCod,
    /**
     * Campo que o mock não declarava e o `GetSessao` real **sempre** devolve
     * (2026-09-11): `'S'` quando o tenant guarda endereço em registro separado,
     * vazio quando guarda no próprio cliente. Vazio aqui, como no tenant medido.
     */
    Cliente_UtilizaSegundoNivelDeEnderecos: '',
    // `int32` — número nativo. O mock mandava string, misturando-o com os
    // `int64` da mesma resposta (`ClienteDefaultCodigo`, `caixa`), que de fato
    // vêm string. Medido ao vivo: `"TipoPreco":5,"ListaPrecoDefault":1`.
    ListaPrecoDefault: 3,
    /**
     * Catálogo de cenários de venda rápida (feature 013, AD-104): array JSON de
     * strings com sete campos posicionais separados por `;`, exatamente como
     * `PCheckout_GetSessao` monta.
     *
     * A lista reproduz a fixture de `specs/013-.../quickstart.md` sobre o
     * catálogo deste mock, e é ela que torna C1/C3 exercitáveis de ponta a
     * ponta:
     *
     * 1. **F6** — dinheiro à vista (forma 1), `encerraOperacao` ligado: é o
     *    fluxo dourado, um toque lança e finaliza.
     * 2. **`f7 `** — débito à vista (forma 5), sem encerramento e com a tecla
     *    **mal formatada** de propósito: só vira `F7` se E3 normalizar.
     * 3. um item com `;` extra no nome (8 campos) — precisa **sumir** sem levar
     *    junto os válidos (AD-105, I3);
     * 4. um cenário **sem tecla**, que o ERP devolve porque a consulta não
     *    filtra por `CPgTeclaAtalho` preenchido.
     *
     * Os dois últimos não podem virar atalho: é o que o E2E de recusa afirma.
     */
    CenarioPagamento: JSON.stringify([
      '1;DINHEIRO;1;A VISTA;Dinheiro à vista;True;F6',
      '5;CARTAO DEBITO;1;A VISTA;Débito à vista;False;f7 ',
      '9;VALE;1;A VISTA;Vale;Ops; promo;True;F8',
      '2;CARTAO CREDITO;1;A VISTA;Crédito à vista;False;',
    ]),
    QtdMinCharParaConsulta: String(3), // int64
    /**
     * Os valores que o ERP publica neste campo são `'R'`/`''` (código
     * reduzido), `'B'` (código de barras) e `'M'` (referência) — os mesmos três
     * que `GetProduto` sabe filtrar em `Tipocodproduto` (AD-204/AD-205); um
     * tenant real devolve `'B'`.
     *
     * **`'D'`, que estava aqui, não existe.** Com ele o `For Each` do ERP não
     * filtra por campo nenhum e a resposta é o primeiro produto da empresa
     * (reproduzido ao vivo em 2026-09-11 com `Tipocodproduto=D`), além de o
     * rótulo da barra cair no genérico "Código do produto". `'R'` é o cenário
     * padrão da suíte porque é o código que os E2E digitam; `'B'` e `'M'` são
     * igualmente válidos e agora o `GetProduto` deste mock filtra pelos três.
     */
    UsuarioTipoCodigoProduto: config.tipoCodigoProduto,
    // `EmpSldPro` da empresa (AD-236) — `char`, vem string.
    FaturaProdutoSemSaldo: config.faturaProdutoSemSaldo,
    ClienteDefaultCodigo: String(1), // int64
    ClienteDefaultNome: 'CONSUMIDOR FINAL',
    // `CliFonCel` do cliente default (contrato de 2026-09-14, AD-237).
    ClienteDefaultContato: config.clienteDefaultContato,
    // `21`, e não o `42` do `UsuarioCodigo`: vendedor da venda e operador
    // logado são campos genuinamente distintos (AD-056), e valores iguais aqui
    // tornariam `FR-008`/`SC-001` indistinguível no payload de `FaturarNFCe`.
    // `semVendedorDefault` reproduz a empresa que nunca configurou vendedor —
    // `int64` não anulável, então o "vazio" do contrato é `0` (`FR-006`).
    VendedorCodigo: config.semVendedorDefault ? String(0) : String(21), // int64
    VendedorNome: config.semVendedorDefault ? '' : 'Mariana Alves',
    CadSerieNFCe: '1',
    // Aponta para o próprio mock do ERP em E2E: o serviço de impressão local
    // real depende da rede do PDV, fora do alcance do CI
    // (`specs/004-.../contracts/impressao-local-api.md`).
    CadMaqHost: '127.0.0.1:4545',
    TipoImpressao: config.tipoImpressao,
    /**
     * Logo da empresa e imagem de repouso do display do cliente, em base64 **sem
     * prefixo `data:`** — dois campos que o `GetSessao` real sempre devolve
     * (PNG de ~44 KB e ~34 KB no tenant medido em 2026-09-11) e que este mock
     * não declarava. Nenhum consumidor no Checkout os lê hoje; o PNG 1×1
     * transparente abaixo existe para que a forma da resposta seja a real e para
     * que a feature 015 tenha de onde ler quando for exibir a marca.
     */
    ImagemLogoBase64:
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    ImagemDisplaySecundarioBase64:
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    /**
     * Catálogo de pagamento da feature 008. **Não existe endpoint dedicado**
     * (AD-097): condições e formas chegam embutidas na sessão, e é daqui que
     * `useCondicoesPagamento` as lê (`erp-pagamento-api.md` §1).
     *
     * `FormaEntrada` está em toda forma de propósito: sem ele o ERP calcula
     * crediário zero e a validação prévia aprova exatamente o que existe para
     * barrar (`FR-022`/AD-111).
     *
     * **`FormaFpgUtiCar = 'VDV'` identifica a forma de vale devolução, e nada
     * mais.** Uma única forma do catálogo o traz — `FormaCodigo: 4` — e é ela
     * que abre a janela do ticket ao ser escolhida; **toda** outra forma,
     * cartão inclusive, o traz vazio e é uma forma comum, com campo de valor.
     * A leitura anterior (vazio = "aceita vale", AD-048) foi revogada em
     * 2026-09-04, e `ehFormaDeValeDevolucao` já compara só contra `'VDV'`.
     * Se o cartão abrir a janela do vale numa stack local, o build servido
     * está defasado — não é o cadastro.
     *
     * Os códigos 1–4 são estáveis: os cenários E2E os endereçam por
     * `opcao-forma-<codigo>`. Formas novas entram a partir do 5.
     */
    CondicoesDePagamento: [
      {
        CondicaoCodigo: String(1), // int64
        CondicaoDescricao: 'A VISTA',
        // `double` com **cinco decimais** na string, como o ERP serializa
        // (`"0.00000"`, `"20.00000"`) — o mock mandava `"0"`/`"20"`.
        CondicaoPrazo: '0.00000',
        CondicaoMinimoEntrada: '0.00000',
        CondicaoDesconto: '0.00000',
        CondicaoDescontoMaximo: '0.00000',
        CondicaoFormasDePagamento: [
          {
            FormaCodigo: String(1), // int64
            // **`"<código> - <DESCRIÇÃO>"`**: o ERP devolve `"1 - DINHEIRO"`,
            // com o código repetido no rótulo (medido ao vivo 2026-09-11 no
            // catálogo inteiro do tenant). O mock mandava só a descrição, então
            // nenhuma tela jamais foi vista com o prefixo que produção manda.
            FormaDescricao: '1 - DINHEIRO',
            FormaEntrada: 'S',
            FormaMeioPagtoNFe: '01',
            // Real: vem `" "` (espaço), nao `""`, pra toda forma deste
            // tenant — confirmado ao vivo contra o ERP real 2026-09-04.
            FormaIntegracaoCartao: ' ',
            FormaTipoTransacaoTEF: '',
            FormaFpgUtiCar: '',
          },
          {
            // Forma **comum**, não vale: `FpgUtiCar` vazio. Com `TEFAtivo` a
            // integração roteia para TEF (feature 010); sem ele, vira
            // pagamento manual — nunca a janela do ticket.
            FormaCodigo: String(2), // int64
            FormaDescricao: '2 - CARTAO CREDITO',
            FormaEntrada: 'N',
            FormaMeioPagtoNFe: '03',
            FormaIntegracaoCartao: '1',
            FormaTipoTransacaoTEF: 'CREDITO',
            FormaFpgUtiCar: '',
          },
          {
            // A **única** forma de vale devolução do catálogo: é `FpgUtiCar =
            // 'VDV'` que a identifica, e escolhê-la abre a janela do ticket em
            // vez do campo de valor. Tickets válidos em `TICKETS_DEVOLUCAO` —
            // `VALE10` fecha uma venda do produto `001234` sem excedente.
            FormaCodigo: String(4), // int64
            FormaDescricao: '4 - VALE DEVOLUCAO',
            FormaEntrada: 'N',
            FormaMeioPagtoNFe: '99',
            FormaIntegracaoCartao: ' ',
            FormaTipoTransacaoTEF: '',
            FormaFpgUtiCar: 'VDV',
          },
          {
            FormaCodigo: String(3), // int64
            FormaDescricao: '3 - PIX',
            FormaEntrada: 'S',
            FormaMeioPagtoNFe: '17',
            FormaIntegracaoCartao: ' ',
            FormaTipoTransacaoTEF: '',
            FormaFpgUtiCar: '',
          },
          {
            FormaCodigo: String(5), // int64
            FormaDescricao: '5 - CARTAO DEBITO',
            FormaEntrada: 'N',
            FormaMeioPagtoNFe: '04',
            FormaIntegracaoCartao: '1',
            FormaTipoTransacaoTEF: 'DEBITO',
            FormaFpgUtiCar: '',
          },
          {
            // `PixEstatico` **nunca** roteia para a integração dinâmica
            // (`FR-006` da 008): existe aqui para que a stack local mostre, no
            // mesmo combobox, a forma que abre a janela de QR Code e a que não
            // abre.
            FormaCodigo: String(6), // int64
            FormaDescricao: '6 - PIX ESTATICO',
            FormaEntrada: 'S',
            FormaMeioPagtoNFe: '20',
            FormaIntegracaoCartao: ' ',
            FormaTipoTransacaoTEF: '',
            FormaFpgUtiCar: '',
          },
          {
            FormaCodigo: String(7), // int64
            FormaDescricao: '7 - VALE ALIMENTACAO',
            FormaEntrada: 'N',
            FormaMeioPagtoNFe: '10',
            FormaIntegracaoCartao: '2',
            FormaTipoTransacaoTEF: '',
            FormaFpgUtiCar: '',
          },
        ],
      },
      {
        /**
         * Segunda condição, a prazo. Existe para que o combobox de condição
         * tenha de fato o que escolher — com uma única condição, trocar de
         * condição (I9: a troca esvazia as formas aplicadas) não é exercitável
         * à mão.
         *
         * As formas dela são **outras**, não as mesmas com outro código: é o
         * que torna visível a regra de que a forma pertence à condição, e que
         * uma forma de outra condição é recusada (`AVISO_FORMA_FORA_DA_CONDICAO`).
         *
         * `CondicaoMinimoEntrada: 20` (R$ 20,00) e `FormaEntrada: 'S'` no
         * boleto: sem `FpgEnt` o ERP calcula crediário zero e o gate da 014
         * aprova o que deveria barrar (`FR-022`/AD-111).
         */
        CondicaoCodigo: String(2), // int64
        CondicaoDescricao: '30 DIAS',
        /**
         * **`CondicaoPrazo` é número de parcelas, não dias.** No catálogo real:
         * `'30 DIAS'` → `"1.00000"`, `'2 VEZES'` → `"2.00000"`,
         * `'30/60/90/120 DIAS'` → `"4.00000"`, `'1+5 VEZES'` → `"5.00000"`
         * (medido ao vivo 2026-09-11 nas 62 condições do tenant). O mock
         * mandava `30` para esta condição, o que só faz sentido na leitura "em
         * dias" — que o ERP não sustenta.
         */
        CondicaoPrazo: '1.00000',
        CondicaoMinimoEntrada: '20.00000',
        CondicaoDesconto: '0.00000',
        CondicaoDescontoMaximo: '5.00000',
        CondicaoFormasDePagamento: [
          {
            FormaCodigo: String(8), // int64
            FormaDescricao: '8 - BOLETO 30 DIAS',
            FormaEntrada: 'S',
            FormaMeioPagtoNFe: '15',
            FormaIntegracaoCartao: ' ',
            FormaTipoTransacaoTEF: '',
            FormaFpgUtiCar: '',
          },
          {
            FormaCodigo: String(9), // int64
            FormaDescricao: '9 - CREDIARIO LOJA',
            FormaEntrada: 'S',
            FormaMeioPagtoNFe: '05',
            FormaIntegracaoCartao: ' ',
            FormaTipoTransacaoTEF: '',
            FormaFpgUtiCar: '',
          },
          {
            FormaCodigo: String(10), // int64
            FormaDescricao: '10 - DUPLICATA MERCANTIL',
            FormaEntrada: 'N',
            FormaMeioPagtoNFe: '14',
            FormaIntegracaoCartao: ' ',
            FormaTipoTransacaoTEF: '',
            FormaFpgUtiCar: '',
          },
        ],
      },
    ],
    /**
     * TEF e PIX **desligados** no cenário padrão do E2E: é o que mantém todas
     * as formas roteando para `NENHUMA` (`resolverIntegracao`), de modo que um
     * pagamento aplicado já entra `APROVADO` sem depender das features 009/010.
     * É também o cenário do fluxo dourado do quickstart da 008 ("desktop com
     * `tefAtivo: false`").
     *
     * O PIX deixou de ser uma constante e passou a vir de `config.pixAtivo`
     * (feature 009): `pagamento-pix.spec.ts` o liga por `/__mock/config` antes
     * de abrir a tela. O **padrão continua desligado** de propósito — ligá-lo
     * aqui faria toda venda quitada por PIX nas demais suítes passar a depender
     * de um QR Code e de uma sondagem de 10s.
     */
    /**
     * Os dois SDTs de configuração têm mais campos do que o mock declarava —
     * sete a mais em TEF e dois a mais em PIX, todos presentes em **toda**
     * resposta real (medido ao vivo 2026-09-11). O Checkout hoje só lê
     * `TEFAtivo`/`UtilizaCentriumPAG`/`MinimoPix`/`TempoEspera`, mas publicar a
     * forma inteira é o que impede um consumidor novo de descobrir na produção
     * que o campo existia.
     *
     * `TEFAtivo` é o único booleano do bloco; os numéricos vêm string (`"0"`).
     */
    ConfiguracoesTEF: {
      TEFempresaAutomacao: '',
      TEFcapAutomacao: String(0), // int64
      TEFversaoInterface: String(0), // int64
      TEFnomeAutomacao: '',
      TEFversaoAutomacao: '',
      TEFregistroCertificacao: '',
      TEFVersaoImpressao: String(0), // int64
      TEFAtivo: false,
    },
    ConfiguracoesPIX: {
      UtilizaCentriumPAG: config.pixAtivo,
      // `double` com cinco decimais, como as condições.
      MinimoPix: config.minimoPix.toFixed(5),
      TempoEspera: String(10), // int64
      // `''` ou `'S'`, como todo flag de caractere deste contrato.
      UtilizaEncurtador: '',
      UtilizaLinkExterno: 'S',
    },
  };
}

/** Corpo de `FaturarNFCeInput` recebido na última chamada, para inspeção. */
interface EnvelopeFaturarNFCe {
  readonly CheckoutFaturarNFCe?: Record<string, unknown>;
}

export async function criarMockErp(porta: number): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  /**
   * Toda resposta sai declarada como JSON, e sem adivinhação de tipo.
   *
   * `FaturarNFCe` **ecoa o corpo da requisição** de volta — é o que o ERP real
   * faz com o retrato, e o E2E depende disso para conferir o que foi enviado.
   * Isso é, literalmente, valor do cliente refletido na resposta, e foi o que o
   * CodeQL apontou como XSS refletido (`js/reflected-xss`, alerta #1). O eco não
   * pode sair: ele é o comportamento sob teste. O que pode sair é a chance de o
   * navegador **interpretar** esse eco como documento.
   *
   * Na prática o Fastify já serializava tudo como JSON, então não havia vetor
   * explorável; o que faltava era dizer isso de forma verificável, em vez de
   * depender de um default. Com o tipo explícito e `nosniff`, uma resposta com
   * `<script>` dentro de um campo continua sendo dado, nunca documento — e a
   * análise estática passa a ver a garantia em vez de supor o pior.
   *
   * Vale para o mock inteiro, e não só para os três ecos de `FaturarNFCe`,
   * porque qualquer handler novo que passe a refletir corpo nasce coberto.
   */
  app.addHook('onSend', async (_request, reply, payload: unknown) => {
    reply.header('content-type', 'application/json; charset=utf-8');
    reply.header('x-content-type-options', 'nosniff');
    return payload;
  });

  let config: ConfigMockErp = { ...CONFIG_PADRAO };
  let contadores: ContadoresMockErp = { ...CONTADORES_ZERADOS };
  /** Cadastro criado por `PostCliente` durante o teste — descartado no reset. */
  const documentosCriados: string[] = [];
  let ultimoRetratoFaturado: Record<string, unknown> | null = null;
  /**
   * Último número de rascunho gerado por `FaturarNFCe` para venda que chega com
   * `NumeroRascunho: 0` (AD-235). Sequencial a partir de 7001, bem longe dos
   * números dos documentos sintéticos (`90210`/`90211`), para o E2E distinguir
   * "adotado" de "importado".
   */
  let ultimoRascunhoGerado = 7000;
  /** Último retrato submetido ao gate da 014 — para o E2E conferir a projeção (I2). */
  let ultimoRetratoValidado: Record<string, unknown> | null = null;
  /** Último corpo de `GerarPIX` recebido — deixa o E2E afirmar `TrnValor`, pagador etc. */
  let ultimoGerarPix: Record<string, unknown> | null = null;
  /** Sequência dos GUIDs que o mock gera, um por cobrança (AD-251). */
  let sequenciaGuidPix = 0;
  /**
   * Instante de geração de cada `TrnGUID`, para o status por relógio.
   *
   * Por GUID, e não um escalar único: uma venda pode gerar mais de uma cobrança
   * (o operador desiste da primeira e tenta de novo), e um relógio global faria
   * a segunda nascer já "quase paga", herdando o tempo da primeira.
   */
  const geracoesPix = new Map<string, number>();

  await app.register(import('@fastify/formbody'));

  // --- Controle do mock (só teste) ---------------------------------------
  app.post('/__mock/reset', async () => {
    config = { ...CONFIG_PADRAO };
    contadores = { ...CONTADORES_ZERADOS };
    ultimoRetratoFaturado = null;
    ultimoRascunhoGerado = 7000;
    ultimoRetratoValidado = null;
    ultimoGerarPix = null;
    geracoesPix.clear();
    // Cadastro criado por `PostCliente` num teste não pode vazar para o
    // próximo: o cenário "documento inexistente" depende de o CPF continuar
    // ausente.
    for (const documento of documentosCriados.splice(0)) {
      delete CLIENTES[documento];
    }
    return { ok: true };
  });

  app.post<{ Body: Partial<ConfigMockErp> }>('/__mock/config', async (request) => {
    config = { ...config, ...request.body };
    return { ok: true, config };
  });

  app.get('/__mock/calls', async () => contadores);

  /** Último retrato recebido — deixa o E2E afirmar `NumeroRascunho`, `Log` etc. */
  app.get('/__mock/ultimo-faturamento', async () => ({ retrato: ultimoRetratoFaturado }));

  /** Último retrato submetido ao gate da 014 — confere a projeção da candidata. */
  app.get('/__mock/ultima-validacao', async () => ({ retrato: ultimoRetratoValidado }));

  /** Último corpo de `GerarPIX` — `TrnValor`, `FPgCod` e os dados do pagador. */
  app.get('/__mock/ultimo-pix', async () => ({ sdt: ultimoGerarPix }));

  // --- Contrato do ERP ----------------------------------------------------
  app.post('/oauth/access_token', async (request, reply) => {
    contadores.token += 1;

    if (config.statusToken !== 200) {
      return reply.code(config.statusToken).send({ error: 'invalid_grant' });
    }

    // Defesa contra a regressão de AD-165: o GAM real recusa
    // `additionalParameters` (camelCase) sem sequer olhar o `Repository`. O
    // corpo chega parseado pelo `@fastify/formbody` já registrado.
    const corpo = request.body as Record<string, unknown> | undefined;
    if (corpo && 'additionalParameters' in corpo && !('additional_parameters' in corpo)) {
      return reply.code(401).send({
        error: {
          code: '1',
          message: 'A conexão ao GAM não foi especificada, favor contate o administrador do GAM.',
        },
      });
    }

    return reply.send({
      access_token: `token-sintetico-${contadores.token}`,
      token_type: 'bearer',
      expires_in: 3600,
      scope: 'fullcontrol',
    });
  });

  app.get('/ApiCentriumOAuth/GetSessao', async (request, reply) => {
    contadores.getSessao += 1;

    if (config.statusGetSessao !== 200) {
      return reply.code(config.statusGetSessao).send({ error: 'falha simulada' });
    }

    // Sem o cabeçalho `Empresa` a resposta troca de forma: volta **com** o
    // envelope `SessaoUsuario` e `messages`, e o SDT zerado — e nem
    // `CondicoesDePagamento` nem os dois blocos de configuração aparecem
    // (medido ao vivo 2026-09-11). O `chamadaAutenticada` do BFF sempre manda o
    // cabeçalho, então este é o caminho de quem chama o ERP por fora.
    if (semCabecalhoEmpresa(request.headers)) {
      return reply.send(envelopeCabecalhoObrigatorio('SessaoUsuario', SESSAO_ZERADA));
    }

    return reply.send(payloadGetSessao(config));
  });

  app.get<{ Querystring: { Codigoproduto?: string; Tipocodproduto?: string } }>(
    '/ApiCentriumOAuth/GetProduto',
    async (request, reply) => {
      contadores.negocio += 1;
      contadores.getProduto += 1;

      if (config.respostas401Pendentes > 0) {
        config.respostas401Pendentes -= 1;
        return reply.code(401).send({ error: 'token expirado' });
      }

      // **`Tipocodproduto` escolhe o campo filtrado**, e o mock ignorava isso:
      // buscava sempre pela chave do catálogo (o reduzido). Ao vivo (2026-09-11)
      // `'B'` filtra por código de barras, `'R'`/`''` pelo reduzido e `'M'` pela
      // referência — e um tipo fora desses três não filtra nada, caso em que o
      // ERP devolve o **primeiro produto da empresa** (confirmado com
      // `Tipocodproduto=D`), que é como uma linha errada entra na venda sem
      // nenhum erro aparecer.
      const codigo = request.query.Codigoproduto ?? '';
      const tipo = request.query.Tipocodproduto ?? '';
      const catalogo = Object.values(CATALOGO);
      const campoFiltrado: Record<string, string> = {
        B: 'CodigoBarras',
        M: 'Referencia',
        R: 'CodigoProduto',
        '': 'CodigoProduto',
      };
      const campo = campoFiltrado[tipo];

      const produto =
        campo === undefined
          ? catalogo[0]
          : catalogo.find((candidato) => String(candidato[campo]) === codigo);

      // **Nunca `404`.** Não encontrou é `200` com o SDT todo zerado
      // (`CodigoProduto: ''`) — o `404` que este mock devolvia não existe no ERP
      // e fazia a suíte exercitar um caminho de erro que produção não produz.
      // Real: flat na raiz, sem envelope `Produto` nem `messages` (AD-165).
      return reply.send(
        produto === undefined ? PRODUTO_INEXISTENTE : produtoComoOErpResponde(produto),
      );
    },
  );

  app.get<{ Querystring: { Txtbusca?: string; Pagina?: string; Tamanhopagina?: string } }>(
    '/ApiCentriumOAuth/GetListaProdutos',
    async (request, reply) => {
      contadores.negocio += 1;
      contadores.getListaProdutos += 1;

      const termo = (request.query.Txtbusca ?? '').toUpperCase();
      // A lista traz tudo menos `PrecoVenda`/`PrecoMinimo`/
      // `ProdutoPesavelEditavel` (ver `itemDaListaDeProdutos`) — é a ausência
      // desses três que impede montar a linha daqui (AD-091).
      const todos = Object.values(CATALOGO)
        .filter((produto) => String(produto['Descricao']).toUpperCase().includes(termo))
        .map(itemDaListaDeProdutos);

      // Real: campos soltos na raiz, sem envelope `ListaProdutos` nem
      // `messages`; `Produtos` primeiro, ausente quando nada casa, e
      // `TotalPaginas: 0` na busca vazia. `PaginaAtual`/`RegistrosPorPagina`/
      // `TotalRegistros`/`TotalPaginas` vêm como número nativo — só os campos
      // de negócio do item (`double`/`int64`) vêm como string.
      return reply.send(respostaPaginada('Produtos', todos, request.query));
    },
  );

  /**
   * Gate de validação prévia (feature 014).
   *
   * Consulta **pura**: não grava nada e não altera o estado do mock, como
   * `PCheckout_ValidarNFCe` no ERP real. O último retrato recebido fica
   * disponível para o E2E conferir que a candidata foi projetada junto com as
   * formas já aplicadas (I2).
   */
  app.post<{ Body: EnvelopeFaturarNFCe }>(
    '/ApiCentriumOAuth/ValidarNFCe',
    async (request, reply) => {
      contadores.negocio += 1;
      contadores.validarNFCe += 1;
      const retratoValidado = request.body.CheckoutFaturarNFCe ?? null;
      ultimoRetratoValidado = retratoValidado;

      if (config.statusValidarNFCe !== 200) {
        return reply.code(config.statusValidarNFCe).send({ messages: [] });
      }

      // `Empresa` **no corpo**, não no header: é a primeira linha da matriz do
      // ERP real, e o mock precisa reproduzi-la (AD-188, item 42). Sem esta
      // checagem o E2E ficaria verde com um retrato que o ERP recusaria — foi
      // exatamente assim que o campo faltante atravessou a implementação
      // inteira sem ser notado.
      const empresa = retratoValidado?.['Empresa'];
      if (typeof empresa !== 'string' || empresa.trim() === '') {
        return reply.send({
          Valido: false,
          messages: [{ Id: '9999', Type: 1, Description: MENSAGEM_EMPRESA_OBRIGATORIA }],
        });
      }

      switch (config.vereditoValidarNFCe) {
        case 'ACEITA':
          return reply.send({ Valido: true, messages: [] });

        case 'ACEITA_COM_AVISO':
          // `EmpLimCre='A'`: acima do limite, mas a empresa só avisa. `Warning`
          // **não** bloqueia aqui — é o par do caso abaixo (AD-110).
          return reply.send({
            Valido: true,
            messages: [{ Id: '9999', Type: 1, Description: MENSAGEM_AVISO_LIMITE_CREDITO }],
          });

        case 'RECUSADA_WARNING':
          // `EmpLimCre='B'`: mesma severidade da linha acima e desfecho oposto.
          return reply.send({
            Valido: false,
            messages: [{ Id: '9999', Type: 1, Description: MENSAGEM_RECUSA_CREDITO_BLOQUEADO }],
          });

        case 'RECUSADA':
          return reply.send({
            Valido: false,
            messages: [{ Id: '9999', Type: 2, Description: MENSAGEM_RECUSA_CREDITO_BLOQUEADO }],
          });
      }
    },
  );

  app.post<{ Body: EnvelopeFaturarNFCe }>(
    '/ApiCentriumOAuth/FaturarNFCe',
    async (request, reply) => {
      contadores.negocio += 1;
      contadores.faturarNFCe += 1;

      const retrato = request.body.CheckoutFaturarNFCe ?? null;
      ultimoRetratoFaturado = retrato;

      if (config.respostas401Pendentes > 0) {
        config.respostas401Pendentes -= 1;
        return reply.code(401).send({ error: 'token expirado' });
      }

      if (config.statusFaturarNFCe !== 200) {
        return reply
          .code(config.statusFaturarNFCe)
          .send({ messages: [{ Id: 'ERR', Type: 1, Description: 'Recusa sintética do ERP.' }] });
      }

      // Mesmo SDT de `ValidarNFCe`, mesma primeira linha da matriz: sem
      // `Empresa` no corpo o ERP real recusa antes de olhar produto, cliente ou
      // condição (AD-188).
      const empresaDoFaturamento = retrato?.['Empresa'];
      if (typeof empresaDoFaturamento !== 'string' || empresaDoFaturamento.trim() === '') {
        // `.type(...)` explícito nos três ecos do retrato: o hook `onSend` acima
        // já cobre a resposta, mas dizer o tipo junto do dado refletido mantém a
        // garantia legível no ponto onde ela importa.
        return reply.type('application/json').send({
          OutCheckoutFaturarNFCe: { ...(retrato ?? {}) },
          messages: [{ Id: '9999', Type: 1, Description: MENSAGEM_EMPRESA_OBRIGATORIA }],
        });
      }

      // `SUSPENDER` não emite documento fiscal: a resposta volta sem
      // `NotaFiscal`, como o ERP real (`contracts/faturamento-api.md`).
      const suspendendo = retrato?.['SuspenderOuFaturar'] === 'SUSPENDER';

      // `PCheckout_FaturarNFCe`: `NumeroRascunho = 0` grava um rascunho novo;
      // `≠ 0` atualiza o existente. Em qualquer caso a resposta devolve o número
      // **antes** das validações (AD-235) — por isso o eco abaixo leva o número
      // resolvido, e não o que chegou.
      const numeroRecebido = Number(retrato?.['NumeroRascunho'] ?? 0);
      const numeroRascunho =
        Number.isSafeInteger(numeroRecebido) && numeroRecebido > 0
          ? numeroRecebido
          : (ultimoRascunhoGerado += 1);
      const retratoGravado = { ...(retrato ?? {}), NumeroRascunho: String(numeroRascunho) };

      // Validação posterior à gravação recusou (saldo, regra de NFCe): envelope
      // + `messages` e o rascunho já gravado — vale para `SUSPENDER` e `FATURAR`.
      if (config.faturarRecusaComRascunho) {
        return reply.type('application/json').send({
          OutCheckoutFaturarNFCe: retratoGravado,
          messages: [
            {
              Id: '9999',
              Type: 1,
              Description:
                'Quantidade maior que o Saldo do produto: 001234 - PRODUTO SINTETICO! Quantidade: 2. Saldo: 1',
            },
          ],
        });
      }

      // Cenário tributário não encontrado (AD-239): o ERP recusa **antes** de
      // preencher o retrato — envelope zerado, `NumeroRascunho: "0"` — e ainda
      // assim grava um rascunho vazio do outro lado (divergência do ERP,
      // `PENDENCIES.md`). Texto e forma medidos no preview em 2026-09-16.
      if (config.faturarSemCenarioTributario) {
        return reply.type('application/json').send({
          OutCheckoutFaturarNFCe: {
            Empresa: 0,
            SuspenderOuFaturar: '',
            clienteCodigo: '0',
            ClienteNome: '',
            vendedorCodigo: '0',
            vendedorNome: '',
            CondicaoPagamentoCodigo: '0',
            NumeroRascunho: '0',
            CadSerieNFCe: '',
            UsuarioCodigo: '0',
            Log: '',
          },
          messages: [
            {
              Id: '9999',
              Type: 1,
              Description:
                'Busca realizada pelo seguinte Cenário Tributário não foi Encontrada\r\n' +
                '[ Empresa: 0, Classificação Fiscal:      , Regime Especial: NORMAL, País Origem: BRASIL, ' +
                'País Destino: BRASIL , UF Origem: SC, UF Destino: SC, Operação: Desconhecida , Característica:  ]',
            },
          ],
        });
      }

      // NFCe gravada e **não** autorizada: o bloco vem completo, com o motivo
      // em `ErroMensagem`, e sem nada para imprimir.
      //
      // **Sem envelope**, como o ERP real (medido em 2026-09-10, corrigindo o
      // que AD-165 registrou): `NotaFiscal` na raiz, ao lado do retrato ecoado,
      // e nenhum `messages`. `Autorizada` vem `'R'`, que é o valor real — não
      // `'N'`. O caminho de sucesso logo abaixo ainda usa a forma do YAML, de
      // propósito: é o que mantém o E2E exercitando a tolerância às duas.
      if (!suspendendo && config.faturarNFCeRejeitada) {
        return reply.type('application/json').send({
          ...retratoGravado,
          NotaFiscal: {
            NumeroNota: String(0), // o ERP real zera este campo na rejeição
            SerieNota: '',
            Autorizada: 'R',
            ErroCodigo: 539,
            ErroMensagem: 'Rejeicao: Duplicidade de NF-e (sintetico)',
            // Contrato de 2026-09-14 (KB; ausentes do YAML), AD-238.
            RetornoMensagemIA:
              'Confira a numeracao da serie (sintetico).\nDepois gere uma nova venda.',
            UrlChamadas: 'https://atendimento.exemplo.invalid/chamado?origem=checkout',
            XMLImpressao: '',
            PDFImpressao: '',
          },
        });
      }

      // Sucesso — **sem envelope**, como o ERP real (medido em 2026-09-16):
      // o retrato volta na raiz com `NotaFiscal` ao lado, e sem `messages`.
      // A suspensão bem-sucedida também traz o bloco, com `Autorizada: 'N'` e o
      // número do **rascunho** em `NumeroNota` — não é rejeição: suspender não
      // transmite nada à SEFAZ.
      if (suspendendo) {
        return reply.type('application/json').send({
          ...retratoGravado,
          NotaFiscal: {
            NumeroNota: String(numeroRascunho),
            SerieNota: String(retrato?.['CadSerieNFCe'] ?? '') || '1',
            Autorizada: 'N',
            ErroCodigo: '0',
            ErroMensagem: '',
            RetornoMensagemIA: '',
            UrlChamadas: '',
            XMLImpressao: '',
            PDFImpressao: '',
          },
        });
      }

      // `FATURAR` sem desfecho: o ERP responde 200, flat, **sem** `NotaFiscal` e
      // sem `messages` (medido em 2026-09-16 no rascunho 6036). A venda fica no
      // caixa, porque nada prova que a NFCe foi gravada.
      if (config.faturarSemNotaFiscal) {
        return reply.type('application/json').send({ ...retratoGravado });
      }

      return reply.type('application/json').send({
        ...retratoGravado,
        NotaFiscal: {
          NumeroNota: String(9001), // int64
          SerieNota: '1',
          Autorizada: 'S',
          ErroCodigo: '0',
          ErroMensagem: '',
          RetornoMensagemIA: '',
          UrlChamadas: '',
          XMLImpressao: XML_SINTETICO,
          PDFImpressao: PDF_SINTETICO,
        },
      });
    },
  );

  app.get<{ Querystring: { CPFCNPJ?: string; CodCliente?: string } }>(
    '/ApiCentriumOAuth/GetCliente',
    async (request, reply) => {
      contadores.negocio += 1;
      contadores.getCliente += 1;

      if (semCabecalhoEmpresa(request.headers)) {
        return reply.send(
          envelopeCabecalhoObrigatorio(
            'Cliente',
            clienteComoOErpResponde(undefined, config.getClienteSemCadastro),
          ),
        );
      }

      // **Documento só casa em dígitos crus.** O ERP compara o parâmetro com o
      // campo normalizado do cadastro: `CPFCNPJ=57627754968` acha o cliente,
      // `CPFCNPJ=576.277.549-68` devolve SDT vazio (as duas chamadas feitas ao
      // vivo em 2026-09-11, mesmo cliente). É o oposto de `GetListaClientes`,
      // que aceita as duas formas — e é por isso que passar adiante o `CPF`
      // mascarado que a lista devolve nunca encontra nada aqui.
      const porDocumento = CLIENTES[request.query.CPFCNPJ ?? ''];
      const porCodigo =
        request.query.CodCliente === undefined
          ? undefined
          : Object.values(CLIENTES).find(
              (cliente) => String(cliente['CodCliente']) === request.query.CodCliente,
            );

      // Não achou: `200` com o SDT zerado, nunca `404` — e é indistinguível de
      // "achou mas o ERP não preencheu", porque o único sinal de existência é o
      // `CodCliente` diferente de zero.
      return reply.send(
        clienteComoOErpResponde(porDocumento ?? porCodigo, config.getClienteSemCadastro),
      );
    },
  );

  app.get<{ Querystring: { Txtbusca?: string; Pagina?: string; Tamanhopagina?: string } }>(
    '/ApiCentriumOAuth/GetListaClientes',
    async (request, reply) => {
      contadores.negocio += 1;
      contadores.getListaClientes += 1;

      // Depende do cabeçalho `Empresa` e falha **em silêncio** sem ele: `200`,
      // zero registro, nenhuma `messages` (medido ao vivo 2026-09-11 — a mesma
      // busca por `ANGELA` devolve 1 registro com o cabeçalho e 0 sem ele).
      if (semCabecalhoEmpresa(request.headers)) {
        return reply.send(respostaPaginada('Clientes', [], request.query));
      }

      const termo = (request.query.Txtbusca ?? '').toUpperCase();
      const termoEmDigitos = digitos(termo);
      // Sem `DescontoConvenio`/`CodigoConvenio`/`email`, como o contrato real —
      // é o que obriga o Checkout a resolver por `GetCliente` antes de associar
      // (`research.md` D1). E sem nenhum campo de status (AD-093).
      const todos = Object.values(CLIENTES)
        // `CliTip = 'F'`: a lista é de pessoa física. Não observável ao vivo
        // neste tenant (não há PJ cadastrado para servir de contraprova), e
        // mantido porque remover ofereceria na busca um cliente que o Checkout
        // recusa em seguida por CNPJ (AD-133).
        .filter((cliente) => cliente['CliTip'] !== 'J')
        .filter((cliente) => {
          if (termo === '') {
            return true;
          }
          const cpf = digitos(String(cliente['cpf']));
          // O documento casa por **trecho de dígitos**, com ou sem máscara:
          // `576.277.549-68`, `57627754968` e `576.277` acham o mesmo cliente
          // (as três chamadas feitas ao vivo 2026-09-11). Nome casa por
          // conteúdo, sem exigir início.
          const porDocumento = termoEmDigitos !== '' && cpf.includes(termoEmDigitos);
          return String(cliente['nome']).toUpperCase().includes(termo) || porDocumento;
        })
        .map((cliente) => ({
          ClienteCodigo: cliente['CodCliente'], // int64 — string, confirmado ao vivo
          ClienteNome: cliente['nome'],
          // **Com máscara**: o ERP devolve `"576.277.549-68"`, nunca os dígitos
          // crus (2026-09-11). O mock devolvia crus, e é por isso que a
          // reconsulta do candidato em `GetCliente` nunca falhou em teste — no
          // ERP real o `CPF` da lista, passado adiante como veio, não acha nada.
          CPF: cpfComMascara(String(cliente['cpf'])),
          // `ListaPreco` é `int32` **nesta** SDT (`SDTCheckoutListaClientes`),
          // diferente do `int64` de `ClienteCheckout` (GetCliente singular) —
          // dois campos homônimos, tipos diferentes no próprio contrato do
          // ERP. Confirmado ao vivo: vem número nativo aqui.
          ListaPreco: Number(cliente['ListaPreco']),
          Celular: cliente['celular'],
          Telefone: '',
          Endereco: {
            cep: cliente['cep'],
            endereco: cliente['endereco'],
            bairro: cliente['bairro'],
            numero: cliente['numero'],
            cidade: cliente['cidade'],
            uf: cliente['uf'],
          },
        }));

      // Real: flat na raiz, sem envelope `ListaClientes` nem `messages`
      // (AD-165), `Clientes` primeiro e **ausente** quando nada casa.
      return reply.send(respostaPaginada('Clientes', todos, request.query));
    },
  );

  app.get<{ Querystring: { Txtbusca?: string; Pagina?: string; Tamanhopagina?: string } }>(
    '/ApiCentriumOAuth/GetListaVendedores',
    async (request, reply) => {
      contadores.negocio += 1;
      contadores.getListaVendedores += 1;

      // Sem nenhum parâmetro de status: `GetListaVendedores` aceita só
      // `Empresa`, `Txtbusca`, `Pagina` e `Tamanhopagina` (AD-103). Se o
      // Checkout mandar um filtro de status, ele é ignorado aqui como seria no
      // ERP — não há dado por trás dele.
      // Mesmo silêncio de `GetListaClientes` sem o cabeçalho `Empresa`: `200`
      // com zero registro (medido ao vivo 2026-09-11).
      if (semCabecalhoEmpresa(request.headers)) {
        return reply.send(respostaPaginada('Vendedores', [], request.query));
      }

      const termo = (request.query.Txtbusca ?? '').toUpperCase();
      const todos = VENDEDORES.filter((vendedor) =>
        String(vendedor['VendedorNome']).toUpperCase().includes(termo),
      );

      // Real: flat na raiz, sem envelope `CheckoutListaVendedores` nem
      // `messages` (AD-165), `Vendedores` primeiro e ausente quando vazio.
      return reply.send(respostaPaginada('Vendedores', todos, request.query));
    },
  );

  app.post<{ Body: { Cliente?: Record<string, unknown> } }>(
    '/ApiCentriumOAuth/PostCliente',
    async (request, reply) => {
      contadores.negocio += 1;
      contadores.postCliente += 1;

      const enviado = request.body.Cliente ?? {};
      const cpf = String(enviado['cpf'] ?? '');
      if (cpf === '') {
        // Recusa de negócio vem `200` com `messages[].Type: 1` — nunca status
        // HTTP de erro (medido ao vivo 2026-09-11: `{"messages":[{"Id":"9998",
        // "Type":1,"Description":"CPF do cliente é obrigatório"}]}`).
        return reply.send({
          messages: [{ Id: '9998', Type: 1, Description: 'CPF do cliente é obrigatório' }],
        });
      }

      // O ERP grava só os campos de AD-024 e força `CliTip = 'F'`. Aqui o mock
      // completa o registro do jeito que `GetCliente` o devolveria depois —
      // sem lista de preço nem convênio, que a procedure não grava.
      documentosCriados.push(cpf);
      CLIENTES[cpf] = {
        Empresa: String(enviado['Empresa']), // int64
        CodCliente: String(9000 + contadores.postCliente), // int64
        nome: enviado['nome'],
        cpf,
        email: enviado['email'],
        celular: enviado['celular'],
        cep: enviado['cep'],
        endereco: enviado['endereco'],
        bairro: enviado['bairro'],
        numero: enviado['numero'],
        cidade: enviado['cidade'],
        uf: enviado['uf'],
        CodigoConvenio: 0, // int32
        NomeConvenio: '',
        DescontoConvenio: String(0), // double
        ListaPreco: String(0), // int64
        CliTip: 'F',
      };

      // Sucesso também vem embrulhado em `messages`, com `Type: 2` e o
      // `Description` no formato `<código gravado> - <nome>` (medido ao vivo
      // 2026-09-11). O array nu que este mock devolvia era o shape do YAML, e
      // era o que fazia a suíte passar com um schema que reprovava o ERP real.
      return reply.send({
        messages: [
          {
            Id: '1',
            Type: 2,
            Description: `${String(CLIENTES[cpf]?.['CodCliente'] ?? '')} - ${String(enviado['nome'] ?? '')}`,
          },
        ],
      });
    },
  );

  app.get<{
    Querystring: {
      Txtbusca?: string;
      Datainicial?: string;
      Datafinal?: string;
      Pagina?: string;
      Tamanhopagina?: string;
    };
  }>('/ApiCentriumOAuth/ListaDAVs', async (request, reply) => {
    contadores.negocio += 1;
    contadores.listaDavs += 1;

    const termo = (request.query.Txtbusca ?? '').toUpperCase();
    const de = request.query.Datainicial ?? '';
    const ate = request.query.Datafinal ?? '';

    const todos = Object.values(DAVS)
      // **`VendedorNome` vazio.** No contrato de 2026-09-14 a linha publica a
      // chave, mas o ERP a devolve sempre `""` (pendência 57, AD-237). A
      // fixture carrega o nome só para `GetListaNFCes`, que o traz de fato;
      // emiti-lo aqui ofereceria um dado que a janela de DAVs não recebe.
      .map((dav) => ({
        NumeroDAV: dav.lista['NumeroDAV'],
        Titulo: dav.lista['Titulo'],
        Senha: dav.lista['Senha'],
        DataEmissao: dav.lista['DataEmissao'],
        ClienteCodigo: dav.lista['ClienteCodigo'],
        ClienteNome: dav.lista['ClienteNome'],
        VendedorCodigo: dav.lista['VendedorCodigo'],
        // O contrato de 2026-09-14 publica a chave, mas **sempre vazia**
        // (atribuição comentada em `DpCheckout_GetDavs`, pendência 57).
        VendedorNome: '',
        ValorTotal: dav.lista['ValorTotal'],
      }))
      .filter((dav) => {
        const alvo = `${String(dav['NumeroDAV'])} ${String(dav['Titulo'])} ${String(
          dav['ClienteNome'],
        )}`.toUpperCase();
        if (termo !== '' && !alvo.includes(termo)) {
          return false;
        }
        // Comparação lexicográfica é exata em `YYYY-MM-DD`, o formato do
        // contrato — não há fuso nem parsing envolvido.
        const emissao = String(dav['DataEmissao']);
        if (de !== '' && emissao < de) {
          return false;
        }
        if (ate !== '' && emissao > ate) {
          return false;
        }
        return true;
      });

    // Real: flat na raiz, sem envelope `CheckoutListaDAVs` nem `messages`
    // (AD-165); `DAV` primeiro, ausente quando nada casa, `TotalPaginas: 0`.
    return reply.send(respostaPaginada('DAV', todos, request.query));
  });

  app.get<{ Querystring: { Numerodav?: string } }>(
    '/ApiCentriumOAuth/GetDav',
    async (request, reply) => {
      contadores.negocio += 1;
      contadores.getDav += 1;

      // Recusa de negócio: **HTTP 200**, envelope zerado e a razão em
      // `messages` — é assim que o ERP real responde (medido em 2026-09-16 nos
      // DAVs 1000000001760 e 3000000000179; AD-239). Até então este mock
      // devolvia `409`/`404` com `{ error }`, um caminho de código que o ERP
      // nunca exercita: quem lê a recusa é `recusaDeNegocio`, sobre o corpo
      // 2xx, e a suíte não cobria isso.
      if (config.davJaFaturado) {
        return reply
          .type('application/json')
          .send(recusaDeDocumento('Erro - DAV já faturado por outro operador.'));
      }

      const dav = DAVS[request.query.Numerodav ?? ''];
      if (dav === undefined) {
        return reply
          .type('application/json')
          .send(
            recusaDeDocumento('Erro - Item Liberado: S, Pedido Liberado: S, Status Digitação: N'),
          );
      }

      // Sucesso vai FLAT, sem envelope e sem `messages` — medido ao vivo em
      // 2026-09-11 e contrário ao que este mock afirmava (AD-165 só tinha
      // observado recusas deste endpoint). O envelope acompanha a presença de
      // `messages`: com a coleção vazia sobra um parâmetro de saída e o GeneXus
      // serializa o SDT na raiz. Reproduzir aqui o envelope que o ERP não manda
      // foi o que escondeu da suíte a reprovação de toda importação de DAV.
      return reply.send(dav.documento);
    },
  );

  /**
   * `GetListaNFCes` — listagem de rascunhos suspensos (feature 011).
   *
   * Reaproveita os mesmos documentos sintéticos de `DAVS`: um rascunho de NFCe
   * e um DAV têm o mesmo corpo (AD-057), e duplicar as fixtures faria as duas
   * janelas do E2E divergirem sem motivo.
   *
   * Diferenças de contrato em relação a `ListaDAVs`, todas reais: a linha traz
   * `Serie` e o operador; `Emissao` é `date-time`, não `date`. A busca casa só
   * nome de cliente e de vendedor, nunca o número, que é o que o
   * `DataProvider` do ERP faz. `Datainicial`/`Datafinal` filtram pelo dia da
   * `Emissao` (AD-237).
   *
   * Devolve **flat na raiz, sem envelope**, como o ERP real (AD-165).
   */
  app.get<{
    Querystring: {
      Txtbusca?: string;
      Datainicial?: string;
      Datafinal?: string;
      Pagina?: string;
      Tamanhopagina?: string;
    };
  }>('/ApiCentriumOAuth/GetListaNFCes', async (request, reply) => {
    contadores.negocio += 1;

    const termo = (request.query.Txtbusca ?? '').toUpperCase();
    // Período (AD-237): o ERP de 2026-09-14 filtra por dia de emissão. Sem as
    // datas o ERP real usa os últimos 90 dias; aqui, sem elas, não há piso —
    // o Checkout manda sempre as duas.
    const de = request.query.Datainicial ?? '';
    const ate = request.query.Datafinal ?? '';

    const todos = Object.values(DAVS)
      .map((dav) => ({
        // Forma medida no preview de 2026-09-14 (AD-235): `NumeroRascunho`
        // número nativo, `Serie`, e código/nome em campos separados — no lugar
        // das antigas strings `"<código> - <NOME>"`.
        NumeroRascunho: Number(dav.documento['NumeroRascunho']),
        Serie: String(dav.documento['CadSerieNFCe']),
        ClienteCodigo: dav.lista['ClienteCodigo'],
        ClienteNome: dav.lista['ClienteNome'],
        VendedorCodigo: dav.lista['VendedorCodigo'],
        VendedorNome: dav.lista['VendedorNome'],
        OperadorCodigo: 3,
        OperadorNome: 'CAIXA 03',
        // `date-time`: o dia sai da emissão relativa do DAV, a hora é fixa —
        // nada no Checkout depende dela além da exibição.
        Emissao: `${String(dav.lista['DataEmissao'])}T14:32:00`,
        Total: String(dav.lista['ValorTotal']),
      }))
      .filter((rascunho) => {
        const dia = rascunho.Emissao.slice(0, 10);
        if ((de !== '' && dia < de) || (ate !== '' && dia > ate)) {
          return false;
        }
        if (termo === '') {
          return true;
        }
        return `${String(rascunho.ClienteNome)} ${String(rascunho.VendedorNome)}`
          .toUpperCase()
          .includes(termo);
      });

    // `Rascunho` primeiro, ausente quando nada casa, `TotalPaginas: 0`.
    return reply.send(respostaPaginada('Rascunho', todos, request.query));
  });

  /**
   * `CarregarNFCe` — ao contrário de `GetDav`/`FaturarNFCe`, devolve o
   * documento **flat na raiz, sem envelope** (confirmado ao vivo 2026-09-04):
   * mesma SDT (`CheckoutFaturarNFCe`), padrão de wrapper diferente. Reaproveita
   * os documentos sintéticos de `DAVS` — procurando pelo par
   * `NumeroRascunho` + série, que é o que `GetListaNFCes` publica (AD-057,
   * AD-235). O parâmetro continua se chamando `Numeronota`.
   *
   * **Mas devolve o documento pago**, e é aqui que ele deixa de ser um DAV
   * (AD-169). Os dois têm o mesmo corpo, e a diferença não é de shape: um DAV é
   * documento **pendente de cobrança**, e por isso o `documento` compartilhado
   * nasce com `FormasDePagamento: []`; um rascunho de NFCe é uma venda que foi
   * **cobrada e depois suspensa**, e volta ao caixa já paga. Até 2026-09-04 o
   * mock devolvia os dois iguais, e a consequência é que nenhum E2E jamais
   * exercitou uma retomada de verdade: o carrinho não congelava, e o
   * congelamento é o comportamento central da venda retomada.
   */
  app.get<{ Querystring: { Numeronota?: string; Serienota?: string } }>(
    '/ApiCentriumOAuth/CarregarNFCe',
    async (request, reply) => {
      contadores.negocio += 1;

      const numeroPedido = Number(request.query.Numeronota);
      const seriePedida = request.query.Serienota ?? '';
      // Sem série o ERP recusa com envelope + `messages` (preview 2026-09-14).
      if (seriePedida.trim() === '') {
        return reply.send({
          OutCheckoutFaturarNFCe: { clienteCodigo: '0', NumeroRascunho: '0', Log: '' },
          messages: [{ Id: '9999', Type: 1, Description: 'Série é obrigatório' }],
        });
      }
      const documento = Object.values(DAVS)
        .map((dav) => dav.documento)
        .find(
          (doc) =>
            Number(doc['NumeroRascunho']) === numeroPedido &&
            String(doc['CadSerieNFCe']) === seriePedida,
        );

      if (documento === undefined) {
        // Mesma forma da recusa de `GetDav` (AD-239): 200 + envelope zerado.
        return reply
          .type('application/json')
          .send(recusaDeDocumento('Rascunho não encontrado ou já faturado.'));
      }

      return reply.send({ ...documento, FormasDePagamento: [quitacaoDoRascunho(documento)] });
    },
  );

  /**
   * `ValidaTicketDevolucao` — espelha os desfechos de `PValidaTicketNFCe` com a
   * ação `'validar'` (lido na KB em 2026-09-04): situação 2 é válido e devolve
   * `DevValTot`; 1 ("ainda não emitido"), 3 ("já utilizado no documento N"), 4
   * ("vencido") e inexistente devolvem `Valido: false` com a mensagem do ERP.
   *
   * O ticket **não** é marcado como usado aqui: isso é a ação `'emitir'`, que só
   * acontece no faturamento. É justamente por isso que validar o mesmo código
   * duas vezes devolveria "válido" nas duas, e a guarda contra repetição precisa
   * viver no Checkout.
   */
  app.post<{ Body: { ticketDevolucao?: string } }>(
    '/ApiCentriumOAuth/ValidaTicketDevolucao',
    async (request, reply) => {
      contadores.negocio += 1;

      const ticket = (request.body.ticketDevolucao ?? '').trim().toUpperCase();
      const conhecido = TICKETS_DEVOLUCAO[ticket];

      // Real: três campos soltos e **nenhuma `messages`** — o mock acrescentava
      // um `messages: []` que o ERP não manda. `ValorTicket` (`double`) vem
      // número nativo aqui, não string: são parâmetros de saída soltos, não um
      // SDT (chamada ao vivo 2026-09-11 com ticket inexistente devolveu
      // `{"ValorTicket":0,"Valido":false,"Mensagem":"Ticket de devolução: … inválido !"}`,
      // e a mensagem deste mock já era exatamente essa).
      if (conhecido === undefined) {
        return reply.send({
          ValorTicket: 0,
          Valido: false,
          Mensagem: `Ticket de devolução: ${ticket} inválido !`,
        });
      }

      return reply.send(conhecido);
    },
  );

  /**
   * `GerarPIX` (feature 009, `contracts/erp-pix-api.md` §1).
   *
   * Devolve o `TrnGUID` que o **cliente** enviou — é assim que o ERP real se
   * comporta: o GUID é gerado no Checkout e é a chave primária lógica da
   * transação (`research.md` D3). O mock ecoá-lo é o que deixa o E2E provar que
   * o mesmo valor volta como `FormaPixGUID` no retrato de `FaturarNFCe`.
   *
   * Os dois base64 são sintéticos: `Trnbase64image` não é um JPEG de verdade —
   * o navegador só precisa aceitar a `data:` URL — e `Trnbase64text` é o "copia
   * e cola" fictício codificado, para o `atob` do mapper ter o que decodificar.
   */
  app.post<{ Body: Record<string, unknown> }>(
    '/ApiCentriumOAuth/GerarPIX',
    async (request, reply) => {
      contadores.negocio += 1;
      contadores.gerarPix += 1;

      // Corpo **plano** desde AD-251 — não há mais `SDTCentriumPag_Post` para
      // desembrulhar, e o cliente não manda `TrnGUID`.
      const enviado = request.body ?? {};
      ultimoGerarPix = enviado;

      // **O mock gera o GUID**, como o ERP real: um valor estável por chamada,
      // devolvido na resposta e usado como chave do relógio de status. Ecoar o
      // que o cliente mandou esconderia justamente a regressão de AD-251.
      sequenciaGuidPix += 1;
      const guid = `e2e0${String(sequenciaGuidPix).padStart(4, '0')}-0000-4000-8000-000000000001`;
      // Marca o nascimento da cobrança — é o zero da contagem que `StatusPIX`
      // usa quando não há roteiro de transições configurado.
      geracoesPix.set(guid, Date.now());

      return reply.send({
        TrnGUID: guid,
        Trnbase64text: Buffer.from(COPIA_E_COLA_PIX, 'utf8').toString('base64'),
        Trnbase64image: QRCODE_PIX_BASE64,
        messages: [],
      });
    },
  );

  /**
   * `StatusPIX` (`contracts/erp-pix-api.md` §2), com **dois modos**.
   *
   * 1. **Roteiro** — `config.statusPixTransicoes` não vazio: consome uma posição
   *    por consulta, repetindo a última. É o modo dos cenários automatizados,
   *    que precisam desenhar "pendente, pendente, pago" (ou "pendente, recusado")
   *    sem depender do relógio real.
   * 2. **Relógio** — roteiro vazio, que é o **padrão** desde 2026-09-04 (pedido
   *    do usuário, item 4): a cobrança fica `'G'` (Aguardando Pagamento) e só
   *    vira `'P'` (Pagamento Recebido) `atrasoPagamentoPixMs` depois de ter sido
   *    gerada. É o que reproduz, na stack local, o intervalo entre o QR Code
   *    aparecer e o cliente de fato pagar — antes disto o PIX nascia praticamente
   *    pago e o estado de espera era invisível ao teste manual.
   *
   * Um `Trnguid` que este mock nunca gerou responde `'G'`: sem registro de
   * nascimento não há o que contar, e responder "pago" a uma cobrança
   * desconhecida seria o pior desfecho possível.
   */
  app.get<{ Querystring: { Trnguid?: string } }>(
    '/ApiCentriumOAuth/StatusPIX',
    async (request, reply) => {
      contadores.negocio += 1;
      const consultasAnteriores = contadores.statusPix;
      contadores.statusPix += 1;

      if (config.statusPixTransicoes.length > 0) {
        const indice = Math.min(consultasAnteriores, config.statusPixTransicoes.length - 1);
        return reply.send({
          StatusTransacao: config.statusPixTransicoes[indice] ?? 'G',
          messages: [],
        });
      }

      const geradoEm = geracoesPix.get(request.query.Trnguid ?? '');

      // Cobrança que este mock nunca gerou: o ERP responde `StatusTransacao`
      // **vazio** com a mensagem de erro, não `'G'` — medido ao vivo
      // 2026-09-11 com um GUID nulo. O `'G'` que o mock devolvia aqui era um
      // desfecho que produção não produz, e escondia do Checkout o único caso em
      // que a sondagem consulta uma transação que o ERP não conhece.
      if (geradoEm === undefined) {
        return reply.send({
          StatusTransacao: '',
          messages: [{ Id: '', Type: 1, Description: 'Transação não localizada' }],
        });
      }

      const pago = Date.now() - geradoEm >= config.atrasoPagamentoPixMs;

      return reply.send({
        StatusTransacao: pago ? 'P' : 'G',
        messages: [],
      });
    },
  );

  app.get('/ApiCentriumOAuth/GetStatusSistema', async (_request, reply) => {
    contadores.negocio += 1;
    contadores.getStatusSistema += 1;
    // Real: devolve `{"Status": 0}`, não o inteiro solto que o YAML sugere —
    // confirmado ao vivo 2026-09-04 (AD-165). `0` = nada mudou desde a
    // última captura (AD-088).
    return reply.send({ Status: 0 });
  });

  // Qualquer outro endpoint de negócio, consumido via proxy `/api/erp/*`.
  app.all('/ApiCentriumOAuth/*', async (_request, reply) => {
    contadores.negocio += 1;

    if (config.respostas401Pendentes > 0) {
      config.respostas401Pendentes -= 1;
      return reply.code(401).send({ error: 'token expirado' });
    }

    return reply.send({ ok: true, chamadas: contadores.negocio });
  });

  await app.listen({ port: porta, host: '127.0.0.1' });
  return app;
}

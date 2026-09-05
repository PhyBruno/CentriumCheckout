import Fastify, { type FastifyInstance } from 'fastify';

/**
 * ERP mockado para os cenários do `quickstart.md`.
 *
 * Só existe em teste: reproduz `POST /oauth/access_token` e
 * `GET /ApiCentriumOAuth/*` no dialeto REAL confirmado ao vivo contra o ERP
 * em 2026-09-04 (AD-165) — não o shape "de livro" do YAML/`contracts/`, que
 * diverge em pontos importantes: a maioria dos endpoints de leitura devolve o
 * SDT flat na raiz (sem o envelope `Get<X>Output.<Campo>` que o YAML sugere e
 * sem `messages`); `GetDav`/`FaturarNFCe` são exceção e mantêm envelope +
 * `messages`; campos `double`/muitos `int64` vêm como string JSON, não
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
   * Devolve `2xx` **sem** `PDFImpressao`/`XMLImpressao` — é como o ERP recusa
   * uma NFCe não autorizada; o Checkout trata como falha de negócio, nunca como
   * sucesso parcial (`contracts/faturamento-api.md`).
   */
  faturarSemNotaFiscal: boolean;
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
}

export interface ContadoresMockErp {
  token: number;
  getSessao: number;
  negocio: number;
  getProduto: number;
  getListaProdutos: number;
  faturarNFCe: number;
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
  faturarSemNotaFiscal: false,
  davJaFaturado: false,
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
};

const CONTADORES_ZERADOS: ContadoresMockErp = {
  token: 0,
  getSessao: 0,
  negocio: 0,
  getProduto: 0,
  getListaProdutos: 0,
  faturarNFCe: 0,
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
    VendedorCodigo: String(21), // int64
    VendedorNome: 'Mariana Alves',
    VendedorCGC: '000.111.222-33',
    VendedorFone: '55 47 99900-0021',
  },
  {
    VendedorCodigo: String(14), // int64
    VendedorNome: 'Marcos Pereira',
    VendedorCGC: '111.222.333-44',
    VendedorFone: '55 47 99900-0014',
  },
  {
    VendedorCodigo: String(8), // int64
    VendedorNome: 'Marta Souza',
    VendedorCGC: '222.333.444-55',
    VendedorFone: '55 47 99900-0008',
  },
];

const CLIENTES: Record<string, Record<string, unknown>> = {
  '12298023980': {
    Empresa: String(1), // int64
    CodCliente: String(1255), // int64
    nome: 'CLIENTE VAREJO',
    cpf: '12298023980',
    email: 'varejo@example.test',
    celular: '55 47 99988-2100',
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
    celular: '55 47 92238-670',
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
    celular: '55 47 90000-3100',
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
    celular: '14 9119-8027',
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
        vendedorCodigo: String(12),
        CondicaoPagamentoCodigo: String(1),
        NumeroNota: String(90210),
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
         * Antes havia aqui uma forma com `FormaMeioPagtoNFe: '01'`, o código
         * numérico da NFe. O domínio `Nfce_FormaPagto` do ERP usa **nomes**
         * (AD-023, os mesmos que `GetSessao` devolve no catálogo abaixo), então
         * `importarFormasDePagamento` a descartava como meio desconhecido, com
         * aviso no console: a forma nunca chegou à venda em nenhum momento da
         * história desta suíte.
         *
         * Corrigi-la para `'Dinheiro'` teria efeito colateral: um pagamento
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
        ValorTotal: String(20.0), // double
      },
      documento: {
        Empresa: 1,
        SuspenderOuFaturar: '',
        clienteCodigo: String(1255),
        vendedorCodigo: String(8),
        CondicaoPagamentoCodigo: String(1),
        NumeroNota: String(90211),
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
 * `FormaMeioPagtoNFe: 'Dinheiro'`, e nunca o código numérico `'01'` da NFe: o
 * domínio `Nfce_FormaPagto` do ERP usa nomes (AD-023), os mesmos do catálogo de
 * `GetSessao` acima, e com o código numérico `importarFormasDePagamento`
 * descarta a forma em silêncio — foi assim que a chegada do pagamento à venda
 * ficou sem verificação até 2026-09-04.
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
    FormaMeioPagtoNFe: 'Dinheiro',
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
    ListaPrecoDefault: String(3), // int64
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
    // Domain `EnumTipoCodigoProduto` da KB GeneXus (`ControlValues`):
    // `''`→Código Reduzido, `'D'`→Código de Barras, `'C'`→Referência,
    // `'P'`→Codigo de Barra Pesavel. `'D'` aqui é só o cenário padrão dos
    // testes — não é o único valor válido.
    UsuarioTipoCodigoProduto: 'D',
    ClienteDefaultCodigo: String(1), // int64
    ClienteDefaultNome: 'CONSUMIDOR FINAL',
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
        CondicaoPrazo: String(0), // double
        CondicaoMinimoEntrada: String(0), // double
        CondicaoDesconto: String(0), // double
        CondicaoDescontoMaximo: String(0), // double
        CondicaoFormasDePagamento: [
          {
            FormaCodigo: String(1), // int64
            FormaDescricao: 'DINHEIRO',
            FormaEntrada: 'S',
            FormaMeioPagtoNFe: 'Dinheiro',
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
            FormaDescricao: 'CARTAO CREDITO',
            FormaEntrada: 'N',
            FormaMeioPagtoNFe: 'CartaoCredito',
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
            FormaDescricao: 'VALE DEVOLUCAO',
            FormaEntrada: 'N',
            FormaMeioPagtoNFe: 'Outros',
            FormaIntegracaoCartao: ' ',
            FormaTipoTransacaoTEF: '',
            FormaFpgUtiCar: 'VDV',
          },
          {
            FormaCodigo: String(3), // int64
            FormaDescricao: 'PIX',
            FormaEntrada: 'S',
            FormaMeioPagtoNFe: 'Pix',
            FormaIntegracaoCartao: ' ',
            FormaTipoTransacaoTEF: '',
            FormaFpgUtiCar: '',
          },
          {
            FormaCodigo: String(5), // int64
            FormaDescricao: 'CARTAO DEBITO',
            FormaEntrada: 'N',
            FormaMeioPagtoNFe: 'CartaoDebito',
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
            FormaDescricao: 'PIX ESTATICO',
            FormaEntrada: 'S',
            FormaMeioPagtoNFe: 'PixEstatico',
            FormaIntegracaoCartao: ' ',
            FormaTipoTransacaoTEF: '',
            FormaFpgUtiCar: '',
          },
          {
            FormaCodigo: String(7), // int64
            FormaDescricao: 'VALE ALIMENTACAO',
            FormaEntrada: 'N',
            FormaMeioPagtoNFe: 'ValeAlimentacao',
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
        CondicaoPrazo: String(30), // double
        CondicaoMinimoEntrada: String(20), // double
        CondicaoDesconto: String(0), // double
        CondicaoDescontoMaximo: String(5), // double
        CondicaoFormasDePagamento: [
          {
            FormaCodigo: String(8), // int64
            FormaDescricao: 'BOLETO 30 DIAS',
            FormaEntrada: 'S',
            FormaMeioPagtoNFe: 'BoletoBancario',
            FormaIntegracaoCartao: ' ',
            FormaTipoTransacaoTEF: '',
            FormaFpgUtiCar: '',
          },
          {
            FormaCodigo: String(9), // int64
            FormaDescricao: 'CREDIARIO LOJA',
            FormaEntrada: 'S',
            FormaMeioPagtoNFe: 'CreditoLoja',
            FormaIntegracaoCartao: ' ',
            FormaTipoTransacaoTEF: '',
            FormaFpgUtiCar: '',
          },
          {
            FormaCodigo: String(10), // int64
            FormaDescricao: 'DUPLICATA MERCANTIL',
            FormaEntrada: 'N',
            FormaMeioPagtoNFe: 'DuplicataMercantil',
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
    ConfiguracoesTEF: { TEFAtivo: false },
    ConfiguracoesPIX: {
      UtilizaCentriumPAG: config.pixAtivo,
      MinimoPix: String(config.minimoPix), // double
      TempoEspera: String(10), // int64
    },
  };
}

/** Corpo de `FaturarNFCeInput` recebido na última chamada, para inspeção. */
interface EnvelopeFaturarNFCe {
  readonly CheckoutFaturarNFCe?: Record<string, unknown>;
}

export async function criarMockErp(porta: number): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  let config: ConfigMockErp = { ...CONFIG_PADRAO };
  let contadores: ContadoresMockErp = { ...CONTADORES_ZERADOS };
  /** Cadastro criado por `PostCliente` durante o teste — descartado no reset. */
  const documentosCriados: string[] = [];
  let ultimoRetratoFaturado: Record<string, unknown> | null = null;
  /** Último `SDTCentriumPag_Post` recebido — deixa o E2E afirmar `TrnValor`, pagador etc. */
  let ultimoGerarPix: Record<string, unknown> | null = null;
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

  /** Último retrato recebido — deixa o E2E afirmar `NumeroNota`, `Log` etc. */
  app.get('/__mock/ultimo-faturamento', async () => ({ retrato: ultimoRetratoFaturado }));

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

  app.get('/ApiCentriumOAuth/GetSessao', async (_request, reply) => {
    contadores.getSessao += 1;

    if (config.statusGetSessao !== 200) {
      return reply.code(config.statusGetSessao).send({ error: 'falha simulada' });
    }

    return reply.send(payloadGetSessao(config));
  });

  app.get<{ Querystring: { Codigoproduto?: string } }>(
    '/ApiCentriumOAuth/GetProduto',
    async (request, reply) => {
      contadores.negocio += 1;
      contadores.getProduto += 1;

      if (config.respostas401Pendentes > 0) {
        config.respostas401Pendentes -= 1;
        return reply.code(401).send({ error: 'token expirado' });
      }

      const produto = CATALOGO[request.query.Codigoproduto ?? ''];
      if (produto === undefined) {
        return reply.code(404).send({ error: 'produto não encontrado' });
      }

      // Real: flat na raiz, sem envelope `Produto` nem `messages` — confirmado
      // ao vivo 2026-09-04 (AD-165).
      return reply.send(produto);
    },
  );

  app.get<{ Querystring: { Txtbusca?: string; Pagina?: string; Tamanhopagina?: string } }>(
    '/ApiCentriumOAuth/GetListaProdutos',
    async (request, reply) => {
      contadores.negocio += 1;
      contadores.getListaProdutos += 1;

      const termo = (request.query.Txtbusca ?? '').toUpperCase();
      // A lista devolve **apenas** os campos de exibição/seleção: sem
      // `PrecoVenda` e sem `ProdutoPesavelEditavel`, como o contrato real
      // (AD-091). É o que impede o Checkout de montar a linha daqui.
      const todos = Object.values(CATALOGO)
        .filter((produto) => String(produto['Descricao']).toUpperCase().includes(termo))
        .map((produto) => ({
          CodigoProduto: produto['CodigoProduto'],
          Descricao: produto['Descricao'],
          Referencia: produto['Referencia'],
          CodigoBarras: produto['CodigoBarras'],
          UDM: produto['UDM'],
        }));

      // Pagina de verdade em cima de `Pagina`/`Tamanhopagina` (achado da revisão
      // de código): a versão anterior ignorava os dois parâmetros e sempre
      // devolvia tudo numa página só, o que nunca exercitava "Anterior"/
      // "Próxima" contra um comportamento parecido com o do ERP real — só o
      // teste unitário (com o hook mockado) cobria paginação de fato.
      const registrosPorPagina = Math.max(1, Number(request.query.Tamanhopagina) || 20);
      const totalPaginas = Math.max(1, Math.ceil(todos.length / registrosPorPagina));
      const paginaPedida = Math.max(1, Number(request.query.Pagina) || 1);
      const paginaAtual = Math.min(paginaPedida, totalPaginas);
      const inicio = (paginaAtual - 1) * registrosPorPagina;
      const produtos = todos.slice(inicio, inicio + registrosPorPagina);

      // Real: campos soltos na raiz, sem envelope `ListaProdutos` nem
      // `messages` — e `PaginaAtual`/`RegistrosPorPagina`/`TotalRegistros`/
      // `TotalPaginas` vêm como número nativo mesmo (não string), confirmado
      // ao vivo 2026-09-04 — só os campos de negócio (`double`/`int64` do
      // item em si) vêm como string.
      return reply.send({
        PaginaAtual: paginaAtual,
        RegistrosPorPagina: registrosPorPagina,
        TotalRegistros: todos.length,
        TotalPaginas: totalPaginas,
        Produtos: produtos,
      });
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

      // `SUSPENDER` não emite documento fiscal: a resposta volta sem
      // `NotaFiscal`, como o ERP real (`contracts/faturamento-api.md`).
      const suspendendo = retrato?.['SuspenderOuFaturar'] === 'SUSPENDER';
      const notaFiscal =
        suspendendo || config.faturarSemNotaFiscal
          ? {}
          : {
              NotaFiscal: {
                NumeroNota: String(9001), // int64
                SerieNota: '1',
                Autorizada: 'S',
                ErroCodigo: 0,
                ErroMensagem: '',
                XMLImpressao: XML_SINTETICO,
                PDFImpressao: PDF_SINTETICO,
              },
            };

      return reply.send({
        OutCheckoutFaturarNFCe: { ...(retrato ?? {}), ...notaFiscal },
        messages: config.faturarSemNotaFiscal
          ? [{ Id: 'ERR', Type: 1, Description: 'NFCe não autorizada pela SEFAZ (sintético).' }]
          : [],
      });
    },
  );

  app.get<{ Querystring: { CPFCNPJ?: string; CodCliente?: string } }>(
    '/ApiCentriumOAuth/GetCliente',
    async (request, reply) => {
      contadores.negocio += 1;
      contadores.getCliente += 1;

      const porDocumento = CLIENTES[request.query.CPFCNPJ ?? ''];
      const porCodigo =
        request.query.CodCliente === undefined
          ? undefined
          : Object.values(CLIENTES).find(
              (cliente) => String(cliente['CodCliente']) === request.query.CodCliente,
            );

      const cliente = porDocumento ?? porCodigo;
      if (cliente === undefined) {
        // `PCheckout_GetCliente` **não** responde 404 quando não acha: devolve
        // `200` com o SDT recém-criado, campos no default (código-fonte da KB,
        // 2026-09-03). O mock reproduz isso — o 404 anterior era otimista e
        // escondia o caminho real do Checkout. Real: flat na raiz, sem
        // envelope `Cliente` nem `messages` (confirmado ao vivo 2026-09-04).
        return reply.send({
          Empresa: String(0), // int64
          CodCliente: String(0), // int64
          nome: '',
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
          ListaPreco: String(0), // int64
        });
      }

      return reply.send(cliente);
    },
  );

  app.get<{ Querystring: { Txtbusca?: string; Pagina?: string; Tamanhopagina?: string } }>(
    '/ApiCentriumOAuth/GetListaClientes',
    async (request, reply) => {
      contadores.negocio += 1;
      contadores.getListaClientes += 1;

      const termo = (request.query.Txtbusca ?? '').toUpperCase();
      // Sem `DescontoConvenio`/`CodigoConvenio`/`email`, como o contrato real —
      // é o que obriga o Checkout a resolver por `GetCliente` antes de associar
      // (`research.md` D1). E sem nenhum campo de status (AD-093).
      const todos = Object.values(CLIENTES)
        // `where CliTip = 'F'` — `PCheckout_ClientesLista` filtra pessoa física
        // no próprio ERP, nos dois `For Each` (itens e contagem), verificado no
        // código-fonte da KB em 2026-09-03. O mock não tinha esse filtro e
        // devolvia PJ na busca, um cenário que produção nunca produz.
        .filter((cliente) => cliente['CliTip'] !== 'J')
        .filter(
          (cliente) =>
            String(cliente['nome']).toUpperCase().includes(termo) ||
            String(cliente['cpf']).includes(termo),
        )
        .map((cliente) => ({
          ClienteCodigo: cliente['CodCliente'], // int64 — já string na fonte
          ClienteNome: cliente['nome'],
          CPF: cliente['cpf'],
          // `ListaPreco` é `int32` **nesta** SDT (`SDTCheckoutListaClientes`),
          // diferente do `int64` de `ClienteCheckout` (GetCliente singular) —
          // dois campos homônimos, tipos diferentes no próprio contrato do
          // ERP. Confirmado ao vivo 2026-09-04: vem número nativo aqui.
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

      const registrosPorPagina = Math.max(1, Number(request.query.Tamanhopagina) || 20);
      const totalPaginas = Math.max(1, Math.ceil(todos.length / registrosPorPagina));
      const paginaPedida = Math.max(1, Number(request.query.Pagina) || 1);
      const paginaAtual = Math.min(paginaPedida, totalPaginas);
      const inicio = (paginaAtual - 1) * registrosPorPagina;

      // Real: flat na raiz, sem envelope `ListaClientes` nem `messages`
      // (confirmado ao vivo 2026-09-04, AD-165).
      return reply.send({
        PaginaAtual: paginaAtual,
        RegistrosPorPagina: registrosPorPagina,
        TotalRegistros: todos.length,
        TotalPaginas: totalPaginas,
        Clientes: todos.slice(inicio, inicio + registrosPorPagina),
      });
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
      const termo = (request.query.Txtbusca ?? '').toUpperCase();
      const todos = VENDEDORES.filter((vendedor) =>
        String(vendedor['VendedorNome']).toUpperCase().includes(termo),
      );

      const registrosPorPagina = Math.max(1, Number(request.query.Tamanhopagina) || 20);
      const totalPaginas = Math.max(1, Math.ceil(todos.length / registrosPorPagina));
      const paginaPedida = Math.max(1, Number(request.query.Pagina) || 1);
      const paginaAtual = Math.min(paginaPedida, totalPaginas);
      const inicio = (paginaAtual - 1) * registrosPorPagina;

      // Real: flat na raiz, sem envelope `CheckoutListaVendedores` nem
      // `messages` — `GetListaVendedores` está na lista de AD-165.
      return reply.send({
        PaginaAtual: paginaAtual,
        RegistrosPorPagina: registrosPorPagina,
        TotalRegistros: todos.length,
        TotalPaginas: totalPaginas,
        Vendedores: todos.slice(inicio, inicio + registrosPorPagina),
      });
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
        return reply
          .code(400)
          .send([{ Id: 'ERR', Type: 1, Description: 'CPF obrigatório (sintético).' }]);
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

      return reply.send([]);
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
      .map((dav) => dav.lista)
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

    const registrosPorPagina = Math.max(1, Number(request.query.Tamanhopagina) || 20);
    const totalPaginas = Math.max(1, Math.ceil(todos.length / registrosPorPagina));
    const paginaPedida = Math.max(1, Number(request.query.Pagina) || 1);
    const paginaAtual = Math.min(paginaPedida, totalPaginas);
    const inicio = (paginaAtual - 1) * registrosPorPagina;

    // Real: flat na raiz, sem envelope `CheckoutListaDAVs` nem `messages`
    // (confirmado ao vivo 2026-09-04, AD-165).
    return reply.send({
      PaginaAtual: paginaAtual,
      RegistrosPorPagina: registrosPorPagina,
      TotalRegistros: todos.length,
      TotalPaginas: totalPaginas,
      DAV: todos.slice(inicio, inicio + registrosPorPagina),
    });
  });

  app.get<{ Querystring: { Numerodav?: string } }>(
    '/ApiCentriumOAuth/GetDav',
    async (request, reply) => {
      contadores.negocio += 1;
      contadores.getDav += 1;

      // Documento já faturado por outra sessão: o ERP recusa e o Checkout só
      // reage (D7/AD-052) — não há lock do lado do Checkout (`FR-010`).
      if (config.davJaFaturado) {
        return reply.code(409).send({ error: 'DAV já faturado' });
      }

      const dav = DAVS[request.query.Numerodav ?? ''];
      if (dav === undefined) {
        return reply.code(404).send({ error: 'DAV não encontrado' });
      }

      // `GetDav` MANTÉM o envelope + `messages` — ao contrário das listas,
      // confirmado ao vivo 2026-09-04: o padrão acompanha exatamente quem
      // devolve `messages` de verdade (AD-165).
      return reply.send({ OutCheckoutFaturarNFCe: dav.documento, messages: [] });
    },
  );

  /**
   * `GetListaNFCes` — listagem de rascunhos suspensos (feature 011).
   *
   * Reaproveita os mesmos documentos sintéticos de `DAVS`: um rascunho de NFCe
   * e um DAV têm o mesmo corpo (AD-057), e duplicar as fixtures faria as duas
   * janelas do E2E divergirem sem motivo.
   *
   * Três diferenças de contrato em relação a `ListaDAVs`, todas reais:
   * `Vendedor` e `Operador` vêm por **nome** (a limitação de AD-095 é de
   * `ListaDAVs`); `Emissao` é `date-time`, não `date`; e não há filtro de
   * período — a janela de tempo é fixa no servidor (`research.md` D1). A busca
   * casa só nome de cliente e de vendedor, nunca o número da nota, que é o que
   * o `DataProvider` do ERP faz.
   *
   * Devolve **flat na raiz, sem envelope**, como o ERP real (AD-165).
   */
  app.get<{
    Querystring: { Txtbusca?: string; Pagina?: string; Tamanhopagina?: string };
  }>('/ApiCentriumOAuth/GetListaNFCes', async (request, reply) => {
    contadores.negocio += 1;

    const termo = (request.query.Txtbusca ?? '').toUpperCase();

    const todos = Object.values(DAVS)
      .map((dav) => ({
        NumeroNota: Number(dav.documento['NumeroNota']),
        Cliente: String(dav.lista['ClienteNome']),
        // Nome sintético: o vendedor tem só código no documento (AD-095), mas
        // este contrato devolve o nome — o mock precisa fornecer um.
        Vendedor: `VENDEDOR ${String(dav.lista['VendedorCodigo'])}`,
        Operador: 'CAIXA 03',
        // `date-time`: o dia sai da emissão relativa do DAV, a hora é fixa —
        // nada no Checkout depende dela além da exibição.
        Emissao: `${String(dav.lista['DataEmissao'])}T14:32:00`,
        Total: String(dav.lista['ValorTotal']),
      }))
      .filter((rascunho) => {
        if (termo === '') {
          return true;
        }
        return `${rascunho.Cliente} ${rascunho.Vendedor}`.toUpperCase().includes(termo);
      });

    const registrosPorPagina = Math.max(1, Number(request.query.Tamanhopagina) || 20);
    const totalPaginas = Math.max(1, Math.ceil(todos.length / registrosPorPagina));
    const paginaPedida = Math.max(1, Number(request.query.Pagina) || 1);
    const paginaAtual = Math.min(paginaPedida, totalPaginas);
    const inicio = (paginaAtual - 1) * registrosPorPagina;

    return reply.send({
      PaginaAtual: paginaAtual,
      RegistrosPorPagina: registrosPorPagina,
      TotalRegistros: todos.length,
      TotalPaginas: totalPaginas,
      Rascunho: todos.slice(inicio, inicio + registrosPorPagina),
    });
  });

  /**
   * `CarregarNFCe` — ao contrário de `GetDav`/`FaturarNFCe`, devolve o
   * documento **flat na raiz, sem envelope** (confirmado ao vivo 2026-09-04):
   * mesma SDT (`CheckoutFaturarNFCe`), padrão de wrapper diferente. Reaproveita
   * os documentos sintéticos de `DAVS` — procurando por `NumeroNota`, que é o
   * mesmo em `ListaNFCes`/`GetListaNFCes` (AD-057).
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
      const documento = Object.values(DAVS)
        .map((dav) => dav.documento)
        .find((doc) => Number(doc['NumeroNota']) === numeroPedido);

      if (documento === undefined) {
        return reply.code(404).send({ error: 'NFCe não encontrada' });
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

      if (conhecido === undefined) {
        return reply.send({
          ValorTicket: 0,
          Valido: false,
          Mensagem: `Ticket de devolução: ${ticket} inválido !`,
          messages: [],
        });
      }

      return reply.send({ ...conhecido, messages: [] });
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
  app.post<{ Body: { SDTCentriumPag_Post?: Record<string, unknown> } }>(
    '/ApiCentriumOAuth/GerarPIX',
    async (request, reply) => {
      contadores.negocio += 1;
      contadores.gerarPix += 1;

      const enviado = request.body.SDTCentriumPag_Post ?? {};
      ultimoGerarPix = enviado;

      const guid = String(enviado['TrnGUID'] ?? '');
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
      const pago = geradoEm !== undefined && Date.now() - geradoEm >= config.atrasoPagamentoPixMs;

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

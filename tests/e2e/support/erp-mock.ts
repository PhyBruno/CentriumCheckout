import Fastify, { type FastifyInstance } from 'fastify';

/**
 * ERP mockado para os cenários do `quickstart.md`.
 *
 * Só existe em teste: reproduz `POST /oauth/access_token` e
 * `GET /ApiCentriumOAuth/*` nos formatos de `contracts/session-bff-api.md`, com
 * endpoints de controle (`/__mock/*`) para os testes configurarem falhas e
 * inspecionarem se o ERP chegou a ser chamado.
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
  listaDavs: number;
  getDav: number;
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
  listaDavs: 0,
  getDav: 0,
};

/**
 * Tickets de devolução sintéticos, um por desfecho de `PValidaTicketNFCe`.
 * `ValorTicket` em reais, como o ERP devolve (`double`).
 */
const TICKETS_DEVOLUCAO: Record<
  string,
  { ValorTicket: number; Valido: boolean; Mensagem: string }
> = {
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
const XML_SINTETICO = '<NFe><infNFe>sintetico</infNFe></NFe>';

/**
 * Catálogo sintético da feature 003 — um produto por fluxo de
 * `ProdutoPesavelEditavel` (`research.md`, D7). Preços em reais, como o ERP
 * devolve; `QtdMinimaPreco` em unidades inteiras.
 */
const CATALOGO: Record<string, Record<string, unknown>> = {
  '001234': {
    CodigoProduto: '001234',
    Descricao: 'PRODUTO COM FAIXA 500G',
    Referencia: 'REF-FAIXA',
    CodigoBarras: '7890000000001',
    PrecoVenda: 10.0,
    PrecoVenda1: 10.0,
    PrecoVenda2: 9.0,
    PrecoVenda3: 0,
    PrecoVenda4: 0,
    PrecoVenda5: 0,
    QtdMinimaPreco2: 5,
    QtdMinimaPreco3: 0,
    QtdMinimaPreco4: 0,
    QtdMinimaPreco5: 0,
    UDM: 'UN',
    ProdutoPesavelEditavel: '',
  },
  '002000': {
    CodigoProduto: '002000',
    Descricao: 'PRODUTO PESAVEL KG',
    Referencia: 'REF-PESAVEL',
    CodigoBarras: '7890000000002',
    PrecoVenda: 10.0,
    PrecoVenda1: 10.0,
    PrecoVenda2: 0,
    PrecoVenda3: 0,
    PrecoVenda4: 0,
    PrecoVenda5: 0,
    QtdMinimaPreco2: 0,
    QtdMinimaPreco3: 0,
    QtdMinimaPreco4: 0,
    QtdMinimaPreco5: 0,
    UDM: 'KG',
    ProdutoPesavelEditavel: 'S',
  },
  '003000': {
    CodigoProduto: '003000',
    Descricao: 'PRODUTO EDITAVEL',
    Referencia: 'REF-EDITAVEL',
    CodigoBarras: '7890000000003',
    PrecoVenda: 20.0,
    PrecoVenda1: 20.0,
    PrecoVenda2: 0,
    PrecoVenda3: 0,
    PrecoVenda4: 0,
    PrecoVenda5: 0,
    QtdMinimaPreco2: 0,
    QtdMinimaPreco3: 0,
    QtdMinimaPreco4: 0,
    QtdMinimaPreco5: 0,
    UDM: 'UN',
    ProdutoPesavelEditavel: 'E',
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
const CLIENTES: Record<string, Record<string, unknown>> = {
  '12298023980': {
    Empresa: 1,
    CodCliente: 1255,
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
    CodigoConvenio: 0,
    NomeConvenio: '',
    DescontoConvenio: 0,
    ListaPreco: 3,
    CliTip: 'F',
  },
  '89554068000': {
    Empresa: 1,
    CodCliente: 2538,
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
    CodigoConvenio: 7,
    NomeConvenio: 'CONVENIO EXEMPLO',
    DescontoConvenio: 10,
    ListaPreco: 7,
    CliTip: 'F',
  },
  'CONSUMIDOR-FINAL': {
    Empresa: 1,
    CodCliente: 1,
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
    CodigoConvenio: 0,
    NomeConvenio: '',
    DescontoConvenio: 0,
    ListaPreco: 3,
    CliTip: 'F',
  },
  'SEM-DOCUMENTO': {
    Empresa: 1,
    CodCliente: 3100,
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
    CodigoConvenio: 0,
    NomeConvenio: '',
    DescontoConvenio: 0,
    ListaPreco: 3,
    CliTip: 'F',
  },
  '52059715000113': {
    Empresa: 1,
    CodCliente: 2209,
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
    CodigoConvenio: 0,
    NomeConvenio: '',
    DescontoConvenio: 0,
    ListaPreco: 3,
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
        ClienteCodigo: 2538,
        ClienteNome: 'CLIENTE CONVENIADO',
        VendedorCodigo: 12,
        ValorTotal: 15.54,
      },
      documento: {
        Empresa: 1,
        SuspenderOuFaturar: '',
        clienteCodigo: 2538,
        vendedorCodigo: 12,
        CondicaoPagamentoCodigo: 1,
        NumeroNota: 90210,
        CadSerieNFCe: '1',
        UsuarioCodigo: 42,
        Log: '',
        produtos: [
          {
            sequencial: 1,
            codigoProduto: '001234',
            quantidade: 2,
            precoUnitario: 7.77,
            DescontoPercentual: 0,
            DescontoValor: 0,
            UDM: 'UN',
            ValorBruto: 15.54,
            ValorTotal: 15.54,
          },
        ],
        FormasDePagamento: [
          {
            FormaCodigo: 1,
            FormaMeioPagtoNFe: '01',
            FormaValor: 15.54,
            FormaIntegracaoCartao: '',
            FormaFpgUtiCar: '',
            FormaEntrada: '',
            TEFidentificacao: 0,
            TEFCNPJ: '',
            TEFBandeira: '',
            TEFNumeroAutorizacao: '',
            TEFTipoIntegracao: '',
            FormaPixGUID: '',
            TicketDevolucao: '',
          },
        ],
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
        ValorTotal: 20.0,
      },
      documento: {
        Empresa: 1,
        SuspenderOuFaturar: '',
        clienteCodigo: 1255,
        vendedorCodigo: 8,
        CondicaoPagamentoCodigo: 1,
        NumeroNota: 90211,
        CadSerieNFCe: '1',
        UsuarioCodigo: 42,
        Log: '',
        produtos: [
          {
            sequencial: 1,
            codigoProduto: '003000',
            quantidade: 1,
            precoUnitario: 20.0,
            DescontoPercentual: 0,
            DescontoValor: 0,
            UDM: 'UN',
            ValorBruto: 20.0,
            ValorTotal: 20.0,
          },
        ],
        FormasDePagamento: [],
      },
    },
  };

function payloadGetSessao(config: ConfigMockErp): unknown {
  return {
    SessaoUsuario: {
      UsuarioCodigo: 42,
      UsuarioNome: 'Operador de Teste',
      // Identidade exibida na barra superior — sintética, como o resto do mock.
      EmpresaNomeFantasia: 'Organizações Tabajara',
      EmpresaRazaoSocial: 'Tabajara Comércio Ltda',
      caixa: 3,
      TipoPreco: config.tipoPreco,
      CadMaqCod: config.cadMaqCod,
      ListaPrecoDefault: 3,
      CenarioPagamento: '["1;DINHEIRO;1;A VISTA;Dinheiro à vista;True;F6"]',
      QtdMinCharParaConsulta: 3,
      // Domain `EnumTipoCodigoProduto` da KB GeneXus (`ControlValues`):
      // `''`→Código Reduzido, `'D'`→Código de Barras, `'C'`→Referência,
      // `'P'`→Codigo de Barra Pesavel. `'D'` aqui é só o cenário padrão dos
      // testes — não é o único valor válido.
      UsuarioTipoCodigoProduto: 'D',
      ClienteDefaultCodigo: 1,
      ClienteDefaultNome: 'CONSUMIDOR FINAL',
      VendedorCodigo: 42,
      VendedorNome: 'Mariana Alves',
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
       * `FormaFpgUtiCar = 'VDV'` identifica a **forma de vale devolução**, e
       * nada mais: as demais formas o trazem vazio, como um cadastro comum. A
       * leitura anterior (vazio = "aceita vale", AD-048) foi revogada em
       * 2026-09-04.
       */
      CondicoesDePagamento: [
        {
          CondicaoCodigo: 1,
          CondicaoDescricao: 'A VISTA',
          CondicaoPrazo: 0,
          CondicaoMinimoEntrada: 0,
          CondicaoDesconto: 0,
          CondicaoDescontoMaximo: 0,
          CondicaoFormasDePagamento: [
            {
              FormaCodigo: 1,
              FormaDescricao: 'DINHEIRO',
              FormaEntrada: 'S',
              FormaMeioPagtoNFe: 'Dinheiro',
              FormaIntegracaoCartao: '',
              FormaTipoTransacaoTEF: '',
              FormaFpgUtiCar: '',
            },
            {
              FormaCodigo: 2,
              FormaDescricao: 'CARTAO CREDITO',
              FormaEntrada: 'N',
              FormaMeioPagtoNFe: 'CartaoCredito',
              FormaIntegracaoCartao: '1',
              FormaTipoTransacaoTEF: 'CREDITO',
              FormaFpgUtiCar: '',
            },
            {
              // A forma de **vale devolução**: é `FpgUtiCar = 'VDV'` que a
              // identifica, e escolhê-la abre a janela do ticket em vez do
              // campo de valor.
              FormaCodigo: 4,
              FormaDescricao: 'VALE DEVOLUCAO',
              FormaEntrada: 'N',
              FormaMeioPagtoNFe: 'Outros',
              FormaIntegracaoCartao: '',
              FormaTipoTransacaoTEF: '',
              FormaFpgUtiCar: 'VDV',
            },
            {
              FormaCodigo: 3,
              FormaDescricao: 'PIX',
              FormaEntrada: 'S',
              FormaMeioPagtoNFe: 'Pix',
              FormaIntegracaoCartao: '',
              FormaTipoTransacaoTEF: '',
              FormaFpgUtiCar: '',
            },
          ],
        },
      ],
      /**
       * TEF e PIX **desligados** no cenário padrão do E2E: é o que mantém todas
       * as formas roteando para `NENHUMA` (`resolverIntegracao`), de modo que um
       * pagamento aplicado já entra `APROVADO` sem depender das features 009/010,
       * que não existem. É também o cenário do fluxo dourado do quickstart
       * ("desktop com `tefAtivo: false`").
       */
      ConfiguracoesTEF: { TEFAtivo: false },
      ConfiguracoesPIX: { UtilizaCentriumPAG: false, MinimoPix: 0, TempoEspera: 10 },
    },
    messages: [],
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

  await app.register(import('@fastify/formbody'));

  // --- Controle do mock (só teste) ---------------------------------------
  app.post('/__mock/reset', async () => {
    config = { ...CONFIG_PADRAO };
    contadores = { ...CONTADORES_ZERADOS };
    ultimoRetratoFaturado = null;
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

  // --- Contrato do ERP ----------------------------------------------------
  app.post('/oauth/access_token', async (_request, reply) => {
    contadores.token += 1;

    if (config.statusToken !== 200) {
      return reply.code(config.statusToken).send({ error: 'invalid_grant' });
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

      return reply.send({ Produto: produto, messages: [] });
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

      return reply.send({
        ListaProdutos: {
          PaginaAtual: paginaAtual,
          RegistrosPorPagina: registrosPorPagina,
          TotalRegistros: todos.length,
          TotalPaginas: totalPaginas,
          Produtos: produtos,
        },
        messages: [],
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
                NumeroNota: 9001,
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
        // escondia o caminho real do Checkout.
        return reply.send({
          Cliente: {
            Empresa: 0,
            CodCliente: 0,
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
            CodigoConvenio: 0,
            NomeConvenio: '',
            DescontoConvenio: 0,
            ListaPreco: 0,
          },
          messages: [],
        });
      }

      return reply.send({ Cliente: cliente, messages: [] });
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
          ClienteCodigo: cliente['CodCliente'],
          ClienteNome: cliente['nome'],
          CPF: cliente['cpf'],
          ListaPreco: cliente['ListaPreco'],
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

      return reply.send({
        ListaClientes: {
          PaginaAtual: paginaAtual,
          RegistrosPorPagina: registrosPorPagina,
          TotalRegistros: todos.length,
          TotalPaginas: totalPaginas,
          Clientes: todos.slice(inicio, inicio + registrosPorPagina),
        },
        messages: [],
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
        Empresa: enviado['Empresa'],
        CodCliente: 9000 + contadores.postCliente,
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
        CodigoConvenio: 0,
        NomeConvenio: '',
        DescontoConvenio: 0,
        ListaPreco: 0,
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

    return reply.send({
      CheckoutListaDAVs: {
        PaginaAtual: paginaAtual,
        RegistrosPorPagina: registrosPorPagina,
        TotalRegistros: todos.length,
        TotalPaginas: totalPaginas,
        DAV: todos.slice(inicio, inicio + registrosPorPagina),
      },
      messages: [],
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

      return reply.send({ OutCheckoutFaturarNFCe: dav.documento, messages: [] });
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

  app.get('/ApiCentriumOAuth/GetStatusSistema', async (_request, reply) => {
    contadores.negocio += 1;
    contadores.getStatusSistema += 1;
    // `0` = nada mudou desde a última captura (AD-088).
    return reply.send(0);
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

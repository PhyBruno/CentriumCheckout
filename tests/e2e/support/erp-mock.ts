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
}

export interface ContadoresMockErp {
  token: number;
  getSessao: number;
  negocio: number;
  getProduto: number;
  getListaProdutos: number;
}

const CONFIG_PADRAO: ConfigMockErp = {
  statusToken: 200,
  statusGetSessao: 200,
  respostas401Pendentes: 0,
  cadMaqCod: 'PDV01',
  tipoPreco: 1,
};

const CONTADORES_ZERADOS: ContadoresMockErp = {
  token: 0,
  getSessao: 0,
  negocio: 0,
  getProduto: 0,
  getListaProdutos: 0,
};

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

function payloadGetSessao(config: ConfigMockErp): unknown {
  return {
    SessaoUsuario: {
      UsuarioCodigo: 42,
      UsuarioNome: 'Operador de Teste',
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
    },
    messages: [],
  };
}

export async function criarMockErp(porta: number): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  let config: ConfigMockErp = { ...CONFIG_PADRAO };
  let contadores: ContadoresMockErp = { ...CONTADORES_ZERADOS };

  await app.register(import('@fastify/formbody'));

  // --- Controle do mock (só teste) ---------------------------------------
  app.post('/__mock/reset', async () => {
    config = { ...CONFIG_PADRAO };
    contadores = { ...CONTADORES_ZERADOS };
    return { ok: true };
  });

  app.post<{ Body: Partial<ConfigMockErp> }>('/__mock/config', async (request) => {
    config = { ...config, ...request.body };
    return { ok: true, config };
  });

  app.get('/__mock/calls', async () => contadores);

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

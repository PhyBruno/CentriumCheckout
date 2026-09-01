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
}

export interface ContadoresMockErp {
  token: number;
  getSessao: number;
  negocio: number;
}

const CONFIG_PADRAO: ConfigMockErp = {
  statusToken: 200,
  statusGetSessao: 200,
  respostas401Pendentes: 0,
  cadMaqCod: 'PDV01',
};

function payloadGetSessao(config: ConfigMockErp): unknown {
  return {
    SessaoUsuario: {
      UsuarioCodigo: 42,
      UsuarioNome: 'Operador de Teste',
      TipoPreco: 1,
      CadMaqCod: config.cadMaqCod,
      ListaPrecoDefault: 3,
      CenarioPagamento: '["1;DINHEIRO;1;A VISTA;Dinheiro à vista;True;F6"]',
    },
    messages: [],
  };
}

export async function criarMockErp(porta: number): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  let config: ConfigMockErp = { ...CONFIG_PADRAO };
  let contadores: ContadoresMockErp = { token: 0, getSessao: 0, negocio: 0 };

  await app.register(import('@fastify/formbody'));

  // --- Controle do mock (só teste) ---------------------------------------
  app.post('/__mock/reset', async () => {
    config = { ...CONFIG_PADRAO };
    contadores = { token: 0, getSessao: 0, negocio: 0 };
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

import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import { loadEnv } from '../../../../src/server/config/env';
import { ENV_DA_ENTRADA } from '../../../support/entradaCifrada';
import {
  criarCifradorDeSessao,
  SESSION_COOKIE_NAME,
  type SessaoOperador,
} from '../../../../src/server/session/cookie';
import { registrarRotaBootstrap } from '../../../../src/server/routes/bootstrap';
import { registroBootstrapDe } from '../../../support/sessao';

/**
 * `recursos.descontoCapaNoErp` no bootstrap (017, US4, T052, `research.md`
 * D11): a chave do BFF chega ao cliente pelo único canal de partida que existe,
 * e entra no hash do ETag — ligá-la descarta o cache do Dexie sozinha.
 *
 * Todos os valores são sintéticos.
 */

const SESSION_SECRET = 'segredo-sintetico-de-teste-com-32+'.padEnd(32, '-');
const cifrador = criarCifradorDeSessao(SESSION_SECRET);

const SESSAO: SessaoOperador = {
  access_token: 'token-sintetico',
  tenant: 'acme',
  client_id: 'id-sintetico',
  client_secret: 'segredo-sintetico',
  username: 'operador.teste',
  password: 'senha-sintetica',
  Repository: 'repo-sintetico',
  codigoEmpresa: '1',
  usuarioCodigo: '147',
};

function envCom(chave: 'true' | 'false') {
  return loadEnv({
    baseDomain: 'apps.example.test',
    ...ENV_DA_ENTRADA,
    SESSION_SECRET,
    NODE_ENV: 'test',
    SERVE_STATIC_CLIENT: 'false',
    DESCONTO_CAPA_NO_ERP: chave,
  });
}

let app: FastifyInstance;

async function carregarBootstrap(chave: 'true' | 'false', ifNoneMatch?: string) {
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify(registroBootstrapDe().SessaoUsuario), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );

  app = Fastify();
  void app.register(fastifyCookie);
  registrarRotaBootstrap(app, { env: envCom(chave), cifrador, fetchImpl });

  return app.inject({
    method: 'GET',
    url: '/api/bootstrap',
    cookies: { [SESSION_COOKIE_NAME]: cifrador.cifrar(SESSAO) },
    ...(ifNoneMatch === undefined ? {} : { headers: { 'if-none-match': ifNoneMatch } }),
  });
}

afterEach(async () => {
  await app.close();
});

describe('GET /api/bootstrap — recursos', () => {
  it.each([
    ['false', false],
    ['true', true],
  ] as const)('chave "%s" chega como descontoCapaNoErp %s', async (chave, esperado) => {
    const resposta = await carregarBootstrap(chave);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json<{ recursos: unknown }>().recursos).toEqual({
      descontoCapaNoErp: esperado,
    });
  });

  it('o ETag muda junto com a chave, e o 304 não reaproveita a versão anterior', async () => {
    const desligada = await carregarBootstrap('false');
    const etagDesligada = String(desligada.headers['etag']);
    await app.close();

    const ligada = await carregarBootstrap('true', etagDesligada);

    expect(String(ligada.headers['etag'])).not.toBe(etagDesligada);
    expect(ligada.statusCode).toBe(200);
  });
});

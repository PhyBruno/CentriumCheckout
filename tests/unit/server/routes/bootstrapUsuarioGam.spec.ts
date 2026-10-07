import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import { loadEnv } from '../../../../src/server/config/env';
import {
  criarCifradorDeSessao,
  SESSION_COOKIE_NAME,
  type SessaoOperador,
} from '../../../../src/server/session/cookie';
import { registrarRotaBootstrap } from '../../../../src/server/routes/bootstrap';
import { registroBootstrapDe } from '../../../support/sessao';

/**
 * `UsuarioGAM` no bootstrap (feature 010, AD-267).
 *
 * O `GetSessao` real não publica o campo (medido no C0 em 2026-10-07), mas o
 * cliente decide por ele se recusa o TEF antes da rede (FR-014). Quem o sabe é o
 * cookie, preenchido com o `user_guid` do OAuth — e `/api/bootstrap` o devolve ao
 * cliente em `SessaoUsuario.UsuarioGAM`.
 *
 * Todos os valores são sintéticos.
 */

const SESSION_SECRET = 'segredo-sintetico-de-teste-com-32+'.padEnd(32, '-');
const GUID_DO_COOKIE = '0f2c9a4e-0000-4000-8000-000000000000';
const GUID_DO_ERP = '11111111-0000-4000-8000-000000000000';

const env = loadEnv({
  baseDomain: 'apps.example.test',
  validationKey: 'chave-de-validacao-sintetica',
  SESSION_SECRET,
  NODE_ENV: 'test',
  SERVE_STATIC_CLIENT: 'false',
});

const cifrador = criarCifradorDeSessao(SESSION_SECRET);

const SESSAO_BASE: SessaoOperador = {
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

let app: FastifyInstance;

/** `GetSessao` real: campos **na raiz**, sem o envelope `SessaoUsuario`. */
async function carregarBootstrap(
  sessao: SessaoOperador,
  corpoDoErp: Record<string, unknown> = registroBootstrapDe().SessaoUsuario,
) {
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify(corpoDoErp), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );

  app = Fastify();
  void app.register(fastifyCookie);
  registrarRotaBootstrap(app, { env, cifrador, fetchImpl });

  return app.inject({
    method: 'GET',
    url: '/api/bootstrap',
    cookies: { [SESSION_COOKIE_NAME]: cifrador.cifrar(sessao) },
  });
}

afterEach(async () => {
  await app.close();
});

describe('GET /api/bootstrap — UsuarioGAM do cookie', () => {
  it('devolve o UsuarioGAM do cookie quando o GetSessao não o publica', async () => {
    const resposta = await carregarBootstrap({ ...SESSAO_BASE, usuarioGam: GUID_DO_COOKIE });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json<{ SessaoUsuario: Record<string, unknown> }>().SessaoUsuario).toMatchObject(
      { UsuarioGAM: GUID_DO_COOKIE },
    );
  });

  it('o valor do cookie vale mais que o do ERP — é o do operador autenticado', async () => {
    const resposta = await carregarBootstrap(
      { ...SESSAO_BASE, usuarioGam: GUID_DO_COOKIE },
      { ...registroBootstrapDe().SessaoUsuario, UsuarioGAM: GUID_DO_ERP },
    );

    expect(resposta.json<{ SessaoUsuario: Record<string, unknown> }>().SessaoUsuario).toMatchObject(
      { UsuarioGAM: GUID_DO_COOKIE },
    );
  });

  it('a resposta é privada: cache compartilhado não pode servi-la a outro operador', async () => {
    const resposta = await carregarBootstrap({ ...SESSAO_BASE, usuarioGam: GUID_DO_COOKIE });

    expect(resposta.headers['cache-control']).toBe('private, no-cache');
    expect(resposta.headers['etag']).toBeDefined();
  });

  it('sem UsuarioGAM no cookie, o campo segue ausente — o operador sem TEF', async () => {
    const resposta = await carregarBootstrap(SESSAO_BASE);

    expect(resposta.statusCode).toBe(200);
    expect(
      resposta.json<{ SessaoUsuario: Record<string, unknown> }>().SessaoUsuario,
    ).not.toHaveProperty('UsuarioGAM');
  });

  it('sem UsuarioGAM no cookie, o que o ERP publicar passa como está', async () => {
    const resposta = await carregarBootstrap(SESSAO_BASE, {
      ...registroBootstrapDe().SessaoUsuario,
      UsuarioGAM: GUID_DO_ERP,
    });

    expect(resposta.json<{ SessaoUsuario: Record<string, unknown> }>().SessaoUsuario).toMatchObject(
      { UsuarioGAM: GUID_DO_ERP },
    );
  });
});

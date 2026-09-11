import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import { loadEnv } from '../../../../src/server/config/env';
import { criarCifradorDeSessao, SESSION_COOKIE_NAME } from '../../../../src/server/session/cookie';
import { registrarRotaSessionStart } from '../../../../src/server/routes/session-start';
import { COOKIE_ENTRADA, PARAM_ERRO_ACESSO } from '../../../../src/shared/erroAcesso';

/**
 * O operador entra na sessão junto com o resto (AD-224).
 *
 * `usuarioCodigo` é o único campo de `SessaoOperador` que não vem no redirect do
 * ERP: é perguntado a `GetSessao` logo depois da troca OAuth e cifrado no mesmo
 * cookie. É ele que o proxy usa para descartar o `UsuarioCodigo` que o navegador
 * manda no retrato da venda.
 *
 * Todos os valores são sintéticos.
 */

const SESSION_SECRET = 'segredo-sintetico-de-teste-com-32+'.padEnd(32, '-');
const VALIDATION_KEY = 'chave-de-validacao-sintetica';

const env = loadEnv({
  baseDomain: 'apps.example.test',
  validationKey: VALIDATION_KEY,
  SESSION_SECRET,
  NODE_ENV: 'test',
  SERVE_STATIC_CLIENT: 'false',
});

const cifrador = criarCifradorDeSessao(SESSION_SECRET);

/** Redirect completo do ERP — nenhuma credencial real. */
const ENTRADA = new URLSearchParams({
  tenant: 'tenantdemo',
  client_id: 'id-sintetico',
  client_secret: 'segredo-sintetico',
  username: 'operador.teste',
  password: 'senha-sintetica',
  Repository: 'repo-sintetico',
  codigoEmpresa: '1',
  validationKey: VALIDATION_KEY,
}).toString();

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

let app: FastifyInstance;
let fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>;

/** Primeira chamada é a troca OAuth; a segunda, o `GetSessao`. */
function montarApp(respostaGetSessao: Response): void {
  fetchImpl = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(respostaJson({ access_token: 'token-sintetico' }))
    .mockResolvedValueOnce(respostaGetSessao);

  app = Fastify();
  void app.register(fastifyCookie);
  registrarRotaSessionStart(app, { env, cifrador, fetchImpl });
}

function entrar() {
  return app.inject({ method: 'GET', url: `/session/start?${ENTRADA}` });
}

/** O valor de um `Set-Cookie` da resposta, pelo nome. */
function cookieDaResposta(resposta: Awaited<ReturnType<typeof entrar>>, nome: string) {
  return resposta.cookies.find((cookie) => cookie.name === nome);
}

beforeEach(() => {
  montarApp(respostaJson({ UsuarioCodigo: '147' }));
});

afterEach(async () => {
  await app.close();
});

describe('GET /session/start — o operador entra na sessão', () => {
  it('grava o UsuarioCodigo do ERP no cookie cifrado', async () => {
    const resposta = await entrar();

    expect(resposta.statusCode).toBe(302);
    const sessao = cifrador.decifrar(cookieDaResposta(resposta, SESSION_COOKIE_NAME)?.value);
    expect(sessao?.usuarioCodigo).toBe('147');
    expect(sessao?.username).toBe('operador.teste');
  });

  it('pergunta ao ERP com o token recém-emitido, depois da troca OAuth', async () => {
    await entrar();

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[1]?.[0])).toContain(
      '/ApiCentriumOAuth/GetSessao?Empresa=1&Login=operador.teste',
    );
  });

  it('recusa a entrada quando o ERP não identifica o operador', async () => {
    // Sessão sem operador não pode existir: toda NFCe que ela emitisse sairia
    // sem dizer quem a emitiu.
    montarApp(respostaJson({ UsuarioCodigo: '0' }));

    const resposta = await entrar();

    expect(resposta.headers['location']).toContain(PARAM_ERRO_ACESSO);
    expect(cookieDaResposta(resposta, SESSION_COOKIE_NAME)).toBeUndefined();
  });

  it('recusa a entrada quando o GetSessao falha, e apaga a marca de entrada', async () => {
    montarApp(new Response('', { status: 500 }));

    const resposta = await entrar();

    expect(resposta.headers['location']).toContain(PARAM_ERRO_ACESSO);
    expect(cookieDaResposta(resposta, SESSION_COOKIE_NAME)).toBeUndefined();
    // A marca de "houve entrada válida" é limpa, para que a falha seguinte não
    // ofereça "Tentar novamente" para uma entrada que nunca foi aceita.
    expect(cookieDaResposta(resposta, COOKIE_ENTRADA)?.value).toBe('');
  });
});

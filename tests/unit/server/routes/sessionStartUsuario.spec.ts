import { afterEach, describe, expect, it, vi } from 'vitest';
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
 * As duas etapas repetem sozinhas quando o ERP está **indisponível** — só o BFF
 * tem as credenciais do redirect para tentar de novo, porque elas são
 * descartadas antes de o navegador chegar à SPA (FR-001/SC-001).
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

const TOKEN_OK = () => respostaJson({ access_token: 'token-sintetico' });
const SESSAO_OK = () => respostaJson({ UsuarioCodigo: '147' });

let app: FastifyInstance;
let fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>;

/**
 * Encaminha por URL, e não por ordem de chamada: com repetição, o número de
 * chamadas varia, e um mock posicional quebraria a cada ajuste de tentativas.
 */
function montarApp(
  respostas: {
    token?: () => Response;
    getSessao?: () => Response;
  } = {},
): void {
  const token = respostas.token ?? TOKEN_OK;
  const getSessao = respostas.getSessao ?? SESSAO_OK;

  fetchImpl = vi.fn<typeof fetch>().mockImplementation((entrada) => {
    const url = String(entrada);
    return Promise.resolve(url.includes('/oauth/access_token') ? token() : getSessao());
  });

  app = Fastify();
  void app.register(fastifyCookie);
  // Sem espera real: o que importa é **quantas** tentativas houve, não o relógio.
  registrarRotaSessionStart(app, {
    env,
    cifrador,
    fetchImpl,
    esperar: async () => undefined,
  });
}

/** Uma sequência de respostas, uma por tentativa; a última se repete. */
function emSequencia(...respostas: readonly (() => Response)[]): () => Response {
  let indice = 0;
  return () => {
    const resposta = respostas[Math.min(indice, respostas.length - 1)];
    indice += 1;
    return (resposta ?? SESSAO_OK)();
  };
}

function entrar() {
  return app.inject({ method: 'GET', url: `/session/start?${ENTRADA}` });
}

function cookieDaResposta(resposta: Awaited<ReturnType<typeof entrar>>, nome: string) {
  return resposta.cookies.find((cookie) => cookie.name === nome);
}

/** Quantas chamadas foram para `GetSessao` — as demais são a troca OAuth. */
function chamadasGetSessao(): number {
  return fetchImpl.mock.calls.filter(([url]) => String(url).includes('/GetSessao')).length;
}

afterEach(async () => {
  await app.close();
});

describe('GET /session/start — o operador entra na sessão', () => {
  it('grava o UsuarioCodigo do ERP no cookie cifrado', async () => {
    montarApp();

    const resposta = await entrar();

    expect(resposta.statusCode).toBe(302);
    const sessao = cifrador.decifrar(cookieDaResposta(resposta, SESSION_COOKIE_NAME)?.value);
    expect(sessao?.usuarioCodigo).toBe('147');
    expect(sessao?.username).toBe('operador.teste');
  });

  it('pergunta ao ERP com o token recém-emitido, depois da troca OAuth', async () => {
    montarApp();

    await entrar();

    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain('/oauth/access_token');
    expect(String(fetchImpl.mock.calls[1]?.[0])).toContain(
      '/ApiCentriumOAuth/GetSessao?Empresa=1&Login=operador.teste',
    );
  });
});

describe('ERP indisponível na entrada — o BFF tenta de novo sozinho', () => {
  it('um GetSessao que falha e depois responde ainda vira sessão', async () => {
    montarApp({ getSessao: emSequencia(() => new Response('', { status: 502 }), SESSAO_OK) });

    const resposta = await entrar();

    expect(resposta.statusCode).toBe(302);
    expect(
      cifrador.decifrar(cookieDaResposta(resposta, SESSION_COOKIE_NAME)?.value),
    ).not.toBeNull();
    expect(chamadasGetSessao()).toBe(2);
  });

  it('uma troca de token que falha com 5xx e depois responde ainda vira sessão', async () => {
    montarApp({ token: emSequencia(() => new Response('', { status: 503 }), TOKEN_OK) });

    const resposta = await entrar();

    expect(resposta.statusCode).toBe(302);
    expect(
      cifrador.decifrar(cookieDaResposta(resposta, SESSION_COOKIE_NAME)?.value),
    ).not.toBeNull();
  });

  it('falha de rede também é repetida', async () => {
    let tentativas = 0;
    fetchImpl = vi.fn<typeof fetch>().mockImplementation((entrada) => {
      const url = String(entrada);
      if (url.includes('/oauth/access_token')) {
        return Promise.resolve(TOKEN_OK());
      }
      tentativas += 1;
      return tentativas === 1
        ? Promise.reject(new TypeError('fetch failed'))
        : Promise.resolve(SESSAO_OK());
    });

    app = Fastify();
    void app.register(fastifyCookie);
    registrarRotaSessionStart(app, { env, cifrador, fetchImpl, esperar: async () => undefined });

    const resposta = await entrar();

    expect(resposta.statusCode).toBe(302);
    expect(tentativas).toBe(2);
  });

  it('esgotadas as tentativas, recusa a entrada', async () => {
    montarApp({ getSessao: () => new Response('', { status: 500 }) });

    const resposta = await entrar();

    expect(resposta.headers['location']).toContain(PARAM_ERRO_ACESSO);
    expect(cookieDaResposta(resposta, SESSION_COOKIE_NAME)).toBeUndefined();
    // A marca de "houve entrada válida" é limpa: sem sessão, "Tentar novamente"
    // não teria o que recarregar.
    expect(cookieDaResposta(resposta, COOKIE_ENTRADA)?.value).toBe('');
    expect(chamadasGetSessao()).toBe(3);
  });
});

describe('recusa do ERP não é indisponibilidade — não se repete', () => {
  it('login não resolvido (UsuarioCodigo 0) recusa na primeira resposta', async () => {
    // O ERP respondeu; repetir devolveria exatamente o mesmo veredito.
    montarApp({ getSessao: () => respostaJson({ UsuarioCodigo: '0' }) });

    const resposta = await entrar();

    expect(resposta.headers['location']).toContain(PARAM_ERRO_ACESSO);
    expect(cookieDaResposta(resposta, SESSION_COOKIE_NAME)).toBeUndefined();
    expect(chamadasGetSessao()).toBe(1);
  });

  it('credencial recusada (401) não gasta tentativa de autenticação a mais', async () => {
    montarApp({ token: () => new Response('', { status: 401 }) });

    const resposta = await entrar();

    expect(resposta.headers['location']).toContain(PARAM_ERRO_ACESSO);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import { loadEnv } from '../../../../src/server/config/env';
import {
  criarCifradorDeSessao,
  SESSION_COOKIE_NAME,
  type SessaoOperador,
} from '../../../../src/server/session/cookie';
import {
  criarUsuarioDaSessao,
  type UsuarioDaSessao,
} from '../../../../src/server/session/usuarioDaSessao';
import {
  corpoComUsuarioDaSessao,
  corpoDeclaraUsuario,
  registrarRotaErpProxy,
} from '../../../../src/server/routes/erp-proxy';

/**
 * O operador do retrato vem da sessão, nunca do navegador.
 *
 * AD-221 pôs `UsuarioCodigo` no corpo de `FaturarNFCe`/`ValidarNFCe`, montado
 * no cliente a partir do bootstrap — um operador autenticado que editasse o
 * payload no DevTools emitiria nota atribuída a outro, que é exatamente a
 * atribuição que AD-221 existe para garantir. O ERP não confere o campo contra
 * o token (item 53 de `.specs/project/PENDENCIES.md`, OWASP A01/A09), então
 * quem confere é o BFF — mesma ideia da reescrita de `Cliente.Empresa`.
 *
 * Todos os valores são sintéticos.
 */

const SESSION_SECRET = 'segredo-sintetico-de-teste-com-32+'.padEnd(32, '-');

const SESSAO: SessaoOperador = {
  access_token: 'token-sintetico',
  tenant: 'tenantdemo',
  client_id: 'id-sintetico',
  client_secret: 'segredo-sintetico',
  username: 'operador.teste',
  password: 'senha-sintetica',
  Repository: 'repo-sintetico',
  codigoEmpresa: '1',
};

const env = loadEnv({
  baseDomain: 'apps.example.test',
  validationKey: 'chave-de-validacao-sintetica',
  SESSION_SECRET,
  NODE_ENV: 'test',
  SERVE_STATIC_CLIENT: 'false',
});

const cifrador = criarCifradorDeSessao(SESSION_SECRET);
const cookieDeSessao = cifrador.cifrar(SESSAO);

/** Retrato com o operador **errado**, como sairia de um DevTools aberto. */
const RETRATO_FORJADO = {
  Empresa: '1',
  SuspenderOuFaturar: 'FATURAR',
  UsuarioCodigo: 999,
  clienteCodigo: 1,
  vendedorCodigo: 21,
};

const OPERADOR_DA_SESSAO = 147;

let app: FastifyInstance;
let fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>;

function montarApp(usuarioDaSessao: UsuarioDaSessao): FastifyInstance {
  const instancia = Fastify();
  void instancia.register(fastifyCookie);
  registrarRotaErpProxy(instancia, { env, cifrador, usuarioDaSessao, fetchImpl });
  return instancia;
}

/** Resolvedor já aquecido, como o `/api/bootstrap` o deixa no fluxo normal. */
function usuarioAquecido(): UsuarioDaSessao {
  const usuarioDaSessao = criarUsuarioDaSessao({ env, fetchImpl });
  usuarioDaSessao.registrar(SESSAO, OPERADOR_DA_SESSAO);
  return usuarioDaSessao;
}

function faturar(corpo: unknown = RETRATO_FORJADO) {
  return app.inject({
    method: 'POST',
    url: '/api/erp/ApiCentriumOAuth/FaturarNFCe',
    cookies: { [SESSION_COOKIE_NAME]: cookieDeSessao },
    payload: corpo as Record<string, unknown>,
  });
}

/** O corpo que de fato saiu para o ERP, já desserializado. */
function corpoEnviadoAoErp(): Record<string, unknown> {
  const init = fetchImpl.mock.calls[0]?.[1];
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

beforeEach(() => {
  fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify({ NotaFiscal: { NumeroNota: 1 } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
});

afterEach(async () => {
  await app.close();
});

describe('UsuarioCodigo forjado no corpo', () => {
  it('é substituído pelo operador da sessão antes de chegar ao ERP', async () => {
    app = montarApp(usuarioAquecido());

    const resposta = await faturar();

    expect(resposta.statusCode).toBe(200);
    expect(corpoEnviadoAoErp()['UsuarioCodigo']).toBe(OPERADOR_DA_SESSAO);
  });

  it('não altera nenhum outro campo do retrato', async () => {
    app = montarApp(usuarioAquecido());

    await faturar();

    const enviado = corpoEnviadoAoErp();
    expect(enviado['SuspenderOuFaturar']).toBe('FATURAR');
    expect(enviado['clienteCodigo']).toBe(1);
    // O vendedor da venda é escolha legítima do operador e continua vindo da
    // tela — é o par de `UsuarioCodigo`, não um substituto (FR-010).
    expect(enviado['vendedorCodigo']).toBe(21);
  });

  it('recusa a chamada quando o operador não pode ser identificado', async () => {
    // Repassar o corpo como veio aceitaria de volta justamente o valor que esta
    // rota existe para descartar.
    app = montarApp({
      registrar: () => undefined,
      resolver: async () => ({ usuarioCodigo: null, sessaoRenovada: null }),
    });

    const resposta = await faturar();

    expect(resposta.statusCode).toBe(502);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('corpo sem o campo passa intocado, sem consultar o operador', async () => {
    const usuarioDaSessao = usuarioAquecido();
    const resolver = vi.spyOn(usuarioDaSessao, 'resolver');
    app = montarApp(usuarioDaSessao);

    await app.inject({
      method: 'POST',
      url: '/api/erp/ApiCentriumOAuth/PostCliente',
      cookies: { [SESSION_COOKIE_NAME]: cookieDeSessao },
      payload: { Cliente: { nome: 'CLIENTE EXEMPLO' } },
    });

    expect(resolver).not.toHaveBeenCalled();
    expect(corpoEnviadoAoErp()).not.toHaveProperty('UsuarioCodigo');
  });

  it('a empresa da sessão continua sendo reescrita junto', async () => {
    app = montarApp(usuarioAquecido());

    await faturar({ ...RETRATO_FORJADO, Cliente: { Empresa: 999, nome: 'X' } });

    const enviado = corpoEnviadoAoErp();
    expect((enviado['Cliente'] as Record<string, unknown>)['Empresa']).toBe(1);
    expect(enviado['UsuarioCodigo']).toBe(OPERADOR_DA_SESSAO);
  });

  it('sem cookie de sessão nem chega a perguntar quem é o operador', async () => {
    app = montarApp(usuarioAquecido());

    const resposta = await app.inject({
      method: 'POST',
      url: '/api/erp/ApiCentriumOAuth/FaturarNFCe',
      payload: RETRATO_FORJADO,
    });

    expect(resposta.statusCode).toBe(401);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('corpoDeclaraUsuario', () => {
  it('reconhece o campo pela presença, não por uma lista de caminhos', () => {
    // Um endpoint novo que passe a mandar o campo entra protegido por
    // construção, em vez de entrar esquecido numa lista.
    expect(corpoDeclaraUsuario({ UsuarioCodigo: 1 })).toBe(true);
    expect(corpoDeclaraUsuario({ UsuarioCodigo: undefined })).toBe(true);
  });

  it('não confunde corpo sem o campo, array, null nem texto cru', () => {
    expect(corpoDeclaraUsuario({ clienteCodigo: 1 })).toBe(false);
    expect(corpoDeclaraUsuario([{ UsuarioCodigo: 1 }])).toBe(false);
    expect(corpoDeclaraUsuario(null)).toBe(false);
    expect(corpoDeclaraUsuario('texto cru')).toBe(false);
  });
});

describe('corpoComUsuarioDaSessao', () => {
  it('não muta o corpo original da requisição', () => {
    corpoComUsuarioDaSessao(RETRATO_FORJADO, OPERADOR_DA_SESSAO);

    expect(RETRATO_FORJADO.UsuarioCodigo).toBe(999);
  });

  it('não inventa o campo em corpo que não o declara', () => {
    const original = { Cliente: { nome: 'X' } };

    expect(corpoComUsuarioDaSessao(original, OPERADOR_DA_SESSAO)).toEqual(original);
  });
});

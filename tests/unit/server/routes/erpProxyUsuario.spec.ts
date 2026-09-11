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
  corpoComUsuarioDaSessao,
  registrarRotaErpProxy,
} from '../../../../src/server/routes/erp-proxy';

/**
 * O operador do retrato vem do cookie, nunca do navegador.
 *
 * AD-221 pôs `UsuarioCodigo` no corpo de `FaturarNFCe`/`ValidarNFCe`, montado
 * no cliente a partir do bootstrap — um operador autenticado que editasse o
 * payload no DevTools emitiria nota atribuída a outro, que é exatamente a
 * atribuição que AD-221 existe para garantir. O ERP não confere o campo contra
 * o token (item 53 de `.specs/project/PENDENCIES.md`, OWASP A01/A09), então
 * quem confere é o BFF: o valor confiável está cifrado no cookie desde
 * `/session/start` (AD-224), como `codigoEmpresa` sempre esteve.
 *
 * Todos os valores são sintéticos.
 */

const SESSION_SECRET = 'segredo-sintetico-de-teste-com-32+'.padEnd(32, '-');

const OPERADOR_DA_SESSAO = '147';

const SESSAO: SessaoOperador = {
  access_token: 'token-sintetico',
  tenant: 'tenantdemo',
  client_id: 'id-sintetico',
  client_secret: 'segredo-sintetico',
  username: 'operador.teste',
  password: 'senha-sintetica',
  Repository: 'repo-sintetico',
  codigoEmpresa: '1',
  usuarioCodigo: OPERADOR_DA_SESSAO,
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

let app: FastifyInstance;
let fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>;

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

  app = Fastify();
  void app.register(fastifyCookie);
  registrarRotaErpProxy(app, { env, cifrador, fetchImpl });
});

afterEach(async () => {
  await app.close();
});

describe('UsuarioCodigo forjado no corpo', () => {
  it('é substituído pelo operador do cookie antes de chegar ao ERP', async () => {
    const resposta = await faturar();

    expect(resposta.statusCode).toBe(200);
    expect(corpoEnviadoAoErp()['UsuarioCodigo']).toBe(147);
  });

  it('não altera nenhum outro campo do retrato', async () => {
    await faturar();

    const enviado = corpoEnviadoAoErp();
    expect(enviado['SuspenderOuFaturar']).toBe('FATURAR');
    expect(enviado['clienteCodigo']).toBe(1);
    // O vendedor da venda é escolha legítima do operador e continua vindo da
    // tela — é o par de `UsuarioCodigo`, não um substituto (FR-010).
    expect(enviado['vendedorCodigo']).toBe(21);
  });

  it('corpo sem o campo passa intocado — o proxy não inventa operador', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/erp/ApiCentriumOAuth/PostCliente',
      cookies: { [SESSION_COOKIE_NAME]: cookieDeSessao },
      payload: { Cliente: { nome: 'CLIENTE EXEMPLO' } },
    });

    expect(corpoEnviadoAoErp()).not.toHaveProperty('UsuarioCodigo');
  });

  it('a empresa da sessão continua sendo reescrita junto', async () => {
    await faturar({ ...RETRATO_FORJADO, Cliente: { Empresa: 999, nome: 'X' } });

    const enviado = corpoEnviadoAoErp();
    expect((enviado['Cliente'] as Record<string, unknown>)['Empresa']).toBe(1);
    expect(enviado['UsuarioCodigo']).toBe(147);
  });

  it('sem cookie de sessão a chamada nem chega ao ERP', async () => {
    const resposta = await app.inject({
      method: 'POST',
      url: '/api/erp/ApiCentriumOAuth/FaturarNFCe',
      payload: RETRATO_FORJADO,
    });

    expect(resposta.statusCode).toBe(401);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('corpoComUsuarioDaSessao', () => {
  it('converte para número — é o tipo do campo no SDT', () => {
    const corpo = corpoComUsuarioDaSessao({ UsuarioCodigo: 999 }, '147') as Record<string, unknown>;

    expect(corpo['UsuarioCodigo']).toBe(147);
  });

  it('não muta o corpo original da requisição', () => {
    corpoComUsuarioDaSessao(RETRATO_FORJADO, OPERADOR_DA_SESSAO);

    expect(RETRATO_FORJADO.UsuarioCodigo).toBe(999);
  });

  it('reescreve pela presença do campo, não por uma lista de caminhos', () => {
    // Um endpoint novo que passe a mandar o campo entra protegido por
    // construção, em vez de entrar esquecido numa lista.
    const original = { Cliente: { nome: 'X' } };

    expect(corpoComUsuarioDaSessao(original, OPERADOR_DA_SESSAO)).toEqual(original);
    expect(corpoComUsuarioDaSessao({ UsuarioCodigo: undefined }, '9')).toEqual({
      UsuarioCodigo: 9,
    });
  });

  it('repassa intacto o que não é objeto — array, null, texto cru', () => {
    expect(corpoComUsuarioDaSessao([{ UsuarioCodigo: 1 }], '9')).toEqual([{ UsuarioCodigo: 1 }]);
    expect(corpoComUsuarioDaSessao(null, '9')).toBeNull();
    expect(corpoComUsuarioDaSessao('texto cru', '9')).toBe('texto cru');
  });

  it('deixa o corpo como está quando o código do cookie não é numérico', () => {
    // Gravar `NaN` no documento fiscal seria pior que o valor que veio.
    const corpo = corpoComUsuarioDaSessao({ UsuarioCodigo: 999 }, 'abc') as Record<string, unknown>;

    expect(corpo['UsuarioCodigo']).toBe(999);
  });
});

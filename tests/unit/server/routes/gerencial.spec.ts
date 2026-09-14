import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { loadEnv } from '../../../../src/server/config/env';
import { buildApp } from '../../../../src/server/index';
import {
  criarCifradorDeSessao,
  SESSION_COOKIE_NAME,
  type SessaoOperador,
} from '../../../../src/server/session/cookie';
import { caminhoDaTelaGerencial } from '../../../../src/server/routes/gerencial';

/**
 * `GET /gerencial/:destino` — o redirect para as telas legadas do ERP.
 *
 * O que estes testes protegem é o motivo de a rota existir no servidor em vez
 * de o React montar a URL: `baseDomain` é variável de ambiente do BFF, e o
 * `tenant` vem do cookie cifrado. Cliente nenhum escolhe host nem caminho —
 * só um rótulo de um mapa fechado.
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
  usuarioCodigo: '147',
};

const env = loadEnv({
  baseDomain: 'apps.example.test',
  validationKey: 'chave-de-validacao-sintetica',
  SESSION_SECRET,
  NODE_ENV: 'test',
  SERVE_STATIC_CLIENT: 'false',
});

const cookieDeSessao = criarCifradorDeSessao(SESSION_SECRET).cifrar(SESSAO);

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp(env);
});

afterAll(async () => {
  await app.close();
});

function abrir(url: string, comSessao = true) {
  return app.inject({
    method: 'GET',
    url,
    ...(comSessao ? { cookies: { [SESSION_COOKIE_NAME]: cookieDeSessao } } : {}),
  });
}

describe('GET /gerencial/:destino', () => {
  it('redireciona a movimentação não fiscal para o host do tenant', async () => {
    const resposta = await abrir('/gerencial/movimento-nao-fiscal');

    expect(resposta.statusCode).toBe(302);
    expect(resposta.headers.location).toBe(
      'https://tenantdemo.apps.example.test/wwtecfmovnaofisc.aspx',
    );
  });

  it('redireciona o resumo de caixa para a sua própria tela', async () => {
    // As duas opções apontavam para o mesmo `.aspx` até AD-026; hoje não mais.
    // Este teste é o que impede a regressão de voltarem a coincidir.
    const resposta = await abrir('/gerencial/resumo-caixa');

    expect(resposta.statusCode).toBe(302);
    expect(resposta.headers.location).toBe(
      'https://tenantdemo.apps.example.test/WWPResumoCaixa.aspx',
    );
  });

  it('monta o host com o tenant do cookie, ignorando o que vier na query', async () => {
    const resposta = await abrir('/gerencial/resumo-caixa?tenant=invasor');

    expect(resposta.headers.location).toBe(
      'https://tenantdemo.apps.example.test/WWPResumoCaixa.aspx',
    );
  });

  it('responde 401 sem cookie de sessão, sem revelar destino algum', async () => {
    const resposta = await abrir('/gerencial/resumo-caixa', false);

    expect(resposta.statusCode).toBe(401);
    expect(resposta.headers.location).toBeUndefined();
  });

  it('exige a sessão antes de olhar o destino — destino inválido sem cookie também é 401', async () => {
    const resposta = await abrir('/gerencial/inexistente', false);

    expect(resposta.statusCode).toBe(401);
  });

  it('responde 404 a destino fora do mapa', async () => {
    const resposta = await abrir('/gerencial/fechamento-de-caixa');

    expect(resposta.statusCode).toBe(404);
    expect(resposta.headers.location).toBeUndefined();
  });

  it('não aceita URL absoluta como destino — nada de redirect aberto', async () => {
    const resposta = await abrir(`/gerencial/${encodeURIComponent('https://invasor.test')}`);

    expect(resposta.statusCode).toBe(404);
    expect(resposta.headers.location).toBeUndefined();
  });
});

describe('caminhoDaTelaGerencial', () => {
  it('resolve os dois destinos conhecidos', () => {
    expect(caminhoDaTelaGerencial('movimento-nao-fiscal')).toBe('/wwtecfmovnaofisc.aspx');
    expect(caminhoDaTelaGerencial('resumo-caixa')).toBe('/WWPResumoCaixa.aspx');
  });

  it('devolve null para qualquer outro rótulo', () => {
    expect(caminhoDaTelaGerencial('')).toBeNull();
    expect(caminhoDaTelaGerencial('/wwtecfmovnaofisc.aspx')).toBeNull();
  });

  it('devolve null para chaves herdadas do prototype', () => {
    // O rótulo vem da URL: `toString` e `__proto__` chegam como qualquer outro.
    expect(caminhoDaTelaGerencial('toString')).toBeNull();
    expect(caminhoDaTelaGerencial('constructor')).toBeNull();
    expect(caminhoDaTelaGerencial('__proto__')).toBeNull();
  });
});

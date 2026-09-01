import { describe, expect, it, vi } from 'vitest';
import { loadEnv } from '../../../../src/server/config/env';
import type { SessaoOperador } from '../../../../src/server/session/cookie';
import {
  ErroSessaoEncerrada,
  chamarErpComRenovacao,
} from '../../../../src/server/session/chamadaAutenticada';

/**
 * Renovação silenciosa de sessão em `401` (T030, US3).
 *
 * O comportamento vive em `chamadaAutenticada.ts` porque é compartilhado entre
 * `GET /api/bootstrap` (T019) e o proxy `/api/erp/*` (T031).
 */

const env = loadEnv({
  baseDomain: 'apps.example.test',
  validationKey: 'chave-de-validacao-de-teste',
  SESSION_SECRET: 'segredo-de-teste-com-32-caracteres-ok',
  NODE_ENV: 'test',
});

const sessao: SessaoOperador = {
  access_token: 'token-antigo',
  tenant: 'acme',
  client_id: 'client-sintetico',
  client_secret: 'secret-sintetico',
  username: 'operador.teste',
  password: 'senha-sintetica',
  Repository: '00000000-0000-0000-0000-000000000000',
  codigoEmpresa: '1',
};

const requisicao = { caminho: '/ApiCentriumOAuth/GetSessao', query: { Login: 'operador.teste' } };

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('chamarErpComRenovacao', () => {
  it('envia Authorization OAuth e Empresa do cookie decifrado', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json({ ok: true }));

    await chamarErpComRenovacao(sessao, requisicao, { env, fetchImpl });

    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe(
      'https://acme.apps.example.test/ApiCentriumOAuth/GetSessao?Login=operador.teste',
    );
    expect(init?.headers).toMatchObject({
      Authorization: 'OAuth token-antigo',
      Empresa: '1',
      'Content-Type': 'application/json',
    });
  });

  it('não renova quando a chamada dá certo de primeira', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json({ ok: true }));

    const resultado = await chamarErpComRenovacao(sessao, requisicao, { env, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(resultado.sessaoRenovada).toBeNull();
    expect(resultado.resposta.status).toBe(200);
  });

  it('renova em 401 e refaz a chamada original com o token novo (FR-005)', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ erro: 'expirado' }, 401))
      .mockResolvedValueOnce(json({ access_token: 'token-novo' }))
      .mockResolvedValueOnce(json({ ok: true }));

    const resultado = await chamarErpComRenovacao(sessao, requisicao, { env, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls[1]?.[0]).toBe('https://acme.apps.example.test/oauth/access_token');

    // A chamada original é refeita com o token renovado.
    expect(fetchImpl.mock.calls[2]?.[1]?.headers).toMatchObject({
      Authorization: 'OAuth token-novo',
    });

    expect(resultado.resposta.status).toBe(200);
    expect(resultado.sessaoRenovada).toEqual({ ...sessao, access_token: 'token-novo' });
  });

  it('renova uma única vez, mesmo se o ERP responder 401 de novo', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ erro: 'expirado' }, 401))
      .mockResolvedValueOnce(json({ access_token: 'token-novo' }))
      .mockResolvedValueOnce(json({ erro: 'expirado' }, 401));

    const resultado = await chamarErpComRenovacao(sessao, requisicao, { env, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(resultado.resposta.status).toBe(401);
  });

  it('encerra a sessão quando a renovação falha (FR-006)', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ erro: 'expirado' }, 401))
      .mockResolvedValueOnce(new Response('invalid_grant', { status: 400 }));

    const erro = await chamarErpComRenovacao(sessao, requisicao, { env, fetchImpl }).catch(
      (e: unknown) => e,
    );

    expect(erro).toBeInstanceOf(ErroSessaoEncerrada);
    expect((erro as ErroSessaoEncerrada).causa.status).toBe(400);
  });

  it('encerra a sessão quando a renovação devolve resposta fora do contrato', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ erro: 'expirado' }, 401))
      .mockResolvedValueOnce(json({ sem_access_token: true }));

    const erro = await chamarErpComRenovacao(sessao, requisicao, { env, fetchImpl }).catch(
      (e: unknown) => e,
    );

    expect(erro).toBeInstanceOf(ErroSessaoEncerrada);
    expect((erro as ErroSessaoEncerrada).causa.motivo).toBe('contrato');
  });
});

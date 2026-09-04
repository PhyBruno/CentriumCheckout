import { describe, expect, it, vi } from 'vitest';
import { loadEnv, type Env } from '../../../../src/server/config/env';
import {
  ErroTrocaDeToken,
  trocarCredenciaisPorToken,
  type CredenciaisSessao,
} from '../../../../src/server/session/tokenExchange';

/** Ambiente sintético — nenhum valor real de produção. */
function envDeTeste(extra: Record<string, string> = {}): Env {
  return loadEnv({
    baseDomain: 'apps.example.test',
    validationKey: 'chave-de-validacao-de-teste',
    SESSION_SECRET: 'segredo-de-teste-com-32-caracteres-ok',
    NODE_ENV: 'test',
    ...extra,
  });
}

const credenciais: CredenciaisSessao = {
  tenant: 'acme',
  client_id: 'client-sintetico',
  client_secret: 'secret-sintetico',
  username: 'operador.teste',
  password: 'senha-sintetica',
  Repository: '00000000-0000-0000-0000-000000000000',
};

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('trocarCredenciaisPorToken', () => {
  it('monta o host do ERP como <tenant>.<baseDomain> (AD-019)', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(respostaJson({ access_token: 'token-sintetico' }));

    await trocarCredenciaisPorToken(credenciais, { env: envDeTeste(), fetchImpl });

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://acme.apps.example.test/oauth/access_token');
  });

  it('envia o grant de senha em form urlencoded com additional_parameters', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(respostaJson({ access_token: 'token-sintetico' }));

    await trocarCredenciaisPorToken(credenciais, { env: envDeTeste(), fetchImpl });

    const init = fetchImpl.mock.calls[0]?.[1];
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({
      'Content-Type': 'application/x-www-form-urlencoded',
    });

    const corpo = new URLSearchParams(String(init?.body));
    expect(corpo.get('grant_type')).toBe('password');
    expect(corpo.get('client_id')).toBe(credenciais.client_id);
    expect(corpo.get('client_secret')).toBe(credenciais.client_secret);
    expect(corpo.get('username')).toBe(credenciais.username);
    expect(corpo.get('password')).toBe(credenciais.password);
    expect(JSON.parse(corpo.get('additional_parameters') ?? '{}')).toEqual({
      AuthenticationTypeName: 'local',
      Repository: credenciais.Repository,
    });
  });

  /**
   * O nome do campo é o bug mais caro que este módulo já teve (AD-165): em
   * camelCase o GAM responde `401` "A conexão ao GAM não foi especificada" antes
   * de olhar o `Repository`, e **todo** login do Checkout falha. Como o corpo é
   * montado em `URLSearchParams`, um typo aqui não gera erro de tipo nem de
   * lint — só uma chave a mais que o servidor ignora. Este teste é a única
   * defesa automática contra o retorno do camelCase.
   */
  it('não envia o campo em camelCase (additionalParameters) — o GAM real recusa', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(respostaJson({ access_token: 'token-sintetico' }));

    await trocarCredenciaisPorToken(credenciais, { env: envDeTeste(), fetchImpl });

    const corpo = new URLSearchParams(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(corpo.get('additionalParameters')).toBeNull();
    expect([...corpo.keys()].sort()).toEqual([
      'additional_parameters',
      'client_id',
      'client_secret',
      'grant_type',
      'password',
      'username',
    ]);
  });

  it('devolve a resposta validada pelo schema de fronteira', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        respostaJson({ access_token: 'token-sintetico', token_type: 'bearer', expires_in: 3600 }),
      );

    const resultado = await trocarCredenciaisPorToken(credenciais, {
      env: envDeTeste(),
      fetchImpl,
    });

    expect(resultado.access_token).toBe('token-sintetico');
    expect(resultado.token_type).toBe('bearer');
  });

  it('preserva campos extras do ERP (contrato loose)', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(respostaJson({ access_token: 'token-sintetico', campo_novo_do_erp: 'x' }));

    const resultado = await trocarCredenciaisPorToken(credenciais, {
      env: envDeTeste(),
      fetchImpl,
    });

    expect(resultado['campo_novo_do_erp']).toBe('x');
  });

  it('usa ERP_HOST_OVERRIDE quando configurado (dev/teste com ERP mockado)', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(respostaJson({ access_token: 'token-sintetico' }));

    await trocarCredenciaisPorToken(credenciais, {
      env: envDeTeste({ ERP_PROTOCOL: 'http', ERP_HOST_OVERRIDE: '127.0.0.1:4010' }),
      fetchImpl,
    });

    expect(fetchImpl.mock.calls[0]?.[0]).toBe('http://127.0.0.1:4010/oauth/access_token');
  });

  it('repassa o status do ERP quando a troca é recusada', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('invalid_grant', { status: 400 }));

    const erro = await trocarCredenciaisPorToken(credenciais, {
      env: envDeTeste(),
      fetchImpl,
    }).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ErroTrocaDeToken);
    expect((erro as ErroTrocaDeToken).motivo).toBe('erp');
    expect((erro as ErroTrocaDeToken).status).toBe(400);
  });

  it('rejeita resposta 200 que não bate com o contrato (Constitution IV)', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(respostaJson({ token: 'faltou o access_token' }));

    const erro = await trocarCredenciaisPorToken(credenciais, {
      env: envDeTeste(),
      fetchImpl,
    }).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ErroTrocaDeToken);
    expect((erro as ErroTrocaDeToken).motivo).toBe('contrato');
    expect((erro as ErroTrocaDeToken).status).toBe(502);
  });

  it('rejeita resposta 200 que não é JSON', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('<html>erro</html>', { status: 200 }));

    const erro = await trocarCredenciaisPorToken(credenciais, {
      env: envDeTeste(),
      fetchImpl,
    }).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ErroTrocaDeToken);
    expect((erro as ErroTrocaDeToken).motivo).toBe('contrato');
  });

  it('classifica falha de rede como 502', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error('ECONNREFUSED'));

    const erro = await trocarCredenciaisPorToken(credenciais, {
      env: envDeTeste(),
      fetchImpl,
    }).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ErroTrocaDeToken);
    expect((erro as ErroTrocaDeToken).motivo).toBe('rede');
    expect((erro as ErroTrocaDeToken).status).toBe(502);
  });
});

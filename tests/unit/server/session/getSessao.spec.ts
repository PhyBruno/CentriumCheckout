import { describe, expect, it, vi } from 'vitest';
import { loadEnv } from '../../../../src/server/config/env';
import {
  buscarUsuarioCodigo,
  extrairUsuarioCodigo,
  queryGetSessao,
  type CredenciaisGetSessao,
} from '../../../../src/server/session/getSessao';

/**
 * Quem é o operador, perguntado ao ERP antes de a sessão existir.
 *
 * É o valor que `/session/start` grava no cookie para que o BFF possa reescrever
 * o `UsuarioCodigo` do retrato, que vem do navegador e seria editável no
 * DevTools (AD-224, item 53 de `.specs/project/PENDENCIES.md`).
 *
 * Todos os valores são sintéticos.
 */

const CREDENCIAIS: CredenciaisGetSessao = {
  access_token: 'token-sintetico',
  tenant: 'tenantdemo',
  codigoEmpresa: '1',
  username: 'operador.teste',
};

const env = loadEnv({
  baseDomain: 'apps.example.test',
  validationKey: 'chave-de-validacao-sintetica',
  SESSION_SECRET: 'segredo-sintetico-de-teste-com-32+'.padEnd(32, '-'),
  NODE_ENV: 'test',
  SERVE_STATIC_CLIENT: 'false',
});

function respostaComSessao(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('extrairUsuarioCodigo', () => {
  it('lê o campo na raiz, como o ERP real devolve (AD-165)', () => {
    expect(extrairUsuarioCodigo({ UsuarioCodigo: '147281' })).toBe('147281');
  });

  it('lê o campo sob SessaoUsuario, como o erp-mock e o YAML desenham', () => {
    expect(extrairUsuarioCodigo({ SessaoUsuario: { UsuarioCodigo: 42 } })).toBe('42');
  });

  it('recusa o zero que o ERP devolve quando não resolveu o login (AD-205)', () => {
    // Gravar `0` no cookie faria toda NFCe da sessão sair atribuída a um
    // operador que não existe — trilha falsa, pior que recusar a entrada.
    expect(extrairUsuarioCodigo({ UsuarioCodigo: '0' })).toBeNull();
    expect(extrairUsuarioCodigo({ SessaoUsuario: { UsuarioCodigo: 0 } })).toBeNull();
  });

  it('recusa valor ausente, não numérico, negativo ou fracionário', () => {
    expect(extrairUsuarioCodigo({})).toBeNull();
    expect(extrairUsuarioCodigo({ UsuarioCodigo: 'abc' })).toBeNull();
    expect(extrairUsuarioCodigo({ UsuarioCodigo: -5 })).toBeNull();
    expect(extrairUsuarioCodigo({ UsuarioCodigo: 1.5 })).toBeNull();
    expect(extrairUsuarioCodigo(null)).toBeNull();
    expect(extrairUsuarioCodigo('texto cru')).toBeNull();
  });
});

describe('queryGetSessao', () => {
  it('põe Empresa antes de Login — o .Before do ERP recorta até o fim da query', () => {
    expect(Object.keys(queryGetSessao(CREDENCIAIS))).toEqual(['Empresa', 'Login']);
  });
});

describe('buscarUsuarioCodigo', () => {
  it('pergunta ao ERP pelo login autenticado e devolve o código', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(respostaComSessao({ UsuarioCodigo: '147' }));

    expect(await buscarUsuarioCodigo(CREDENCIAIS, { env, fetchImpl })).toEqual({
      situacao: 'identificado',
      usuarioCodigo: '147',
    });

    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      'https://tenantdemo.apps.example.test/ApiCentriumOAuth/GetSessao?Empresa=1&Login=operador.teste',
    );
    // O contrato do ERP usa o esquema `OAuth`, não `Bearer` (AD-019).
    expect((init?.headers as Record<string, string>)['Authorization']).toBe(
      'OAuth token-sintetico',
    );
    expect((init?.headers as Record<string, string>)['Empresa']).toBe('1');
  });

  it('ERP fora é indisponibilidade — o desfecho que vale repetir', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 500 }));

    expect(await buscarUsuarioCodigo(CREDENCIAIS, { env, fetchImpl })).toEqual({
      situacao: 'indisponivel',
    });
  });

  it('falha de rede vira indisponibilidade, não exceção', async () => {
    // O chamador trata indisponibilidade num lugar só; um `throw` escapando
    // daqui cairia no catch de "falha não tratada" e perderia a repetição.
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('fetch failed'));

    expect(await buscarUsuarioCodigo(CREDENCIAIS, { env, fetchImpl })).toEqual({
      situacao: 'indisponivel',
    });
  });

  it('2xx com corpo ilegível é o ERP em mau estado, não veredito sobre o login', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('<html>erro</html>', { status: 200 }));

    expect(await buscarUsuarioCodigo(CREDENCIAIS, { env, fetchImpl })).toEqual({
      situacao: 'indisponivel',
    });
  });

  it('login não resolvido é resposta do ERP — repetir daria o mesmo', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(respostaComSessao({ UsuarioCodigo: '0' }));

    expect(await buscarUsuarioCodigo(CREDENCIAIS, { env, fetchImpl })).toEqual({
      situacao: 'naoIdentificado',
    });
  });

  it('não tenta renovar o token — ele acabou de nascer', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 401 }));

    expect(await buscarUsuarioCodigo(CREDENCIAIS, { env, fetchImpl })).toEqual({
      situacao: 'indisponivel',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

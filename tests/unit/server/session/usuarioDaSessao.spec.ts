import { describe, expect, it, vi } from 'vitest';
import { loadEnv } from '../../../../src/server/config/env';
import type { SessaoOperador } from '../../../../src/server/session/cookie';
import {
  criarUsuarioDaSessao,
  extrairUsuarioCodigo,
  queryGetSessao,
} from '../../../../src/server/session/usuarioDaSessao';

/**
 * Quem assina a NFCe é decidido no servidor.
 *
 * AD-221 pôs `UsuarioCodigo` no corpo de `FaturarNFCe`, montado no navegador —
 * ou seja, editável no DevTools. Este módulo é a fonte confiável que faltava: o
 * `Login` do cookie cifrado perguntado ao próprio ERP (item 53 de
 * `.specs/project/PENDENCIES.md`, OWASP A01/A09).
 *
 * Todos os valores são sintéticos.
 */

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
    expect(extrairUsuarioCodigo({ UsuarioCodigo: '147281' })).toBe(147281);
  });

  it('lê o campo sob SessaoUsuario, como o erp-mock e o YAML desenham', () => {
    expect(extrairUsuarioCodigo({ SessaoUsuario: { UsuarioCodigo: 42 } })).toBe(42);
  });

  it('recusa o zero que o ERP devolve quando não resolveu o login (AD-205)', () => {
    // Atribuir a nota ao usuário `0` seria pior que recusar: cria trilha de
    // auditoria falsa.
    expect(extrairUsuarioCodigo({ UsuarioCodigo: '0' })).toBeNull();
    expect(extrairUsuarioCodigo({ SessaoUsuario: { UsuarioCodigo: 0 } })).toBeNull();
  });

  it('recusa valor ausente, não numérico ou negativo', () => {
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
    expect(Object.keys(queryGetSessao(SESSAO))).toEqual(['Empresa', 'Login']);
  });
});

describe('criarUsuarioDaSessao', () => {
  it('resolve o operador perguntando ao ERP pelo Login do cookie', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(respostaComSessao({ UsuarioCodigo: '147' }));
    const usuarioDaSessao = criarUsuarioDaSessao({ env, fetchImpl });

    const resolvido = await usuarioDaSessao.resolver(SESSAO);

    expect(resolvido.usuarioCodigo).toBe(147);
    const url = String(fetchImpl.mock.calls[0]?.[0]);
    expect(url).toContain('/ApiCentriumOAuth/GetSessao');
    expect(url).toContain('Empresa=1&Login=operador.teste');
  });

  it('reaproveita o valor em cache sem bater no ERP de novo', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(respostaComSessao({ UsuarioCodigo: '147' }));
    const usuarioDaSessao = criarUsuarioDaSessao({ env, fetchImpl });

    await usuarioDaSessao.resolver(SESSAO);
    const segunda = await usuarioDaSessao.resolver(SESSAO);

    expect(segunda.usuarioCodigo).toBe(147);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('o bootstrap aquece o cache — faturar não gera chamada extra', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const usuarioDaSessao = criarUsuarioDaSessao({ env, fetchImpl });

    usuarioDaSessao.registrar(SESSAO, 147);

    expect((await usuarioDaSessao.resolver(SESSAO)).usuarioCodigo).toBe(147);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('ignora aquecimento com código inválido, em vez de envenenar o cache', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(respostaComSessao({ UsuarioCodigo: '147' }));
    const usuarioDaSessao = criarUsuarioDaSessao({ env, fetchImpl });

    usuarioDaSessao.registrar(SESSAO, 0);

    expect((await usuarioDaSessao.resolver(SESSAO)).usuarioCodigo).toBe(147);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('pergunta de novo depois que o cache expira', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(respostaComSessao({ UsuarioCodigo: '147' }));
    let relogio = 0;
    const usuarioDaSessao = criarUsuarioDaSessao({
      env,
      fetchImpl,
      ttlMs: 1000,
      agora: () => relogio,
    });

    await usuarioDaSessao.resolver(SESSAO);
    relogio = 1001;
    await usuarioDaSessao.resolver(SESSAO);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('não separa sessões de empresas diferentes no mesmo cache', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(respostaComSessao({ UsuarioCodigo: '147' }))
      .mockResolvedValueOnce(respostaComSessao({ UsuarioCodigo: '900' }));
    const usuarioDaSessao = criarUsuarioDaSessao({ env, fetchImpl });

    const naEmpresa1 = await usuarioDaSessao.resolver(SESSAO);
    const naEmpresa2 = await usuarioDaSessao.resolver({ ...SESSAO, codigoEmpresa: '2' });

    // `Empresa` entra na query de `GetSessao`: o mesmo login em outra empresa é
    // outra pergunta, e não pode herdar a resposta anterior.
    expect(naEmpresa1.usuarioCodigo).toBe(147);
    expect(naEmpresa2.usuarioCodigo).toBe(900);
  });

  it('chamadas concorrentes com cache frio disparam um único GetSessao', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(respostaComSessao({ UsuarioCodigo: '147' }));
    const usuarioDaSessao = criarUsuarioDaSessao({ env, fetchImpl });

    const [a, b, c] = await Promise.all([
      usuarioDaSessao.resolver(SESSAO),
      usuarioDaSessao.resolver(SESSAO),
      usuarioDaSessao.resolver(SESSAO),
    ]);

    expect([a?.usuarioCodigo, b?.usuarioCodigo, c?.usuarioCodigo]).toEqual([147, 147, 147]);
    // A resposta de `GetSessao` tem ~5MB; três chamadas para a mesma pergunta
    // seriam desperdício puro.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('devolve null quando o ERP recusa a consulta', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 500 }));
    const usuarioDaSessao = criarUsuarioDaSessao({ env, fetchImpl });

    expect((await usuarioDaSessao.resolver(SESSAO)).usuarioCodigo).toBeNull();
  });

  it('devolve null quando a resposta não é JSON, sem lançar', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('<html>erro</html>', { status: 200 }));
    const usuarioDaSessao = criarUsuarioDaSessao({ env, fetchImpl });

    expect((await usuarioDaSessao.resolver(SESSAO)).usuarioCodigo).toBeNull();
  });

  it('falha não fica em cache — a chamada seguinte tenta de novo', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 500 }))
      .mockResolvedValueOnce(respostaComSessao({ UsuarioCodigo: '147' }));
    const usuarioDaSessao = criarUsuarioDaSessao({ env, fetchImpl });

    expect((await usuarioDaSessao.resolver(SESSAO)).usuarioCodigo).toBeNull();
    expect((await usuarioDaSessao.resolver(SESSAO)).usuarioCodigo).toBe(147);
  });
});

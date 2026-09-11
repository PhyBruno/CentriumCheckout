import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { loadEnv } from '../../../../src/server/config/env';
import { buildApp } from '../../../../src/server/index';
import { CSP_CHECKOUT } from '../../../../src/server/plugins/headersSeguranca';

/**
 * O BFF não mandava nenhum cabeçalho de segurança — sem CSP, `X-Frame-Options`,
 * `nosniff`, HSTS ou `Referrer-Policy` (achado do gate `/owasp-security`, item
 * 54 de `.specs/project/PENDENCIES.md`).
 *
 * O que estes testes protegem, além da presença: que os cabeçalhos alcancem
 * **toda** resposta, inclusive o redirect de `/session/start` e o 404 — os dois
 * caminhos que saem fora do ciclo normal de rota — e que as duas exceções da
 * CSP continuem exatamente onde foram abertas, com motivo conhecido.
 *
 * Todos os valores são sintéticos.
 */

const env = loadEnv({
  baseDomain: 'apps.example.test',
  validationKey: 'chave-de-validacao-sintetica',
  SESSION_SECRET: 'segredo-sintetico-de-teste-com-32+'.padEnd(32, '-'),
  NODE_ENV: 'test',
  SERVE_STATIC_CLIENT: 'false',
});

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp(env);
});

afterAll(async () => {
  await app.close();
});

describe('cabeçalhos de segurança', () => {
  it('acompanham uma resposta de rota normal', async () => {
    const resposta = await app.inject({ method: 'GET', url: '/health' });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.headers['x-frame-options']).toBe('DENY');
    expect(resposta.headers['x-content-type-options']).toBe('nosniff');
    expect(resposta.headers['referrer-policy']).toBe('no-referrer');
    expect(resposta.headers['strict-transport-security']).toContain('max-age=');
    expect(resposta.headers['content-security-policy']).toBe(CSP_CHECKOUT);
  });

  it('acompanham o redirect de /session/start, que carrega credenciais na query', async () => {
    // `no-referrer` aqui não é zelo genérico: é o cabeçalho que impede a URL de
    // entrada — com a senha do operador dentro — de vazar como `Referer`.
    const resposta = await app.inject({ method: 'GET', url: '/session/start' });

    expect(resposta.statusCode).toBe(302);
    expect(resposta.headers['referrer-policy']).toBe('no-referrer');
    expect(resposta.headers['content-security-policy']).toBe(CSP_CHECKOUT);
  });

  it('acompanham também a resposta de rota inexistente', async () => {
    const resposta = await app.inject({ method: 'GET', url: '/rota-que-nao-existe' });

    expect(resposta.statusCode).toBe(404);
    expect(resposta.headers['x-content-type-options']).toBe('nosniff');
    expect(resposta.headers['content-security-policy']).toBe(CSP_CHECKOUT);
  });
});

describe('política de conteúdo', () => {
  it('fecha as diretivas que sustentam a política', () => {
    expect(CSP_CHECKOUT).toContain("default-src 'self'");
    expect(CSP_CHECKOUT).toContain("script-src 'self'");
    expect(CSP_CHECKOUT).toContain("frame-ancestors 'none'");
    expect(CSP_CHECKOUT).toContain("object-src 'none'");
    expect(CSP_CHECKOUT).toContain("base-uri 'self'");
  });

  it('script-src não tem escape inline — é a diretiva que carrega o valor real', () => {
    expect(CSP_CHECKOUT).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(CSP_CHECKOUT).not.toContain('unsafe-eval');
  });

  it('connect-src aceita a rede local por causa da impressão direta do PDV', () => {
    // `imprimirNFCeLocal.ts` fala do navegador com `CadMaqHost`
    // (default `127.0.0.1:4545`), fora do BFF (AD-006/AD-083); o host varia por
    // máquina e só é conhecido depois do bootstrap.
    expect(CSP_CHECKOUT).toContain("connect-src 'self' http: https:");
  });

  it('img-src aceita data: e blob: — QR Code do PIX e PDF da NFCe', () => {
    expect(CSP_CHECKOUT).toContain("img-src 'self' data: blob:");
  });
});

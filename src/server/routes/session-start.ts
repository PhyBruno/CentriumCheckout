import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Env } from '../config/env';
import {
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
  type CifradorDeSessao,
} from '../session/cookie';
import { ErroTrocaDeToken, trocarCredenciaisPorToken } from '../session/tokenExchange';

/**
 * Query params do redirect do ERP (`contracts/session-bff-api.md`).
 * Todos vêm do ERP — nunca são digitados pelo operador.
 */
const sessionStartQuerySchema = z.object({
  tenant: z.string().min(1),
  client_id: z.string().min(1),
  client_secret: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
  Repository: z.string().min(1),
  codigoEmpresa: z.string().min(1),
  validationKey: z.string().min(1),
});

export interface SessionStartDeps {
  readonly env: Env;
  readonly cifrador: CifradorDeSessao;
  readonly fetchImpl?: typeof fetch;
  /** URL limpa da SPA para onde o navegador é redirecionado (padrão: `/`). */
  readonly destinoAposLogin?: string;
}

/** Comparação em tempo constante — evita distinguir chaves por tempo de resposta. */
function chaveConfere(recebida: string, esperada: string): boolean {
  const a = Buffer.from(recebida, 'utf8');
  const b = Buffer.from(esperada, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * `GET /session/start` — ponto de entrada único do Checkout (T014, US1).
 *
 * Recebe o redirect do ERP com as credenciais do operador, troca por
 * `access_token`, cifra tudo no cookie `HttpOnly` e redireciona para a URL limpa
 * da SPA. Nenhum dado sensível sobra na URL de destino (FR-001, FR-002, SC-001).
 */
export function registrarRotaSessionStart(app: FastifyInstance, deps: SessionStartDeps): void {
  const destino = deps.destinoAposLogin ?? '/';

  app.get('/session/start', async (request, reply) => {
    const query = sessionStartQuerySchema.safeParse(request.query);

    if (!query.success) {
      // Não ecoa os valores recebidos: a query carrega credenciais.
      return reply.code(400).send({ erro: 'Parâmetros de sessão ausentes ou inválidos' });
    }

    // Valida a origem do redirect ANTES de gastar uma tentativa de autenticação
    // OAuth com uma origem não verificada (AD-022).
    if (!chaveConfere(query.data.validationKey, deps.env.validationKey)) {
      return reply.code(401).send({ erro: 'Origem do redirect não autorizada' });
    }

    try {
      const token = await trocarCredenciaisPorToken(
        {
          tenant: query.data.tenant,
          client_id: query.data.client_id,
          client_secret: query.data.client_secret,
          username: query.data.username,
          password: query.data.password,
          Repository: query.data.Repository,
        },
        { env: deps.env, ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}) },
      );

      const cookie = deps.cifrador.cifrar({
        access_token: token.access_token,
        tenant: query.data.tenant,
        client_id: query.data.client_id,
        client_secret: query.data.client_secret,
        username: query.data.username,
        password: query.data.password,
        Repository: query.data.Repository,
        codigoEmpresa: query.data.codigoEmpresa,
      });

      return reply
        .setCookie(SESSION_COOKIE_NAME, cookie, SESSION_COOKIE_OPTIONS)
        .redirect(destino, 302);
    } catch (erro) {
      if (erro instanceof ErroTrocaDeToken) {
        request.log.warn({ motivo: erro.motivo, status: erro.status }, 'falha ao iniciar sessão');
        return reply.code(erro.status).send({ erro: 'Não foi possível iniciar a sessão' });
      }
      throw erro;
    }
  });
}

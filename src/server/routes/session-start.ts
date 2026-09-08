import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { Env } from '../config/env';
import {
  ENTRADA_COOKIE_OPTIONS,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
  type CifradorDeSessao,
} from '../session/cookie';
import { ErroTrocaDeToken, trocarCredenciaisPorToken } from '../session/tokenExchange';
import {
  COOKIE_ENTRADA,
  PARAM_ERRO_ACESSO,
  VALOR_COOKIE_ENTRADA,
  VALOR_ERRO_ACESSO,
} from '../../shared/erroAcesso';

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
  const separador = destino.includes('?') ? '&' : '?';
  const destinoComErro = `${destino}${separador}${PARAM_ERRO_ACESSO}=${VALOR_ERRO_ACESSO}`;

  /**
   * Recusa a entrada: manda o navegador para o painel terminal e **apaga** a
   * marca de entrada válida.
   *
   * Limpar é a metade que importa. Sem isso, um operador que teve uma sessão
   * boa e depois chegou com um redirect quebrado carregaria a marca antiga, e
   * uma falha de carregamento seguinte ofereceria "Tentar novamente" para uma
   * entrada que nunca foi aceita — exatamente o laço que esta correção fecha.
   */
  function recusarEntrada(reply: FastifyReply) {
    return reply.clearCookie(COOKIE_ENTRADA, ENTRADA_COOKIE_OPTIONS).redirect(destinoComErro, 302);
  }

  app.get('/session/start', async (request, reply) => {
    const query = sessionStartQuerySchema.safeParse(request.query);

    if (!query.success) {
      // Não ecoa os valores recebidos: a query carrega credenciais. Manda para a
      // SPA, que mostra o painel terminal — quem chega aqui é um **navegador**
      // vindo de um redirect, não um cliente de API, e um JSON cru na tela não
      // diz ao operador o que fazer (pedido do usuário, 2026-09-08).
      return recusarEntrada(reply);
    }

    // Valida a origem do redirect ANTES de gastar uma tentativa de autenticação
    // OAuth com uma origem não verificada (AD-022).
    if (!chaveConfere(query.data.validationKey, deps.env.validationKey)) {
      request.log.warn('redirect com validationKey inválida');
      return recusarEntrada(reply);
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
        // Marca legível de "houve entrada válida" — é o que decide, mais
        // tarde, se uma falha de carregamento merece "Tentar novamente" ou a
        // tela terminal. Gravada **só** aqui, no único ponto em que uma sessão
        // de fato nasce.
        .setCookie(COOKIE_ENTRADA, VALOR_COOKIE_ENTRADA, ENTRADA_COOKIE_OPTIONS)
        .redirect(destino, 302);
    } catch (erro) {
      if (erro instanceof ErroTrocaDeToken) {
        request.log.warn({ motivo: erro.motivo, status: erro.status }, 'falha ao iniciar sessão');
        return recusarEntrada(reply);
      }

      // Qualquer outra falha (rede, bug) também é um navegador na tela: o painel
      // terminal em vez da página de erro padrão do Fastify.
      request.log.error({ erro }, 'falha não tratada ao iniciar sessão');
      return recusarEntrada(reply);
    }
  });
}

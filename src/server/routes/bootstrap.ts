import type { FastifyInstance } from 'fastify';
import type { Env } from '../config/env';
import { bootstrapPayloadSchema } from '../../shared/schemas/bootstrap.schema';
import {
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
  type CifradorDeSessao,
} from '../session/cookie';
import { ErroSessaoEncerrada, chamarErpComRenovacao } from '../session/chamadaAutenticada';
import { calcularVersionHash } from '../../shared/versionHash';

/**
 * A SPA envia em `If-None-Match` todos os hashes que já tem em cache (um por
 * tenant já usado neste navegador). Basta um bater para dispensar o corpo.
 */
function hashConhecido(cabecalho: string | string[] | undefined, hash: string): boolean {
  if (cabecalho === undefined) {
    return false;
  }
  const valores = Array.isArray(cabecalho) ? cabecalho : [cabecalho];
  return valores
    .flatMap((valor) => valor.split(','))
    .map((valor) => valor.trim().replace(/^W\//, '').replace(/^"|"$/g, ''))
    .includes(hash);
}

export interface BootstrapDeps {
  readonly env: Env;
  readonly cifrador: CifradorDeSessao;
  readonly fetchImpl?: typeof fetch;
}

const CAMINHO_GET_SESSAO = '/ApiCentriumOAuth/GetSessao';

/**
 * `GET /api/bootstrap` — configuração do ponto de venda (T019, US2).
 *
 * Decifra o cookie no servidor, chama `GetSessao` no ERP e devolve à SPA o
 * payload combinado com `tenant` e `codigoEmpresa`. Nunca devolve
 * `access_token`, `client_secret` ou `password` (FR-002/SC-004).
 */
export function registrarRotaBootstrap(app: FastifyInstance, deps: BootstrapDeps): void {
  app.get('/api/bootstrap', async (request, reply) => {
    const sessao = deps.cifrador.decifrar(request.cookies[SESSION_COOKIE_NAME]);

    if (sessao === null) {
      return reply.code(401).send({ erro: 'Sessão ausente ou inválida' });
    }

    let resultado;
    try {
      resultado = await chamarErpComRenovacao(
        sessao,
        {
          caminho: CAMINHO_GET_SESSAO,
          query: { Login: sessao.username },
        },
        { env: deps.env, ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}) },
      );
    } catch (erro) {
      if (erro instanceof ErroSessaoEncerrada) {
        // Renovação falhou: encerra a sessão — único gatilho de logout
        // automático (FR-006), aciona AUTH-06 no cliente.
        return reply
          .clearCookie(SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS)
          .code(401)
          .send({ erro: 'Sessão encerrada' });
      }
      throw erro;
    }

    if (resultado.sessaoRenovada !== null) {
      reply.setCookie(
        SESSION_COOKIE_NAME,
        deps.cifrador.cifrar(resultado.sessaoRenovada),
        SESSION_COOKIE_OPTIONS,
      );
    }

    // Erro não-401 é repassado como está: o cliente mostra "Tentar novamente",
    // sem forçar novo login (AUTH-07 / FR-007).
    if (!resultado.resposta.ok) {
      return reply
        .code(resultado.resposta.status)
        .send({ erro: 'Falha ao carregar a configuração do ponto de venda' });
    }

    let json: unknown;
    try {
      json = await resultado.resposta.json();
    } catch {
      return reply.code(502).send({ erro: 'Resposta do ERP não é JSON válido' });
    }

    const combinado = {
      ...(typeof json === 'object' && json !== null ? json : {}),
      tenant: sessao.tenant,
      codigoEmpresa: sessao.codigoEmpresa,
    };

    // Validação de fronteira antes de entregar ao navegador (Constitution IV).
    const validado = bootstrapPayloadSchema.safeParse(combinado);
    if (!validado.success) {
      request.log.warn('payload de bootstrap fora do contrato esperado');
      return reply.code(502).send({ erro: 'Configuração do ponto de venda fora do contrato' });
    }

    // FR-008/AD-045: se a SPA já tem este payload, não retransmite os ~5MB.
    // O `tenant` faz parte do payload, então o hash difere entre tenants e o
    // `304` nunca pode reaproveitar o cache de outra empresa (FR-009).
    const versionHash = calcularVersionHash(validado.data);
    reply.header('ETag', versionHash);

    if (hashConhecido(request.headers['if-none-match'], versionHash)) {
      return reply.code(304).send();
    }

    return reply.send(validado.data);
  });
}

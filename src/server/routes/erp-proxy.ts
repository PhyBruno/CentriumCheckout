import type { FastifyInstance } from 'fastify';
import type { Env } from '../config/env';
import {
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
  type CifradorDeSessao,
} from '../session/cookie';
import { chamarErpComRenovacao } from '../session/chamadaAutenticada';
import { executarOuEncerrarSessao } from '../session/respostaSessaoEncerrada';

export interface ErpProxyDeps {
  readonly env: Env;
  readonly cifrador: CifradorDeSessao;
  readonly fetchImpl?: typeof fetch;
}

const PREFIXO = '/api/erp';

function corpoDaRequisicao(body: unknown): BodyInit | undefined {
  if (body === undefined || body === null) {
    return undefined;
  }
  return typeof body === 'string' ? body : JSON.stringify(body);
}

/**
 * `/api/erp/*` — proxy autenticado das chamadas de negócio (T031, US3).
 *
 * Injeta `Authorization`/`Empresa` do cookie decifrado e, em `401` do ERP,
 * renova o token e refaz a chamada original de forma transparente ao JS
 * (FR-005). Só quando a renovação falha o cookie é invalidado e o `401` chega
 * ao cliente — único gatilho de logout automático (FR-006).
 *
 * O conteúdo de negócio de cada endpoint é responsabilidade das features
 * correspondentes; aqui a resposta é repassada como está.
 */
export function registrarRotaErpProxy(app: FastifyInstance, deps: ErpProxyDeps): void {
  app.all(`${PREFIXO}/*`, async (request, reply) => {
    const sessao = deps.cifrador.decifrar(request.cookies[SESSION_COOKIE_NAME]);

    if (sessao === null) {
      return reply.code(401).send({ erro: 'Sessão ausente ou inválida' });
    }

    const [caminhoSemQuery = '', queryString = ''] = request.url.split('?');
    const caminhoNoErp = caminhoSemQuery.slice(PREFIXO.length);

    // O default `application/json` de `montarHeaders` serve ao bootstrap (GET
    // sem corpo); aqui o corpo é o da requisição original, então o
    // `Content-Type` real precisa ser repassado como está.
    const contentTypeOriginal = request.headers['content-type'];

    // `null` = a sessão acabou e o 401 terminal já foi respondido (FR-006).
    const resultado = await executarOuEncerrarSessao(reply, () =>
      chamarErpComRenovacao(
        sessao,
        {
          caminho: caminhoNoErp,
          method: request.method,
          // Query crua: preserva chaves repetidas e a codificação original.
          queryString,
          ...(contentTypeOriginal === undefined
            ? {}
            : { headersExtras: { 'Content-Type': contentTypeOriginal } }),
          body: corpoDaRequisicao(request.body),
        },
        { env: deps.env, ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}) },
      ),
    );

    if (resultado === null) {
      return reply;
    }

    if (resultado.sessaoRenovada !== null) {
      reply.setCookie(
        SESSION_COOKIE_NAME,
        deps.cifrador.cifrar(resultado.sessaoRenovada),
        SESSION_COOKIE_OPTIONS,
      );
    }

    const contentType = resultado.resposta.headers.get('content-type');
    if (contentType !== null) {
      reply.header('content-type', contentType);
    }

    return reply
      .code(resultado.resposta.status)
      .send(Buffer.from(await resultado.resposta.arrayBuffer()));
  });
}

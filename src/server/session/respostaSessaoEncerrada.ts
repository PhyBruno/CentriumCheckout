import type { FastifyReply } from 'fastify';
import { SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS } from './cookie';
import { ErroSessaoEncerrada } from './chamadaAutenticada';

/**
 * Resposta HTTP ao único gatilho de logout automático (FR-006).
 *
 * `chamadaAutenticada.ts` decide **quando** a sessão acabou; este módulo decide
 * **como** isso vira resposta HTTP. Separar os dois deixa cada um com uma única
 * razão para mudar (Constitution II) e evita que o módulo de chamadas ao ERP
 * precise conhecer `FastifyReply`.
 *
 * Antes, `GET /api/bootstrap` e o proxy `/api/erp/*` duplicavam o mesmo
 * `try/catch` quase literalmente.
 */
export async function executarOuEncerrarSessao<T>(
  reply: FastifyReply,
  executar: () => Promise<T>,
): Promise<T | null> {
  try {
    return await executar();
  } catch (erro) {
    if (erro instanceof ErroSessaoEncerrada) {
      // Renovação falhou (ou o ERP recusou mesmo com token novo): encerra a
      // sessão e deixa o cliente acionar AUTH-06.
      await reply
        .clearCookie(SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS)
        .code(401)
        .send({ erro: 'Sessão encerrada' });
      return null;
    }
    throw erro;
  }
}

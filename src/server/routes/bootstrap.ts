import type { FastifyInstance } from 'fastify';
import type { Env } from '../config/env';
import { bootstrapPayloadSchema } from '../../shared/schemas/bootstrap.schema';
import {
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
  type CifradorDeSessao,
} from '../session/cookie';
import { chamarErpComRenovacao } from '../session/chamadaAutenticada';
import { executarOuEncerrarSessao } from '../session/respostaSessaoEncerrada';
import {
  CAMINHO_GET_SESSAO,
  queryGetSessao,
  type UsuarioDaSessao,
} from '../session/usuarioDaSessao';
import { calcularVersionHash } from '../../shared/versionHash';
import { normalizarEtag } from '../../shared/etag';

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
    .map((valor) => normalizarEtag(valor))
    .includes(hash);
}

export interface BootstrapDeps {
  readonly env: Env;
  readonly cifrador: CifradorDeSessao;
  /**
   * Cache do operador da sessão. Esta rota é a que aquece: já chama `GetSessao`
   * por outro motivo, então o faturamento não precisa chamar de novo.
   */
  readonly usuarioDaSessao: UsuarioDaSessao;
  readonly fetchImpl?: typeof fetch;
}

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

    // `null` = a sessão acabou e o 401 terminal já foi respondido (FR-006).
    const resultado = await executarOuEncerrarSessao(reply, () =>
      chamarErpComRenovacao(
        sessao,
        {
          caminho: CAMINHO_GET_SESSAO,
          // Caminho e query vivem em `usuarioDaSessao.ts` porque o resolvedor do
          // operador faz a mesma chamada — e a ordem dos pares é contrato do
          // ERP, não estética (AD-205). Duas cópias divergiriam no primeiro
          // ajuste.
          query: queryGetSessao(sessao),
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

    // Erro não-401 é repassado como está: o cliente mostra "Tentar novamente",
    // sem forçar novo login (AUTH-07 / FR-007).
    if (!resultado.resposta.ok) {
      // O corpo do ERP não é repassado (FR-007), mas precisa ser consumido: o
      // undici só devolve a conexão ao pool depois disso.
      await resultado.resposta.arrayBuffer().catch(() => undefined);

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

    // `GetSessao` real devolve os campos da sessão **na raiz**, sem o envelope
    // `SessaoUsuario` que o `GetSessaoOutput` do YAML desenha (verificado ao
    // vivo em 2026-09-04 — AD-165). Espalhar a resposta e esperar a chave, como
    // antes, fazia `bootstrapPayloadSchema` reprovar todo bootstrap contra o
    // ERP real. Aqui a chave é aceita quando existe (é o que o `erp-mock`
    // produz) e a raiz é usada quando não existe.
    const corpo: Record<string, unknown> =
      typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : {};
    const sessaoUsuario = 'SessaoUsuario' in corpo ? corpo['SessaoUsuario'] : corpo;

    const combinado = {
      SessaoUsuario: sessaoUsuario,
      tenant: sessao.tenant,
      codigoEmpresa: sessao.codigoEmpresa,
    };

    // Validação de fronteira antes de entregar ao navegador (Constitution IV).
    const validado = bootstrapPayloadSchema.safeParse(combinado);
    if (!validado.success) {
      request.log.warn('payload de bootstrap fora do contrato esperado');
      return reply.code(502).send({ erro: 'Configuração do ponto de venda fora do contrato' });
    }

    // O operador que o ERP associa a este login, guardado para o proxy usar na
    // hora de faturar. É o mesmo valor que a SPA recebe — a diferença é que
    // aqui ele fica do lado do servidor, fora do alcance do navegador, e é essa
    // cópia que assina a NFCe.
    deps.usuarioDaSessao.registrar(sessao, validado.data.SessaoUsuario.UsuarioCodigo);

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

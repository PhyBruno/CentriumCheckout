import type { FastifyInstance } from 'fastify';
import type { Env } from '../config/env';
import {
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
  type CifradorDeSessao,
} from '../session/cookie';
import { chamarErpComRenovacao } from '../session/chamadaAutenticada';
import { executarOuEncerrarSessao } from '../session/respostaSessaoEncerrada';
import type { UsuarioDaSessao } from '../session/usuarioDaSessao';

export interface ErpProxyDeps {
  readonly env: Env;
  readonly cifrador: CifradorDeSessao;
  /** Quem é o operador desta sessão, segundo o ERP — nunca segundo o corpo. */
  readonly usuarioDaSessao: UsuarioDaSessao;
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
 * `Empresa` na query string, **além** do cabeçalho homônimo (AD-205).
 *
 * O cabeçalho sozinho não basta: no `APICentriumOAuth` da KB, só oito dos
 * métodos têm um `Event <Metodo>.Before` que faz
 * `&Empresa = &HttpRequest.GetHeader('empresa').ToNumeric()`. Os demais —
 * `GetProduto`, `GetDav`, `CarregarNFCe`, `GetStatusSistema`, `StatusPIX`,
 * `ValidaTicketDevolucao` — recebem `in:&Empresa` como parâmetro comum e o leem
 * da query. Sem ele chegam com `&Empresa = 0`, o `For Each` filtra por
 * `empcod = 0`, não acha nada e devolve `200` com o SDT recém-criado.
 *
 * Era essa a causa de "Produto não encontrado" para um produto que existe:
 * verificado ao vivo contra o ERP real em 2026-09-10 —
 * `GetProduto?Codigoproduto=0000TESTE7894&Tipocodproduto=B` com `Empresa` só no
 * cabeçalho devolveu `CodigoProduto: ""`; a mesma chamada com `Empresa=1` na
 * query devolveu o produto. Mandar nos dois lugares é decisão do usuário
 * (2026-09-10) e vale para **todos** os endpoints: nos que têm `.Before` o
 * cabeçalho sobrescreve com o mesmo valor, então o parâmetro é inócuo.
 *
 * **A posição importa: `Empresa` entra sempre como primeiro par.** Os
 * `.Before` de `GetSessao` e `GetCliente` não parseiam a query — recortam de
 * `Login=`/`CPFCNPJ=` **até o fim da string** com `SubStr`. Com `Empresa` no
 * fim, `&Login` viraria `bruno&Empresa=1` e a chamada falharia em silêncio
 * (confirmado ao vivo: `UsuarioCodigo: "0"` e `CodCliente: 0`, contra os
 * valores corretos com o parâmetro na frente).
 *
 * Ocorrências vindas do navegador são descartadas antes: a empresa da sessão
 * sai do cookie cifrado, e aceitar a do cliente deixaria um operador
 * autenticado consultar outra empresa do tenant — mesma razão de
 * `corpoComEmpresaDaSessao`. Os demais pares são repassados crus, sem
 * reserialização, para preservar codificação original e chaves repetidas.
 */
export function queryComEmpresaDaSessao(queryString: string, codigoEmpresa: string): string {
  const pares = queryString === '' ? [] : queryString.split('&');
  const semEmpresa = pares.filter((par) => !/^empresa=/i.test(par));

  return [`Empresa=${encodeURIComponent(codigoEmpresa)}`, ...semEmpresa].join('&');
}

/**
 * Campo de tenant que aparece **dentro** do corpo de alguns endpoints do ERP,
 * além do cabeçalho `Empresa`.
 *
 * O contrato exige `Cliente.Empresa` no corpo de `PostCliente` (AD-024), e o
 * cliente hoje o preenche a partir do bootstrap. Como o corpo é do navegador,
 * um operador autenticado poderia trocar o valor e gravar registro em outra
 * empresa do tenant — o cabeçalho, que vem do cookie cifrado, não protegeria
 * disso. Aqui o servidor reescreve o campo com a empresa da sessão, que é a
 * única fonte confiável (achado da revisão, 2026-09-03).
 */
const RAIZES_COM_EMPRESA = ['Cliente'] as const;

export function corpoComEmpresaDaSessao(body: unknown, codigoEmpresa: string): unknown {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return body;
  }

  const empresa = Number(codigoEmpresa);
  if (!Number.isFinite(empresa)) {
    return body;
  }

  let corpo = body as Record<string, unknown>;
  for (const raiz of RAIZES_COM_EMPRESA) {
    const conteudo = corpo[raiz];
    if (typeof conteudo === 'object' && conteudo !== null && !Array.isArray(conteudo)) {
      corpo = { ...corpo, [raiz]: { ...(conteudo as Record<string, unknown>), Empresa: empresa } };
    }
  }

  return corpo;
}

/** Campo do retrato que diz quem emitiu a nota (`CheckoutFaturarNFCe`, AD-221). */
const CAMPO_USUARIO = 'UsuarioCodigo';

/**
 * A requisição afirma um operador? É isso que decide se o servidor precisa
 * resolver a identidade antes de repassar a chamada.
 *
 * A checagem é pela **presença do campo**, não por uma lista de caminhos: hoje
 * só `FaturarNFCe` e `ValidarNFCe` o mandam, mas um endpoint novo que passe a
 * mandá-lo entra protegido por construção, em vez de entrar esquecido numa
 * lista que ninguém lembra de atualizar.
 */
export function corpoDeclaraUsuario(body: unknown): boolean {
  return typeof body === 'object' && body !== null && !Array.isArray(body) && CAMPO_USUARIO in body;
}

/**
 * Reescreve `UsuarioCodigo` com o operador da sessão.
 *
 * Mesmo princípio de `corpoComEmpresaDaSessao`, e pelo mesmo motivo: o campo
 * viaja no corpo, o corpo vem do navegador, e o ERP não o confere contra o
 * token. Sem esta reescrita, um operador autenticado que editasse o payload
 * emitiria nota assinada por outro — e a assinatura é justamente o que AD-221
 * existe para garantir (item 53 de `.specs/project/PENDENCIES.md`, OWASP
 * A01/A09).
 *
 * O valor entra como número, que é o tipo do campo no SDT.
 */
export function corpoComUsuarioDaSessao(body: unknown, usuarioCodigo: number): unknown {
  if (!corpoDeclaraUsuario(body)) {
    return body;
  }

  return { ...(body as Record<string, unknown>), [CAMPO_USUARIO]: usuarioCodigo };
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
    const sessaoDoCookie = deps.cifrador.decifrar(request.cookies[SESSION_COOKIE_NAME]);

    if (sessaoDoCookie === null) {
      return reply.code(401).send({ erro: 'Sessão ausente ou inválida' });
    }

    const [caminhoSemQuery = '', queryString = ''] = request.url.split('?');
    const caminhoNoErp = caminhoSemQuery.slice(PREFIXO.length);

    // O default `application/json` de `montarHeaders` serve ao bootstrap (GET
    // sem corpo); aqui o corpo é o da requisição original, então o
    // `Content-Type` real precisa ser repassado como está.
    const contentTypeOriginal = request.headers['content-type'];

    // Quem assina a nota sai da sessão, não do corpo. A resolução vem antes da
    // chamada porque pode renovar o token — e aí é a sessão renovada que vale
    // para a chamada de negócio e para o cookie.
    const precisaDoOperador = corpoDeclaraUsuario(request.body);
    const operador = precisaDoOperador
      ? await executarOuEncerrarSessao(reply, () => deps.usuarioDaSessao.resolver(sessaoDoCookie))
      : { usuarioCodigo: null, sessaoRenovada: null };

    if (operador === null) {
      return reply;
    }

    if (precisaDoOperador && operador.usuarioCodigo === null) {
      // Recusar é a única saída correta: repassar o corpo como veio aceitaria
      // de volta o valor forjável que esta rota existe para descartar.
      request.log.warn('operador da sessão não identificado; chamada recusada');
      return reply.code(502).send({ erro: 'Não foi possível identificar o operador da sessão' });
    }

    const sessao = operador.sessaoRenovada ?? sessaoDoCookie;
    const corpoComEmpresa = corpoComEmpresaDaSessao(request.body, sessao.codigoEmpresa);
    const corpo =
      operador.usuarioCodigo === null
        ? corpoComEmpresa
        : corpoComUsuarioDaSessao(corpoComEmpresa, operador.usuarioCodigo);

    // `null` = a sessão acabou e o 401 terminal já foi respondido (FR-006).
    const resultado = await executarOuEncerrarSessao(reply, () =>
      chamarErpComRenovacao(
        sessao,
        {
          caminho: caminhoNoErp,
          method: request.method,
          // Query crua, com `Empresa` da sessão à frente: preserva chaves
          // repetidas e a codificação original dos demais pares (AD-205).
          queryString: queryComEmpresaDaSessao(queryString, sessao.codigoEmpresa),
          ...(contentTypeOriginal === undefined
            ? {}
            : { headersExtras: { 'Content-Type': contentTypeOriginal } }),
          body: corpoDaRequisicao(corpo),
        },
        { env: deps.env, ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}) },
      ),
    );

    if (resultado === null) {
      return reply;
    }

    // A renovação pode ter acontecido em qualquer uma das duas chamadas; a mais
    // recente é a que vale.
    const sessaoRenovada = resultado.sessaoRenovada ?? operador.sessaoRenovada;
    if (sessaoRenovada !== null) {
      reply.setCookie(
        SESSION_COOKIE_NAME,
        deps.cifrador.cifrar(sessaoRenovada),
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

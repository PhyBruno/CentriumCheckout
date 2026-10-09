import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { Env } from '../config/env';
import {
  ENTRADA_COOKIE_OPTIONS,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
  type CifradorDeSessao,
} from '../session/cookie';
import { criarDecifradorDeEntrada } from '../session/entradaCifrada';
import { ErroTrocaDeToken, trocarCredenciaisPorToken } from '../session/tokenExchange';
import { buscarUsuarioCodigo } from '../session/getSessao';
import {
  COOKIE_ENTRADA,
  PARAM_ERRO_ACESSO,
  VALOR_COOKIE_ENTRADA,
  VALOR_ERRO_ACESSO,
} from '../../shared/erroAcesso';

/**
 * Campos do redirect do ERP (`contracts/session-bff-api.md`), como saem da
 * query depois de decifrada (AD-276). Todos vêm do ERP — nunca são digitados
 * pelo operador.
 */
const sessionStartQuerySchema = z.object({
  tenant: z.string().min(1),
  client_id: z.string().min(1),
  client_secret: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
  Repository: z.string().min(1),
  codigoEmpresa: z.string().min(1),
});

/**
 * O que vem depois do `?`, sem interpretar.
 *
 * `request.query` não serve aqui: o parser de query string trocaria os `+` do
 * base64 por espaço e partiria o texto no `=` do padding.
 */
function queryBruta(url: string | undefined): string {
  const inicio = url?.indexOf('?') ?? -1;
  return url === undefined || inicio < 0 ? '' : url.slice(inicio + 1);
}

export interface SessionStartDeps {
  readonly env: Env;
  readonly cifrador: CifradorDeSessao;
  readonly fetchImpl?: typeof fetch;
  /** URL limpa da SPA para onde o navegador é redirecionado (padrão: `/`). */
  readonly destinoAposLogin?: string;
  /** Espera entre tentativas; injetável para o teste não dormir de verdade. */
  readonly esperar?: (ms: number) => Promise<void>;
}

/**
 * Esperas entre as tentativas de cada etapa da entrada.
 *
 * Duas repetições, com pouco mais de um segundo no pior caso: a falha que elas
 * cobrem é o blip — um `502` do proxy do ERP, um DNS que demorou, a rede que
 * piscou —, e essa passa em centenas de milissegundos. ERP fora de verdade não
 * volta em um segundo, e insistir mais só faria o operador encarar uma tela
 * parada antes de receber a mesma resposta.
 */
const ESPERAS_ENTRE_TENTATIVAS_MS = [250, 750] as const;

function dormir(ms: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

/**
 * Repete uma etapa da entrada enquanto o desfecho for **indisponibilidade**.
 *
 * É a diferença entre "o ERP não pôde responder agora" e "o ERP respondeu, e a
 * resposta foi não": a primeira tem chance na tentativa seguinte, a segunda
 * daria exatamente o mesmo resultado. Só a primeira é repetida.
 *
 * A repetição acontece **aqui**, e não como um botão na tela, porque só o BFF
 * tem com que repetir: as credenciais do redirect ficam nesta função e são
 * descartadas antes de o navegador chegar à SPA (FR-001/SC-001). Da SPA, um
 * "Tentar novamente" não teria o que reenviar.
 */
async function comRepeticao<T>(
  executar: () => Promise<T>,
  indisponivel: (resultado: T) => boolean,
  esperar: (ms: number) => Promise<void>,
): Promise<T> {
  let resultado = await executar();

  for (const espera of ESPERAS_ENTRE_TENTATIVAS_MS) {
    if (!indisponivel(resultado)) {
      return resultado;
    }
    await esperar(espera);
    resultado = await executar();
  }

  return resultado;
}

type DesfechoDeToken =
  | {
      readonly autenticado: true;
      readonly access_token: string;
      /** `user_guid` da resposta do OAuth, quando o GAM o devolve (AD-267). */
      readonly usuarioGam: string | null;
    }
  | { readonly autenticado: false; readonly erro: ErroTrocaDeToken };

/** `user_guid` do OAuth: texto não vazio ou `null` (mesma regra de `extrairUsuarioGam`). */
function usuarioGamDoToken(userGuid: string | undefined): string | null {
  const valor = userGuid?.trim() ?? '';
  return valor === '' ? null : valor;
}

/**
 * Só indisponibilidade se repete: `rede` é o ERP inalcançável e `5xx` é o ERP
 * em mau estado. Um `4xx` é veredito sobre as credenciais — repetir o mesmo
 * `password` grant devolveria a mesma recusa, e ainda gastaria tentativa de
 * autenticação contra a conta do operador.
 */
function tokenIndisponivel(desfecho: DesfechoDeToken): boolean {
  const NA_FAIXA_DE_ERRO_DO_SERVIDOR = 500;
  return (
    !desfecho.autenticado &&
    (desfecho.erro.motivo === 'rede' ||
      (desfecho.erro.motivo === 'erp' && desfecho.erro.status >= NA_FAIXA_DE_ERRO_DO_SERVIDOR))
  );
}

/**
 * `GET /session/start` — ponto de entrada único do Checkout (T014, US1).
 *
 * Recebe o redirect do ERP com as credenciais do operador cifradas (AD-276),
 * troca por `access_token`, cifra tudo no cookie `HttpOnly` e redireciona para a
 * URL limpa da SPA. Nenhum dado sensível sobra na URL de destino (FR-001,
 * FR-002, SC-001).
 */
export function registrarRotaSessionStart(app: FastifyInstance, deps: SessionStartDeps): void {
  const decifrador = criarDecifradorDeEntrada(deps.env.entradaAesKey, deps.env.entradaAesIv);
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
    // Só entra quem cifrou com a chave deste ambiente. Uma query em claro, de
    // outra chave ou adulterada para aqui, ANTES de gastar uma tentativa de
    // autenticação OAuth — é o papel que a `validationKey` cumpria (AD-276).
    const entrada = decifrador.decifrar(queryBruta(request.raw.url));

    if (entrada === null) {
      request.log.warn('redirect sem entrada cifrada válida');
      return recusarEntrada(reply);
    }

    const query = sessionStartQuerySchema.safeParse(
      Object.fromEntries(new URLSearchParams(entrada)),
    );

    if (!query.success) {
      // Não ecoa os valores recebidos: a query carrega credenciais. Manda para a
      // SPA, que mostra o painel terminal — quem chega aqui é um **navegador**
      // vindo de um redirect, não um cliente de API, e um JSON cru na tela não
      // diz ao operador o que fazer (pedido do usuário, 2026-09-08).
      request.log.warn(
        { campos: query.error.issues.map((issue) => issue.path.join('.')) },
        'entrada decifrada sem os campos obrigatórios',
      );
      return recusarEntrada(reply);
    }

    const erpDeps = { env: deps.env, ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}) };
    const esperar = deps.esperar ?? dormir;

    try {
      const autenticacao = await comRepeticao(
        async (): Promise<DesfechoDeToken> => {
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
              erpDeps,
            );
            return {
              autenticado: true,
              access_token: token.access_token,
              usuarioGam: usuarioGamDoToken(token.user_guid),
            };
          } catch (erro) {
            if (erro instanceof ErroTrocaDeToken) {
              return { autenticado: false, erro };
            }
            throw erro;
          }
        },
        tokenIndisponivel,
        esperar,
      );

      if (!autenticacao.autenticado) {
        request.log.warn(
          { motivo: autenticacao.erro.motivo, status: autenticacao.erro.status },
          'falha ao iniciar sessão',
        );
        return recusarEntrada(reply);
      }

      // Quem é este operador, segundo o ERP. É a única informação da sessão que
      // não vem no redirect, e sem ela o BFF não teria com que reescrever o
      // `UsuarioCodigo` que o navegador manda no retrato da venda (AD-224).
      const operador = await comRepeticao(
        () =>
          buscarUsuarioCodigo(
            {
              access_token: autenticacao.access_token,
              tenant: query.data.tenant,
              codigoEmpresa: query.data.codigoEmpresa,
              username: query.data.username,
            },
            erpDeps,
          ),
        (resultado) => resultado.situacao === 'indisponivel',
        esperar,
      );

      if (operador.situacao !== 'identificado') {
        // Esgotadas as tentativas, a sessão não nasce: sem operador
        // identificado, toda NFCe que ela emitisse sairia sem dizer quem a
        // emitiu. O operador reabre pelo CentriumWEB, que é o único caminho que
        // carrega as credenciais de novo.
        request.log.warn({ situacao: operador.situacao }, 'operador não identificado pelo ERP');
        return recusarEntrada(reply);
      }

      const usuarioGam = autenticacao.usuarioGam ?? operador.usuarioGam;

      const cookie = deps.cifrador.cifrar({
        access_token: autenticacao.access_token,
        tenant: query.data.tenant,
        client_id: query.data.client_id,
        client_secret: query.data.client_secret,
        username: query.data.username,
        password: query.data.password,
        Repository: query.data.Repository,
        codigoEmpresa: query.data.codigoEmpresa,
        usuarioCodigo: operador.usuarioCodigo,
        // Operador no TEF (feature 010). Ausente não recusa a entrada: quem não
        // tem TEF vinculado continua vendendo, e a janela do TEF explica a
        // recusa se ele tentar cobrar no cartão. O campo só entra no cookie
        // quando existe — `usuarioGam: undefined` gravaria uma chave vazia.
        // O `user_guid` do OAuth vem primeiro (AD-267): é o GAM falando do
        // próprio usuário autenticado, e o `GetSessao` ainda não publica o campo.
        ...(usuarioGam === null ? {} : { usuarioGam }),
      });

      return (
        reply
          .setCookie(SESSION_COOKIE_NAME, cookie, SESSION_COOKIE_OPTIONS)
          // Marca legível de "houve entrada válida" — é o que decide, mais
          // tarde, se uma falha de carregamento merece "Tentar novamente" ou a
          // tela terminal. Gravada **só** aqui, no único ponto em que uma sessão
          // de fato nasce.
          .setCookie(COOKIE_ENTRADA, VALOR_COOKIE_ENTRADA, ENTRADA_COOKIE_OPTIONS)
          .redirect(destino, 302)
      );
    } catch (erro) {
      // As falhas esperadas do ERP já foram tratadas acima, com repetição. O que
      // chega aqui é imprevisto (bug) — e também é um navegador na tela: o
      // painel terminal em vez da página de erro padrão do Fastify.
      request.log.error({ erro }, 'falha não tratada ao iniciar sessão');
      return recusarEntrada(reply);
    }
  });
}

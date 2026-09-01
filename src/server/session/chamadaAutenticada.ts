import type { Env } from '../config/env';
import { montarBaseUrlErp } from '../config/env';
import type { SessaoOperador } from './cookie';
import { ErroTrocaDeToken, trocarCredenciaisPorToken } from './tokenExchange';

/**
 * Renovação silenciosa de sessão (AUTH-06 / FR-005), compartilhada por
 * `GET /api/bootstrap` (T019) e pelo proxy `/api/erp/*` (T031).
 *
 * Ambas as rotas precisam do mesmo comportamento em `401`: reautenticar com as
 * credenciais do cookie, regravar o cookie e refazer a chamada original. Isso
 * vive aqui para ter uma única razão para mudar (Constitution II).
 */

/** Renovação falhou — único gatilho de logout automático (FR-006). */
export class ErroSessaoEncerrada extends Error {
  constructor(readonly causa: ErroTrocaDeToken) {
    super('Não foi possível renovar a sessão do operador');
    this.name = 'ErroSessaoEncerrada';
  }
}

export interface RequisicaoErp {
  /** Caminho a partir da raiz do host do ERP, ex.: `/ApiCentriumOAuth/GetSessao`. */
  readonly caminho: string;
  readonly method?: string;
  readonly query?: Record<string, string>;
  /**
   * Query string crua, já codificada, usada pelo proxy `/api/erp/*`.
   * Tem precedência sobre `query`: repassar o texto original preserva chaves
   * repetidas (`?a=1&a=2`), que um `Record<string, string>` achataria.
   */
  readonly queryString?: string;
  readonly headersExtras?: Record<string, string>;
  /** Usa o `BodyInit` do próprio fetch para não divergir do runtime. */
  readonly body?: BodyInit | undefined;
}

export interface ResultadoChamadaAutenticada {
  readonly resposta: Response;
  /** Preenchido só quando houve renovação — o chamador deve regravar o cookie. */
  readonly sessaoRenovada: SessaoOperador | null;
}

export interface ChamadaAutenticadaDeps {
  readonly env: Env;
  readonly fetchImpl?: typeof fetch;
}

function montarUrl(env: Env, sessao: SessaoOperador, requisicao: RequisicaoErp): string {
  const base = montarBaseUrlErp(env, sessao.tenant);

  if (requisicao.queryString !== undefined) {
    const crua = requisicao.queryString;
    return `${base}${requisicao.caminho}${crua === '' ? '' : `?${crua}`}`;
  }

  const query = new URLSearchParams(requisicao.query ?? {});
  const sufixo = query.size > 0 ? `?${query.toString()}` : '';
  return `${base}${requisicao.caminho}${sufixo}`;
}

function montarHeaders(sessao: SessaoOperador, requisicao: RequisicaoErp): Record<string, string> {
  return {
    // O contrato do ERP usa o esquema `OAuth`, não `Bearer` (AD-019).
    Authorization: `OAuth ${sessao.access_token}`,
    Empresa: sessao.codigoEmpresa,
    'Content-Type': 'application/json',
    ...requisicao.headersExtras,
  };
}

/**
 * Executa uma chamada autenticada ao ERP, renovando o token uma única vez se o
 * ERP responder `401`.
 *
 * A renovação é transparente ao JS do navegador: não há retry no cliente.
 */
export async function chamarErpComRenovacao(
  sessao: SessaoOperador,
  requisicao: RequisicaoErp,
  deps: ChamadaAutenticadaDeps,
): Promise<ResultadoChamadaAutenticada> {
  const executarFetch = deps.fetchImpl ?? fetch;

  const executar = async (sessaoAtual: SessaoOperador): Promise<Response> =>
    executarFetch(montarUrl(deps.env, sessaoAtual, requisicao), {
      method: requisicao.method ?? 'GET',
      headers: montarHeaders(sessaoAtual, requisicao),
      ...(requisicao.body === undefined ? {} : { body: requisicao.body }),
    });

  const primeira = await executar(sessao);

  if (primeira.status !== 401) {
    return { resposta: primeira, sessaoRenovada: null };
  }

  let token;
  try {
    token = await trocarCredenciaisPorToken(sessao, {
      env: deps.env,
      ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
    });
  } catch (erro) {
    if (erro instanceof ErroTrocaDeToken) {
      throw new ErroSessaoEncerrada(erro);
    }
    throw erro;
  }

  const sessaoRenovada: SessaoOperador = { ...sessao, access_token: token.access_token };

  return { resposta: await executar(sessaoRenovada), sessaoRenovada };
}

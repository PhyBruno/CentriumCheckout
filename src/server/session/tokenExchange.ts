import { montarBaseUrlErp, type Env } from '../config/env';
import {
  tokenResponseSchema,
  type TokenResponse,
} from '../../shared/schemas/token-response.schema';

/** Credenciais originais do redirect do ERP, guardadas cifradas no cookie. */
export interface CredenciaisSessao {
  readonly tenant: string;
  readonly client_id: string;
  readonly client_secret: string;
  readonly username: string;
  readonly password: string;
  readonly Repository: string;
}

export type MotivoFalhaToken =
  /** O ERP respondeu com erro (credenciais recusadas, indisponibilidade etc.). */
  | 'erp'
  /** O ERP respondeu 2xx, mas o corpo não bate com o contrato (Constitution IV). */
  | 'contrato'
  /** A chamada ao ERP não completou (rede, DNS, timeout). */
  | 'rede';

export class ErroTrocaDeToken extends Error {
  constructor(
    readonly motivo: MotivoFalhaToken,
    /** Status a repassar ao chamador do BFF. */
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ErroTrocaDeToken';
  }
}

export interface TokenExchangeDeps {
  readonly env: Env;
  /** Injetável para teste (Dependency Inversion — Constitution II). */
  readonly fetchImpl?: typeof fetch;
}

const CAMINHO_TOKEN = '/oauth/access_token';

/**
 * Troca credenciais do operador por um `access_token` do ERP (T011).
 *
 * Mesma função para o login inicial (US1, `GET /session/start`) e para a
 * renovação silenciosa em `401` (US2/US3) — a renovação reautentica com um novo
 * `password` grant, não com `refresh_token` (AD-019).
 *
 * A chamada é sempre servidor-a-servidor; o navegador nunca a faz diretamente.
 */
export async function trocarCredenciaisPorToken(
  credenciais: CredenciaisSessao,
  deps: TokenExchangeDeps,
): Promise<TokenResponse> {
  const executarFetch = deps.fetchImpl ?? fetch;
  const url = `${montarBaseUrlErp(deps.env, credenciais.tenant)}${CAMINHO_TOKEN}`;

  const corpo = new URLSearchParams({
    client_id: credenciais.client_id,
    client_secret: credenciais.client_secret,
    grant_type: 'password',
    username: credenciais.username,
    password: credenciais.password,
    additionalParameters: JSON.stringify({
      AuthenticationTypeName: 'local',
      Repository: credenciais.Repository,
    }),
  });

  let resposta: Response;
  try {
    resposta = await executarFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: corpo.toString(),
    });
  } catch (causa) {
    throw new ErroTrocaDeToken(
      'rede',
      502,
      `Falha de rede ao chamar ${CAMINHO_TOKEN} do ERP: ${String(causa)}`,
    );
  }

  if (!resposta.ok) {
    throw new ErroTrocaDeToken(
      'erp',
      resposta.status,
      `ERP recusou a troca de token (HTTP ${resposta.status})`,
    );
  }

  let json: unknown;
  try {
    json = await resposta.json();
  } catch {
    throw new ErroTrocaDeToken('contrato', 502, 'Resposta de token do ERP não é JSON válido');
  }

  // Validação de fronteira antes de repassar ao chamador (T009 / Constitution IV).
  const validado = tokenResponseSchema.safeParse(json);
  if (!validado.success) {
    throw new ErroTrocaDeToken(
      'contrato',
      502,
      'Resposta de token do ERP não bate com o contrato esperado',
    );
  }

  return validado.data;
}

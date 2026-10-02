import { resolve } from 'node:path';
import { z } from 'zod';

/**
 * Configuração de ambiente do BFF.
 *
 * Todas as variáveis são injetadas pelo Docker (`docker-compose.yml` em dev,
 * ambiente de deploy em produção) — ver `.env.example`.
 */
export interface Env {
  /** Domínio base do ERP. O host efetivo é `<tenant>.<baseDomain>` (AD-019). */
  readonly baseDomain: string;
  /** Credencial fixa por ambiente que valida a origem do redirect do ERP (AD-022). */
  readonly validationKey: string;
  /** Chave de servidor usada para cifrar o cookie de sessão. */
  readonly sessionSecret: string;
  readonly port: number;
  readonly erpProtocol: 'http' | 'https';
  /**
   * Somente dev/teste: host fixo do ERP, substituindo `<tenant>.<baseDomain>`.
   * Existe porque subdomínios de `localhost` não resolvem em todos os sistemas
   * operacionais, o que impediria rodar os cenários do `quickstart.md` contra um
   * ERP mockado local. `null` em produção.
   */
  readonly erpHostOverride: string | null;
  /**
   * Só no beta: URL do proxy que pega o token no `.apps` e manda a API ao
   * `.prototype` (`deploy/beta/erp-proxy.mjs`). O tenant vai como primeiro
   * segmento do caminho, para que um proxy atenda vários tenants. Vale só para
   * chamada servidor→ERP: o navegador não alcança o proxy. Provisório, com
   * `null` fora do beta. Sem barra no final.
   */
  readonly erpProxyUrl: string | null;
  readonly nodeEnv: 'development' | 'production' | 'test';
  /** Serve o build da SPA pelo próprio processo Node (produção). */
  readonly serveStaticClient: boolean;
  /** Diretório do build da SPA servido como estático. */
  readonly clientDistDir: string;
}

const SESSION_SECRET_MIN_LENGTH = 32;

const envSchema = z
  .object({
    baseDomain: z.string().min(1, 'baseDomain é obrigatório'),
    validationKey: z.string().min(1, 'validationKey é obrigatório'),
    SESSION_SECRET: z
      .string()
      .min(
        SESSION_SECRET_MIN_LENGTH,
        `SESSION_SECRET deve ter ao menos ${SESSION_SECRET_MIN_LENGTH} caracteres`,
      ),
    PORT: z.coerce.number().int().positive().default(3000),
    ERP_PROTOCOL: z.enum(['http', 'https']).default('https'),
    ERP_HOST_OVERRIDE: z.string().min(1).optional(),
    ERP_PROXY_URL: z.url({ protocol: /^https?$/ }).optional(),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    SERVE_STATIC_CLIENT: z.enum(['true', 'false']).optional(),
    CLIENT_DIST_DIR: z.string().min(1).default('dist/client'),
  })
  .refine((valor) => valor.ERP_PROXY_URL === undefined || valor.ERP_HOST_OVERRIDE === undefined, {
    // Os dois substituem o destino; aceitar ambos esconderia qual deles vale.
    path: ['ERP_PROXY_URL'],
    message: 'ERP_PROXY_URL não combina com ERP_HOST_OVERRIDE — use um ou outro',
  });

/**
 * Lê e valida a configuração de ambiente, falhando rápido se algo obrigatório
 * estiver ausente ou malformado (T008).
 */
export function loadEnv(source: Record<string, string | undefined>): Env {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const detalhes = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Configuração de ambiente inválida — ${detalhes}`);
  }

  const value = parsed.data;
  const nodeEnv = value.NODE_ENV;

  return {
    baseDomain: value.baseDomain,
    validationKey: value.validationKey,
    sessionSecret: value.SESSION_SECRET,
    port: value.PORT,
    erpProtocol: value.ERP_PROTOCOL,
    erpHostOverride: value.ERP_HOST_OVERRIDE ?? null,
    erpProxyUrl: value.ERP_PROXY_URL?.replace(/\/+$/, '') ?? null,
    nodeEnv,
    serveStaticClient:
      value.SERVE_STATIC_CLIENT === undefined
        ? nodeEnv === 'production'
        : value.SERVE_STATIC_CLIENT === 'true',
    clientDistDir: resolve(process.cwd(), value.CLIENT_DIST_DIR),
  };
}

/**
 * Monta a URL base do ERP para um tenant: `<protocolo>://<tenant>.<baseDomain>`
 * (AD-019). Vale para as chamadas que o BFF faz ao ERP. Em dev/teste,
 * `ERP_HOST_OVERRIDE` substitui o host inteiro; no beta, `ERP_PROXY_URL` põe o
 * proxy na frente, com o tenant no caminho.
 */
export function montarBaseUrlErp(env: Env, tenant: string): string {
  if (env.erpProxyUrl !== null) {
    return `${env.erpProxyUrl}/${encodeURIComponent(tenant)}`;
  }
  return montarBaseUrlErpNavegador(env, tenant);
}

/**
 * URL base do ERP para onde o **navegador** é mandado (menu gerencial). Ignora
 * `ERP_PROXY_URL`, porque o proxy só existe na rede interna do servidor.
 */
export function montarBaseUrlErpNavegador(env: Env, tenant: string): string {
  const host = env.erpHostOverride ?? `${tenant}.${env.baseDomain}`;
  return `${env.erpProtocol}://${host}`;
}

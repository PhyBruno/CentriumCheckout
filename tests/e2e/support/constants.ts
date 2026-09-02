/** Portas e credenciais sintéticas compartilhadas pela stack E2E e pelos specs. */
export const PORTA_BFF = 3100;
export const PORTA_ERP_MOCK = 4010;

export const URL_BFF = `http://127.0.0.1:${PORTA_BFF}`;
export const URL_ERP_MOCK = `http://127.0.0.1:${PORTA_ERP_MOCK}`;

export const VALIDATION_KEY = 'chave-de-validacao-e2e';
export const SESSION_SECRET = 'segredo-e2e-com-mais-de-32-caracteres!!';

/** Query params sintéticos equivalentes ao redirect do ERP. */
export const CREDENCIAIS_REDIRECT = {
  tenant: 'acme',
  client_id: 'client-sintetico',
  client_secret: 'secret-sintetico',
  username: 'operador.teste',
  password: 'senha-sintetica',
  Repository: '00000000-0000-0000-0000-000000000000',
  codigoEmpresa: '1',
} as const;

export function urlSessionStart(
  overrides: Partial<Record<string, string>> = {},
  validationKey: string = VALIDATION_KEY,
): string {
  const params = new URLSearchParams({
    ...CREDENCIAIS_REDIRECT,
    validationKey,
    ...overrides,
  });
  return `/session/start?${params.toString()}`;
}

import { z } from 'zod';

/**
 * Resposta de `POST /oauth/access_token` do ERP (OAuth2 `password` grant).
 *
 * Validação de fronteira exigida pela Constitution IV: toda resposta externa do
 * ERP é validada antes de entrar no domínio da aplicação — inclusive a troca e a
 * renovação de token (T009, achado C1 do `/speckit-analyze`).
 *
 * O objeto é *loose*: o ERP pode acrescentar campos ao contrato sem quebrar o
 * Checkout. Só `access_token` é obrigatório — é o único campo que o BFF consome.
 * `refresh_token` é aceito se vier, mas nunca usado: a renovação reautentica com
 * um novo `password` grant (AD-019).
 */
export const tokenResponseSchema = z.looseObject({
  access_token: z.string().min(1),
  token_type: z.string().optional(),
  expires_in: z.number().optional(),
  scope: z.string().optional(),
  refresh_token: z.string().optional(),
});

export type TokenResponse = z.infer<typeof tokenResponseSchema>;

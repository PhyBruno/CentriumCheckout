import { z } from 'zod';

/**
 * Configuração do ponto de venda devolvida por `GET /api/bootstrap`
 * (`data-model.md` § Configuração do Ponto de Venda).
 *
 * O payload real do `GetSessao` tem ~5MB e muitos campos consumidos por outras
 * features. Os objetos são *loose* de propósito: esta feature valida só o que
 * precisa garantir na fronteira e repassa o resto íntegro para o Dexie, sem
 * transformar — o Checkout não reinterpreta dado do ERP (Constitution III).
 */

/** Tipo de preço padrão do PDV — inteiro de 1 a 11 no contrato do ERP. */
const TIPO_PRECO_MIN = 1;
const TIPO_PRECO_MAX = 11;

export const sessaoUsuarioSchema = z.looseObject({
  TipoPreco: z.number().int().min(TIPO_PRECO_MIN).max(TIPO_PRECO_MAX),
  CadMaqCod: z.string(),
  /**
   * Lista de preço do cliente default (`CliListCod` dele, com fallback `1`
   * aplicado pelo ERP) — AD-108. Não é "lista padrão da empresa": esse conceito
   * não existe no domínio (AD-092).
   */
  ListaPrecoDefault: z.number().int(),
  /**
   * Repassado como está, sem interpretar nem reformatar (AD-104). A estrutura
   * interna (array JSON de strings com 7 campos delimitados por `;`) é validada
   * pela feature 013, não aqui.
   */
  CenarioPagamento: z.string(),
});

export const bootstrapPayloadSchema = z.looseObject({
  /** Faz parte da chave do registro no Dexie — isola tenants (FR-009). */
  tenant: z.string().min(1),
  /** Reenviado como `Empresa` nas chamadas via `/api/erp/*` (AD-019). */
  codigoEmpresa: z.string().min(1),
  SessaoUsuario: sessaoUsuarioSchema,
});

export type SessaoUsuario = z.infer<typeof sessaoUsuarioSchema>;
export type BootstrapPayload = z.infer<typeof bootstrapPayloadSchema>;

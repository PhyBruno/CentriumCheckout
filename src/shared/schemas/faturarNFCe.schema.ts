import { z } from 'zod';

/**
 * Validação de fronteira da resposta de `POST /api/erp/FaturarNFCe` (T003,
 * Constitution IV — `contracts/faturamento-api.md`).
 *
 * O envelope real vem do contrato do ERP (`Fluxograma - Diagrama -
 * Alinhamentos/ApiCentriumOAuth.yaml`, `FaturarNFCeOutput` na linha 725):
 * a nota fiscal chega **dentro** de `OutCheckoutFaturarNFCe`, não na raiz da
 * resposta. `contracts/faturamento-api.md` desenha o exemplo achatado
 * (`{ "NotaFiscal": … }`) — o YAML é a fonte autoritativa (AD-024, confirmado
 * campo a campo contra a KB do GenExus), então é ele que este schema segue.
 *
 * Objetos `loose` de propósito: `CheckoutFaturarNFCe` é ecoado inteiro na
 * resposta (produtos, formas de pagamento, log) e esta feature só precisa
 * garantir, na fronteira, os dois campos que consome. O resto passa íntegro —
 * o Checkout não reinterpreta dado do ERP (Constitution III).
 */

/** `GeneXus.Common.Messages_Message` (YAML, linha 1046). */
export const mensagemErpSchema = z.looseObject({
  Id: z.string().optional(),
  Type: z.number().int().optional(),
  Description: z.string().optional(),
});

/**
 * `CheckoutFaturarNFCe.NotaFiscal` (YAML, linha 1604), restrito ao que a
 * decisão de impressão consome (`data-model.md` §3/§5).
 *
 * `min(1)` nos dois campos é o ponto do contrato: uma NFCe **não** autorizada
 * volta com `PDFImpressao`/`XMLImpressao` vazios, e uma resposta 2xx nesse
 * estado é falha de negócio — nunca sucesso parcial que chegaria à impressão
 * com um PDF vazio.
 */
export const notaFiscalRespostaSchema = z.looseObject({
  PDFImpressao: z.string().min(1),
  XMLImpressao: z.string().min(1),
});

/** Resposta de `FATURAR`: exige a nota fiscal pronta para apresentação. */
export const faturarNFCeOutputSchema = z.looseObject({
  OutCheckoutFaturarNFCe: z.looseObject({
    NotaFiscal: notaFiscalRespostaSchema,
  }),
  messages: z.array(mensagemErpSchema).optional(),
});

/**
 * Resposta de `SUSPENDER`: **não** exige `NotaFiscal`.
 *
 * Suspender não emite documento fiscal (`FR-002`, `contracts/faturamento-api.md`
 * § "Efeito colateral em sucesso", passo 5) — exigir o mesmo shape de `FATURAR`
 * transformaria toda suspensão bem-sucedida em falha de negócio.
 */
export const suspenderNFCeOutputSchema = z.looseObject({
  messages: z.array(mensagemErpSchema).optional(),
});

export type MensagemErp = z.infer<typeof mensagemErpSchema>;
export type NotaFiscalResposta = z.infer<typeof notaFiscalRespostaSchema>;
export type FaturarNFCeOutput = z.infer<typeof faturarNFCeOutputSchema>;

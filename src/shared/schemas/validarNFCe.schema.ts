import { z } from 'zod';

/**
 * Validação de fronteira da resposta de `POST /api/erp/ValidarNFCe` (T004,
 * Constitution IV — `specs/014-validacao-previa-nfce/contracts/erp-validacao-api.md`).
 *
 * O contrato do ERP (`Fluxograma - Diagrama - Alinhamentos/ApiCentriumOAuth.yaml`)
 * devolve o veredito achatado na raiz: `Valido` e `messages[]`. Diferente de
 * `FaturarNFCe`, não há envelope `OutCheckout*` a atravessar.
 */

/**
 * `GeneXus.Common.Messages_Message` na forma que esta feature consome.
 *
 * `Id` ganha default `''` porque o ERP hoje manda sempre `'9999'` e o campo não
 * participa de nenhuma decisão — perder a mensagem inteira por causa dele seria
 * esconder do operador o motivo real da recusa. `Type` e `Description`, ao
 * contrário, são exigidos: sem `Description` não há o que exibir, e é o texto
 * íntegro do ERP que `FR-007` manda mostrar.
 *
 * `Type` é lido como número cru — **não** é mapeado para bloqueio em lugar
 * nenhum (AD-110). Um valor de severidade desconhecido cai na apresentação
 * neutra do mapper, sem derrubar a tela.
 */
export const mensagemValidacaoSchema = z.object({
  Id: z.string().default(''),
  Type: z.number().int(),
  Description: z.string(),
});

/**
 * Resposta de `ValidarNFCe`.
 *
 * **`Valido` não tem default, e isto é o ponto do schema.** Uma resposta 200
 * sem o campo é `RESPOSTA_INVALIDA` (⇒ `INDISPONIVEL`, `FR-009`), nunca um
 * aceite presumido: `.default(true)` faria uma resposta truncada aprovar
 * exatamente a venda que o gate existe para barrar, em silêncio.
 *
 * `messages` ausente vira lista vazia — combinado com `Valido = false`, é o
 * caso que aciona a mensagem genérica de `FR-008`.
 */
export const validarNFCeOutputSchema = z.object({
  Valido: z.boolean(),
  messages: z.array(mensagemValidacaoSchema).default([]),
});

export type MensagemValidacaoErp = z.infer<typeof mensagemValidacaoSchema>;
export type ValidarNFCeOutput = z.infer<typeof validarNFCeOutputSchema>;

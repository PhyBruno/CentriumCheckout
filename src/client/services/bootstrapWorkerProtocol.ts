import type { BootstrapPayload } from '../../shared/schemas/bootstrap.schema';

/**
 * Protocolo de mensagens do Web Worker de bootstrap.
 *
 * Fica separado de `bootstrapWorker.ts` para que o cliente possa tipar as
 * mensagens sem importar — e portanto sem executar — o módulo do worker.
 */

export interface RequisicaoWorker {
  /**
   * Corpo cru da resposta de `GET /api/bootstrap`, ainda em texto.
   *
   * O `JSON.parse` de ~5MB também roda no worker: fazê-lo na thread principal
   * anularia o propósito de tirar o parse de lá (AUTH-04).
   */
  readonly texto: string;
}

export type RespostaWorker =
  | { readonly ok: true; readonly payload: BootstrapPayload; readonly versionHash: string }
  | { readonly ok: false; readonly erro: string };

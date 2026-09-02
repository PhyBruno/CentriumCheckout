import type { BootstrapPayload } from '../../shared/schemas/bootstrap.schema';

/**
 * Protocolo de mensagens do Web Worker de bootstrap.
 *
 * Fica separado de `bootstrapWorker.ts` para que o cliente possa tipar as
 * mensagens sem importar — e portanto sem executar — o módulo do worker.
 */

export interface RequisicaoWorker {
  /**
   * Correlaciona requisição e resposta.
   *
   * Um `Worker` tem um único canal `message`: sem um id, duas análises em voo
   * ao mesmo tempo (ex.: duplo clique em "Tentar novamente") seriam ambas
   * resolvidas pela primeira resposta que chegasse, e a segunda resposta real
   * não seria entregue a ninguém.
   */
  readonly id: string;
  /**
   * Corpo cru da resposta de `GET /api/bootstrap`, ainda em texto.
   *
   * O `JSON.parse` de ~5MB também roda no worker: fazê-lo na thread principal
   * anularia o propósito de tirar o parse de lá (AUTH-04).
   */
  readonly texto: string;
}

/** O `id` é o mesmo da `RequisicaoWorker` que originou a resposta. */
export type RespostaWorker =
  | {
      readonly id: string;
      readonly ok: true;
      readonly payload: BootstrapPayload;
      readonly versionHash: string;
    }
  | { readonly id: string; readonly ok: false; readonly erro: string };

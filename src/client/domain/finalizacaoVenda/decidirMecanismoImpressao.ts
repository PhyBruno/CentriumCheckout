/**
 * Decisão do caminho de entrega do documento fiscal (T007, `data-model.md` §5).
 *
 * Domínio puro: sem React, Zustand, Query ou rede. É a única peça que conhece a
 * correspondência `SessaoUsuario.TipoImpressao` → mecanismo, o que mantém a
 * feature aberta a um terceiro mecanismo sem tocar no hook orquestrador nem na
 * UI (Open/Closed, Constitution II).
 */

/** `SessaoUsuario.TipoImpressao` (`ApiCentriumOAuth.yaml`, linha 900). */
export type TipoImpressao = 'E' | 'P';

export type MecanismoImpressao =
  /** Impressão direta pelo serviço local do PDV (AD-083). */
  | 'direta'
  /** Exibição/download do PDF já gerado pelo ERP. */
  | 'pdf';

/** `TipoImpressao` fora do conjunto fechado do contrato. */
export class ErroTipoImpressaoDesconhecido extends Error {
  constructor(readonly tipoImpressao: string) {
    super(
      `TipoImpressao '${tipoImpressao}' não pertence ao contrato do ERP ('E' ou 'P'); nenhum mecanismo de impressão pode ser escolhido (data-model.md §5, AD-082).`,
    );
    this.name = 'ErroTipoImpressaoDesconhecido';
  }
}

/**
 * `FR-008`: o mecanismo é decidido pela configuração do ambiente, nunca por
 * escolha do operador a cada venda.
 *
 * Um valor fora de `{'E','P'}` é erro de fronteira e **lança** — inventar um
 * terceiro comportamento (cair no PDF "por segurança", por exemplo) faria uma
 * configuração corrompida do PDV virar um caminho de impressão silencioso, que
 * é exatamente o que a Constitution IV existe para impedir. O schema Zod de
 * `SessaoUsuario` (feature 002) já barra isso antes; esta checagem existe para
 * o caso de a entrada vir de um caller não totalmente tipado.
 */
export function decidirMecanismoImpressao(tipoImpressao: TipoImpressao): MecanismoImpressao {
  switch (tipoImpressao) {
    case 'E':
      return 'direta';
    case 'P':
      return 'pdf';
    default:
      throw new ErroTipoImpressaoDesconhecido(String(tipoImpressao));
  }
}

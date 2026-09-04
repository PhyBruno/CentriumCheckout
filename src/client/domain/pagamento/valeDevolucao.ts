/**
 * Elegibilidade e interpretação de resposta de vale devolução (T006).
 *
 * Domínio puro: `ehFormaDeValeDevolucao` decide sem rede: `interpretarRespostaTicket`
 * apenas traduz um shape já validado na fronteira Zod (produzido por
 * `src/shared/schemas/pagamento.schema.ts`, de outro agente) numa união
 * discriminada que o call site não consegue ler errado.
 */

import type { Centavos } from '../precificacao/dinheiro';
import type { FormaPagamento } from './formaPagamento';

/**
 * Shape já convertido na fronteira Zod a partir de `ValidaTicketDevolucaoOutput`
 * (`ValorTicket`, `Valido`, `Mensagem`): campos em camelCase, `valorTicket` já
 * em `Centavos`. `interpretarRespostaTicket` é a única leitora deste tipo.
 */
export interface RespostaValidaTicket {
  readonly valorTicket: Centavos;
  readonly valido: boolean;
  readonly mensagem: string;
}

export type ResultadoTicket =
  | { readonly valido: true; readonly valor: Centavos }
  | { readonly valido: false; readonly mensagem: string };

/** Valor de `FpgUtiCar` que marca a forma como sendo a de vale devolução. */
const MARCA_VALE_DEVOLUCAO = 'VDV';

/**
 * A forma **é** o vale devolução — não "aceita um vale por cima".
 *
 * `FpgUtiCar` é atributo de `TTPAGAM_WEB`, o cadastro de formas de pagamento,
 * copiado sem transformação para o catálogo da sessão por
 * `PCheckout_GetSessao` (verificado na KB, 2026-09-04). `'VDV'` nele identifica
 * a forma de vale devolução; **qualquer outro valor, inclusive vazio, é uma
 * forma comum**.
 *
 * **Isto substitui AD-048/`research.md` D10.** Aquela decisão lia `fpgUtiCar`
 * como um sinalizador de elegibilidade e tratava vazio como elegível — o que
 * tornava *toda* forma do catálogo capaz de receber um ticket, e obrigava o
 * operador a inserir um pagamento primeiro para só depois somar o vale por cima
 * dele. Além de não corresponder ao cadastro, aquele caminho conseguia levar
 * `Σ FormaValor` acima do total da nota. Decisão do usuário em 2026-09-04:
 * `'VDV'` e nada mais.
 *
 * A comparação normaliza espaços e caixa porque o campo é `string` livre no
 * cadastro — um `'vdv '` digitado pelo lojista descreve a mesma forma.
 */
export function ehFormaDeValeDevolucao(forma: FormaPagamento): boolean {
  return forma.fpgUtiCar.trim().toUpperCase() === MARCA_VALE_DEVOLUCAO;
}

/**
 * AD-101 (2026-08-27) — corrige o fallback `Mensagem === 'Ticket Válido'`
 * introduzido por AD-099: a inspeção original da KB (feita para AD-023) não
 * tinha visto a atribuição de `&Valido` no procedure chamador
 * (`PCheckout_ValidaTicketDevolucao`), que sempre a preenche explicitamente
 * nos dois ramos. A decisão passa a usar **só** `resposta.valido` — nenhum
 * fallback para `mensagem`, mesmo quando ela diverge do valor de `valido`.
 */
export function interpretarRespostaTicket(resposta: RespostaValidaTicket): ResultadoTicket {
  if (resposta.valido) {
    return { valido: true, valor: resposta.valorTicket };
  }
  return { valido: false, mensagem: resposta.mensagem };
}

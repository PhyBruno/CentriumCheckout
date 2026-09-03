/**
 * Elegibilidade e interpretação de resposta de vale devolução (T006).
 *
 * Domínio puro: `ehElegivelParaVale` decide sem rede: `interpretarRespostaTicket`
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

/**
 * AD-048/`research.md` D10 — decisão direta do usuário, contrária à
 * recomendação original: **ausência de dado é elegibilidade**. `fpgUtiCar`
 * só vem preenchido quando a empresa tem regra dinâmica de forma de
 * pagamento configurada (AD-024); no fallback do ERP ele chega vazio, e
 * tratar isso como inelegível bloquearia a maioria das empresas. Só um valor
 * explicitamente diferente de vale devolução (nem vazio, nem `'VDV'`) torna a
 * forma inelegível.
 */
export function ehElegivelParaVale(forma: FormaPagamento): boolean {
  const valor = forma.fpgUtiCar.trim();
  return valor === '' || valor === 'VDV';
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

/**
 * Piso de valor para gerar uma cobrança PIX (T003, `research.md` D13, AD-047).
 *
 * Domínio puro: só compara dois inteiros em centavos. `minimoPix` chega já
 * convertido de `ConfiguracoesPIX.MinimoPix` (`double` em reais) na fronteira
 * Zod do bootstrap (`shared/schemas/pagamento.schema.ts`) — nenhuma conversão
 * monetária acontece aqui (Constitution V).
 */

import type { Centavos } from '../precificacao/dinheiro';

export type ResultadoValorMinimoPix = { readonly ok: true } | { readonly ok: false };

/**
 * `>=`, não `>`: o mínimo configurado é um valor **aceito**, não o primeiro
 * valor recusado — cobrar exatamente R$ 5,00 com `MinimoPix` de R$ 5,00 é
 * legítimo.
 *
 * A checagem é client-side e existe para poupar uma ida ao ERP com uma cobrança
 * que ele recusaria; o ERP continua sendo a fonte de verdade (Constitution III).
 */
export function validarValorMinimoPix(
  saldoRestante: Centavos,
  minimoPix: Centavos,
): ResultadoValorMinimoPix {
  return saldoRestante >= minimoPix ? { ok: true } : { ok: false };
}

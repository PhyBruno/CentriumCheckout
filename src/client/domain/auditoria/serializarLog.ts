import type { HistoricoAuditoriaVenda } from './eventos';

/**
 * Serializa o histórico acumulado para o campo `Log` (string) de
 * `CheckoutFaturarNFCe` (`contracts/auditoria-events.md`).
 *
 * Função pura, sem dependência do slice: recebe o array e devolve a string.
 * Isso é o que permite reenviar o mesmo histórico numa retentativa depois de
 * `FATURAMENTO_FALHOU` sem tocar no estado (FR-006).
 *
 * O ERP é a fonte de verdade da auditoria (Constitution III) — o Checkout não
 * filtra, resume nem reordena o array aqui; entrega o que acumulou, na ordem
 * em que acumulou, round-trip parseável por `JSON.parse`.
 */
export function serializarLogAuditoria(eventos: HistoricoAuditoriaVenda): string {
  return JSON.stringify(eventos);
}

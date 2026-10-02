import { MEIO_PAGTO, type MeioPagtoNFe } from '../pagamento/formaPagamento';

/**
 * `PagamentoParcelas` de `CriarCardPagamento` (T006, `research.md` D8,
 * invariante T9).
 *
 * Decisão do usuário (2026-10-02): as parcelas são as da **condição de
 * pagamento**, não uma escolha do operador. Na KB, `PCheckout_GetSessao`
 * preenche `CondicaoPrazo = PraNumPar`, e AD-216 mediu os valores reais
 * (`'30 DIAS'` → `1`, `'2 VEZES'` → `2`, `'30/60/90/120 DIAS'` → `4`).
 *
 * Só o crédito parcela: `PSmartTEF` recusa sem chamar a SmartTEF quando
 * `PagamentoParcelas > 1` e o tipo não é `CREDIT` ("Parcelamento so e permitido
 * para pagamentos do tipo CREDITO"). Débito e PIX vão sempre com `1`.
 *
 * Função total: prazo `0` (à vista), fracionário abaixo de 1, negativo ou não
 * finito vira `1`. Fracionário acima de 1 é **truncado**, nunca arredondado
 * para cima — cobrar em mais parcelas do que a condição diz é o erro que o
 * cliente sente na fatura.
 */
export function parcelasDoTef(meio: MeioPagtoNFe, prazoDaCondicao: number): number {
  if (meio !== MEIO_PAGTO.CartaoCredito || !Number.isFinite(prazoDaCondicao)) {
    return 1;
  }
  return Math.max(1, Math.trunc(prazoDaCondicao));
}

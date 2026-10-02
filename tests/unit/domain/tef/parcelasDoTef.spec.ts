import { describe, expect, it } from 'vitest';
import { MEIO_PAGTO } from '../../../../src/client/domain/pagamento/formaPagamento';
import { parcelasDoTef } from '../../../../src/client/domain/tef/parcelasDoTef';

/**
 * T005 — `PagamentoParcelas` (`research.md` D8, invariante T9).
 *
 * O prazo é o `CondicaoPrazo` da condição (`PraNumPar` na KB). Os valores reais
 * medidos em AD-216 são `0`, `1`, `2` e `4`; os demais casos cobrem a fronteira.
 */
describe('parcelasDoTef', () => {
  it.each([
    [1, 1],
    [2, 2],
    [4, 4],
  ])('crédito com prazo %d → %d parcelas', (prazo, esperado) => {
    expect(parcelasDoTef(MEIO_PAGTO.CartaoCredito, prazo)).toBe(esperado);
  });

  it.each([
    [0, 1],
    [0.5, 1],
    [Number.NaN, 1],
    [Number.POSITIVE_INFINITY, 1],
    [-3, 1],
    [2.9, 2],
  ])('crédito com prazo %d → %d (piso de 1, sem arredondar para cima)', (prazo, esperado) => {
    expect(parcelasDoTef(MEIO_PAGTO.CartaoCredito, prazo)).toBe(esperado);
  });

  // `PSmartTEF` recusa parcelamento fora do `CREDIT` sem chamar a SmartTEF.
  it.each([MEIO_PAGTO.CartaoDebito, MEIO_PAGTO.Pix])('%s com prazo 4 → sempre 1 (T9)', (meio) => {
    expect(parcelasDoTef(meio, 4)).toBe(1);
  });
});

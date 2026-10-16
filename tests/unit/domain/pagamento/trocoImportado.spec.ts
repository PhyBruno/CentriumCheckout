import { describe, expect, it } from 'vitest';
import { centavos } from '../../../../src/client/domain/precificacao/dinheiro';
import { MEIO_PAGTO } from '../../../../src/client/domain/pagamento/formaPagamento';
import { reconstruirTrocoImportado } from '../../../../src/client/domain/pagamento/trocoImportado';
import { pagamentoDe } from '../../../support/pagamento';

/**
 * Feature 018, FR-020/FR-021 — o troco de um documento retomado. Valores sintéticos.
 *
 * O documento registra o que foi gravado em `FormaValor`; se o ERP gravou o
 * recebido, a soma das formas passa do total e o excedente é o troco do dinheiro.
 * Importado como veio, o dinheiro daria "pagamento acima do total" e troco zero.
 */

/** Como `importarFormasDePagamento` monta o dinheiro: recebido = aplicado (I3). */
function dinheiroImportado(valor: number) {
  return pagamentoDe({
    meioPagtoNFe: MEIO_PAGTO.Dinheiro,
    valorAplicado: valor,
    valorRecebido: valor,
    veioDeDocumento: true,
  });
}

function cartaoImportado(valor: number) {
  return pagamentoDe({
    meioPagtoNFe: MEIO_PAGTO.CartaoCredito,
    valorAplicado: valor,
    valorRecebido: null,
    veioDeDocumento: true,
  });
}

describe('reconstruirTrocoImportado', () => {
  it('sem excedente a lista fica intacta (FR-021): recebido igual a aplicado', () => {
    const pagamentos = [dinheiroImportado(8_700)];

    const resultado = reconstruirTrocoImportado(pagamentos, centavos(8_700));

    expect(resultado).toEqual(pagamentos);
  });

  it('soma abaixo do total também fica intacta (venda ainda com saldo)', () => {
    const pagamentos = [dinheiroImportado(5_000)];

    expect(reconstruirTrocoImportado(pagamentos, centavos(8_700))).toEqual(pagamentos);
  });

  it('um dinheiro que cobre o excedente vira recebido = documento e aplicado = documento − excedente', () => {
    const [dinheiro] = reconstruirTrocoImportado([dinheiroImportado(10_000)], centavos(8_700));

    expect(dinheiro?.valorRecebido).toBe(10_000);
    expect(dinheiro?.valorAplicado).toBe(8_700);
  });

  it('o excedente sai do dinheiro, sem mexer nas outras formas', () => {
    const resultado = reconstruirTrocoImportado(
      [cartaoImportado(6_000), dinheiroImportado(5_000)],
      centavos(10_000),
    );

    expect(resultado[0]).toEqual(expect.objectContaining({ valorAplicado: 6_000 }));
    expect(resultado[1]?.valorRecebido).toBe(5_000);
    expect(resultado[1]?.valorAplicado).toBe(4_000);
  });

  it('excedente igual ao dinheiro inteiro zera o aplicado e guarda o recebido', () => {
    const [cartao, dinheiro] = reconstruirTrocoImportado(
      [cartaoImportado(10_000), dinheiroImportado(2_000)],
      centavos(10_000),
    );

    expect(cartao?.valorAplicado).toBe(10_000);
    expect(dinheiro?.valorRecebido).toBe(2_000);
    expect(dinheiro?.valorAplicado).toBe(0);
  });

  it('sem forma dinheiro, importa como está (não inventa troco)', () => {
    const pagamentos = [cartaoImportado(10_000)];

    expect(reconstruirTrocoImportado(pagamentos, centavos(8_700))).toEqual(pagamentos);
  });

  it('com duas formas dinheiro, importa como está', () => {
    const pagamentos = [dinheiroImportado(6_000), dinheiroImportado(6_000)];

    expect(reconstruirTrocoImportado(pagamentos, centavos(10_000))).toEqual(pagamentos);
  });

  it('excedente maior que o dinheiro, importa como está', () => {
    const pagamentos = [cartaoImportado(10_000), dinheiroImportado(1_000)];

    expect(reconstruirTrocoImportado(pagamentos, centavos(8_000))).toEqual(pagamentos);
  });

  it('mantém I3: só o dinheiro tem valorRecebido, as demais seguem null', () => {
    const resultado = reconstruirTrocoImportado(
      [cartaoImportado(6_000), dinheiroImportado(5_000)],
      centavos(10_000),
    );

    expect(resultado.map((pagamento) => pagamento.valorRecebido !== null)).toEqual([false, true]);
  });

  it('não muta a lista de origem', () => {
    const pagamentos = [dinheiroImportado(10_000)];
    const copia = structuredClone(pagamentos);

    reconstruirTrocoImportado(pagamentos, centavos(8_700));

    expect(pagamentos).toEqual(copia);
  });
});

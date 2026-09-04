import { describe, expect, it } from 'vitest';
import {
  calcularSaldo,
  derivarValores,
  podeAplicarForma,
} from '../../../../src/client/domain/pagamento/saldoPagamento';
import { emCentavos, formaDe, pagamentoDe } from '../../../support/pagamento';

describe('derivarValores — única fonte de valorAplicado/valorRecebido (data-model.md §6)', () => {
  it('Dinheiro acima do saldo: valorAplicado é limitado, valorRecebido é o que o operador digitou', () => {
    const resultado = derivarValores(
      formaDe({ meioPagtoNFe: 'Dinheiro' }),
      emCentavos(15000),
      emCentavos(10000),
    );

    expect(resultado.valorAplicado).toBe(10000);
    expect(resultado.valorRecebido).toBe(15000);
  });

  it('qualquer forma diferente de dinheiro: valorRecebido é null e valorAplicado = min(informado, saldo)', () => {
    const resultado = derivarValores(
      formaDe({ meioPagtoNFe: 'CartaoCredito' }),
      emCentavos(20000),
      emCentavos(8000),
    );

    expect(resultado.valorAplicado).toBe(8000);
    expect(resultado.valorRecebido).toBeNull();
  });

  it('Pix acima do saldo não gera valorRecebido — nenhuma outra forma gera troco (FR-012)', () => {
    const resultado = derivarValores(
      formaDe({ meioPagtoNFe: 'Pix' }),
      emCentavos(20000),
      emCentavos(10000),
    );

    expect(resultado.valorAplicado).toBe(10000);
    expect(resultado.valorRecebido).toBeNull();
  });
});

describe('calcularSaldo — algoritmo de data-model.md §6', () => {
  it('aplica o desconto de capa antes de comparar com os pagamentos', () => {
    const saldo = calcularSaldo(emCentavos(10000), emCentavos(2000), []);

    expect(saldo.totalLiquido).toBe(8000);
    expect(saldo.totalAplicado).toBe(0);
    expect(saldo.saldoRestante).toBe(8000);
    expect(saldo.troco).toBe(0);
  });

  it('troco só existe para Dinheiro acima do saldo (FR-012)', () => {
    const pagamento = pagamentoDe({
      meioPagtoNFe: 'Dinheiro',
      valorAplicado: 10000,
      valorRecebido: 15000,
      status: 'APROVADO',
    });

    const saldo = calcularSaldo(emCentavos(10000), emCentavos(0), [pagamento]);

    expect(saldo.totalAplicado).toBe(10000);
    expect(saldo.saldoRestante).toBe(0);
    expect(saldo.troco).toBe(5000);
  });

  it('Pix acima do saldo não gera troco', () => {
    const pagamento = pagamentoDe({
      meioPagtoNFe: 'Pix',
      valorAplicado: 10000,
      valorRecebido: null,
      status: 'APROVADO',
    });

    const saldo = calcularSaldo(emCentavos(10000), emCentavos(0), [pagamento]);

    expect(saldo.troco).toBe(0);
  });

  it('pagamento PENDENTE_INTEGRACAO não conta em totalAplicado nem reduz o saldo restante', () => {
    const pendente = pagamentoDe({
      meioPagtoNFe: 'CartaoCredito',
      valorAplicado: 5000,
      status: 'PENDENTE_INTEGRACAO',
      integracao: 'TEF',
    });

    const saldo = calcularSaldo(emCentavos(10000), emCentavos(0), [pendente]);

    expect(saldo.totalAplicado).toBe(0);
    expect(saldo.saldoRestante).toBe(10000);
  });
});

describe('podeAplicarForma — I2/FR-013/AD-036 e SALDO_JA_COBERTO', () => {
  it('recusa uma segunda forma dinheiro', () => {
    const jaAplicado = pagamentoDe({ meioPagtoNFe: 'Dinheiro', status: 'APROVADO' });

    const resultado = podeAplicarForma(formaDe({ meioPagtoNFe: 'Dinheiro' }), [jaAplicado]);

    expect(resultado).toEqual({ ok: false, motivo: 'DINHEIRO_DUPLICADO' });
  });

  it('ignora pagamentos RECUSADO ao checar duplicidade de dinheiro', () => {
    const recusado = pagamentoDe({ meioPagtoNFe: 'Dinheiro', status: 'RECUSADO' });

    const resultado = podeAplicarForma(formaDe({ meioPagtoNFe: 'Dinheiro' }), [recusado]);

    expect(resultado).toEqual({ ok: true });
  });

  it('sem o terceiro parâmetro, a checagem de saldo é ignorada', () => {
    const resultado = podeAplicarForma(formaDe({ meioPagtoNFe: 'CartaoCredito' }), []);

    expect(resultado).toEqual({ ok: true });
  });

  it('com saldoRestante zero, devolve SALDO_JA_COBERTO', () => {
    const resultado = podeAplicarForma(
      formaDe({ meioPagtoNFe: 'CartaoCredito' }),
      [],
      emCentavos(0),
    );

    expect(resultado).toEqual({ ok: false, motivo: 'SALDO_JA_COBERTO' });
  });
});

/**
 * `FR-024` (correção do usuário, 2026-09-04): o que não gera troco não pode
 * receber mais do que o saldo em aberto. Antes disso `derivarValores` truncava
 * em silêncio, e o ERP recebia um `FormaValor` diferente do que o operador
 * digitou.
 */
describe('podeAplicarForma — VALOR_ACIMA_DO_SALDO (FR-024)', () => {
  it('recusa cartão acima do saldo restante', () => {
    const resultado = podeAplicarForma(
      formaDe({ meioPagtoNFe: 'CartaoCredito' }),
      [],
      emCentavos(5000),
      emCentavos(5001),
    );

    expect(resultado).toEqual({ ok: false, motivo: 'VALOR_ACIMA_DO_SALDO' });
  });

  it('recusa PIX acima do saldo restante', () => {
    const resultado = podeAplicarForma(
      formaDe({ meioPagtoNFe: 'Pix' }),
      [],
      emCentavos(5000),
      emCentavos(9000),
    );

    expect(resultado).toEqual({ ok: false, motivo: 'VALOR_ACIMA_DO_SALDO' });
  });

  it('aceita cartão exatamente no saldo restante — o limite é inclusivo', () => {
    const resultado = podeAplicarForma(
      formaDe({ meioPagtoNFe: 'CartaoCredito' }),
      [],
      emCentavos(5000),
      emCentavos(5000),
    );

    expect(resultado).toEqual({ ok: true });
  });

  it('aceita dinheiro acima do saldo: o excedente é troco (FR-012)', () => {
    const resultado = podeAplicarForma(
      formaDe({ meioPagtoNFe: 'Dinheiro' }),
      [],
      emCentavos(5000),
      emCentavos(20000),
    );

    expect(resultado).toEqual({ ok: true });
  });

  it('sem o valor informado, a checagem de excedente é ignorada', () => {
    const resultado = podeAplicarForma(
      formaDe({ meioPagtoNFe: 'CartaoCredito' }),
      [],
      emCentavos(5000),
    );

    expect(resultado).toEqual({ ok: true });
  });
});

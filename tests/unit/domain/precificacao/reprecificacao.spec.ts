import { describe, expect, it } from 'vitest';
import {
  descontoDeConvenio,
  repricarSku,
  repricarTodosOsSkus,
} from '../../../../src/client/domain/precificacao/reprecificacao';
import { totalVenda } from '../../../../src/client/domain/precificacao/linha';
import { emCentavos, linhaDe, snapshotDe, unidades } from '../../../support/precificacao';

const SKU = '001234';
const OUTRO_SKU = '009999';

/** Produto do exemplo de `data-model.md` §5 e do `Independent Test` da US3. */
const produto = snapshotDe({ codigoProduto: SKU });

/** T027 — cascata de reprecificação (FR-006, FR-007, FR-008, AD-067, D3). */
describe('repricarSku — cruzar faixa recalcula todas as linhas do SKU', () => {
  it('aplica o preço da faixa a todas as linhas ativas, não só à recém-inserida (CART-06)', () => {
    const linhas = [
      linhaDe({ idLinha: 'a', snapshot: produto, quantidadeEmUnidades: 3, precoUnitario: 1000 }),
      linhaDe({ idLinha: 'b', snapshot: produto, quantidadeEmUnidades: 3, precoUnitario: 1000 }),
    ];

    // Agregado 6 ≥ limiar 5 → faixa 2.
    const resultado = repricarSku(linhas, SKU, 8);

    expect(resultado.map((linha) => linha.precoUnitario)).toEqual([900, 900]);
  });

  it('cancelamento derruba as remanescentes para a faixa inferior (FR-008)', () => {
    const linhas = [
      linhaDe({ idLinha: 'a', snapshot: produto, quantidadeEmUnidades: 3, precoUnitario: 900 }),
      linhaDe({
        idLinha: 'b',
        snapshot: produto,
        quantidadeEmUnidades: 3,
        precoUnitario: 900,
        cancelada: true,
      }),
    ];

    const resultado = repricarSku(linhas, SKU, 8);

    // Agregado volta a 3, abaixo do limiar 5.
    expect(resultado[0]?.precoUnitario).toBe(1000);
    // A linha cancelada permanece no array, inalterada (invariante I1).
    expect(resultado).toHaveLength(2);
    expect(resultado[1]?.cancelada).toBe(true);
    expect(resultado[1]?.precoUnitario).toBe(900);
  });

  it('linha congelada não é recalculada nem entra no agregado (D3, AD-067)', () => {
    const linhas = [
      linhaDe({
        idLinha: 'congelada',
        snapshot: produto,
        quantidadeEmUnidades: 10,
        precoUnitario: 500,
        precoCongelado: true,
        origem: 'DAV',
      }),
      linhaDe({
        idLinha: 'ativa',
        snapshot: produto,
        quantidadeEmUnidades: 3,
        precoUnitario: 1000,
      }),
    ];

    const resultado = repricarSku(linhas, SKU, 8);

    // As 10 unidades congeladas cruzariam o limiar 5 se contassem no agregado;
    // como não contam, a linha ativa fica na faixa 1.
    expect(resultado[0]).toBe(linhas[0]);
    expect(resultado[0]?.precoUnitario).toBe(500);
    expect(resultado[1]?.precoUnitario).toBe(1000);
  });

  it('linhas de outros SKUs voltam inalteradas por identidade', () => {
    const outra = linhaDe({
      idLinha: 'outro',
      snapshot: snapshotDe({ codigoProduto: OUTRO_SKU }),
      quantidadeEmUnidades: 10,
    });
    const linhas = [
      linhaDe({ idLinha: 'a', snapshot: produto, quantidadeEmUnidades: 6, precoUnitario: 1000 }),
      outra,
    ];

    const resultado = repricarSku(linhas, SKU, 8);

    expect(resultado[1]).toBe(outra);
  });

  it('devolve o array por identidade quando o SKU não tem linha elegível', () => {
    const linhas = [linhaDe({ snapshot: produto, cancelada: true })];

    expect(repricarSku(linhas, SKU, 8)).toBe(linhas);
  });

  it("produto 'E' preserva o preço digitado pelo operador — nunca chama resolvePrecoUnitario (bug real da FR-014)", () => {
    const produtoEditavel = snapshotDe({
      codigoProduto: SKU,
      pesavelEditavel: 'E',
      precoBase: 2000,
    });
    const linhas = [
      linhaDe({
        idLinha: 'a',
        snapshot: produtoEditavel,
        quantidadeEmUnidades: 2,
        precoUnitario: 1500,
      }),
    ];

    // `repricarSku` roda a cada mutação do carrinho (inclusive a própria
    // inserção) — se ela sobrescrevesse o preço `'E'` pelo `precoBase` do
    // cadastro (2000), o valor digitado pelo operador (1500) se perderia.
    const resultado = repricarSku(linhas, SKU, 1);

    expect(resultado[0]?.precoUnitario).toBe(1500);
  });

  it('devolve a linha por identidade quando o preço não muda', () => {
    const linhas = [
      linhaDe({ idLinha: 'a', snapshot: produto, quantidadeEmUnidades: 3, precoUnitario: 1000 }),
    ];

    expect(repricarSku(linhas, SKU, 8)[0]).toBe(linhas[0]);
  });

  it('cenário de aceitação central da User Story 3 (quickstart, Camada 1)', () => {
    // 1. Insere 3 unidades → faixa 1, preço 1000.
    let linhas = repricarSku(
      [linhaDe({ idLinha: 'a', snapshot: produto, quantidadeEmUnidades: 3 })],
      SKU,
      8,
    );
    expect(linhas[0]?.precoUnitario).toBe(1000);

    // 2. Insere mais 3 numa segunda linha → agregado 6, cruza a faixa.
    linhas = repricarSku(
      [...linhas, linhaDe({ idLinha: 'b', snapshot: produto, quantidadeEmUnidades: 3 })],
      SKU,
      8,
    );
    expect(linhas.map((linha) => linha.precoUnitario)).toEqual([900, 900]);
    expect(totalVenda(linhas)).toBe(5400);

    // 3. Cancela a segunda → agregado volta a 3, a remanescente volta a 1000.
    linhas = repricarSku(
      linhas.map((linha) => (linha.idLinha === 'b' ? { ...linha, cancelada: true } : linha)),
      SKU,
      8,
    );
    expect(linhas).toHaveLength(2);
    expect(linhas[0]?.precoUnitario).toBe(1000);
    // 4. O total não inclui a linha cancelada (SC-003).
    expect(totalVenda(linhas)).toBe(3000);
  });
});

describe('descontoDeConvenio (AD-023)', () => {
  it('incide sobre o total bruto, depois da multiplicação', () => {
    // 10% sobre 1000 × 3 = 3000 → desconto de 300.
    expect(descontoDeConvenio(emCentavos(1000), unidades(3), 10)).toBe(300);
  });

  it('cliente sem convênio não gera desconto (AD-108)', () => {
    expect(descontoDeConvenio(emCentavos(1000), unidades(3), 0)).toBe(0);
  });
});

describe('repricarSku — desconto de convênio recalculado junto', () => {
  it('recalcula o desconto quando o preço muda de faixa', () => {
    const linhas = [
      linhaDe({ idLinha: 'a', snapshot: produto, quantidadeEmUnidades: 6, precoUnitario: 1000 }),
    ];

    const resultado = repricarSku(linhas, SKU, 8, 10);

    // Faixa 2 (900) × 6 = 5400; 10% = 540.
    expect(resultado[0]?.precoUnitario).toBe(900);
    expect(resultado[0]?.descontoConvenio).toBe(540);
  });

  it('preserva o desconto manual quando não há convênio', () => {
    const linhas = [
      linhaDe({
        idLinha: 'a',
        snapshot: produto,
        quantidadeEmUnidades: 6,
        precoUnitario: 1000,
        descontoManual: 250,
      }),
    ];

    expect(repricarSku(linhas, SKU, 8, 0)[0]?.descontoManual).toBe(250);
  });

  it('zera o desconto de convênio de um cliente anterior ao reprecificar sem convênio (bug confirmado na revisão)', () => {
    const linhas = [
      linhaDe({
        idLinha: 'a',
        snapshot: produto,
        quantidadeEmUnidades: 6,
        precoUnitario: 900,
        descontoConvenio: 540,
      }),
    ];

    // Cliente novo sem convênio (AD-108): percentual 0 não deve preservar o
    // desconto de convênio do cliente anterior.
    const resultado = repricarSku(linhas, SKU, 8, 0);

    expect(resultado[0]?.descontoConvenio).toBe(0);
  });

  it('desconto manual sobrevive a uma reprecificação que introduz convênio', () => {
    const linhas = [
      linhaDe({
        idLinha: 'a',
        snapshot: produto,
        quantidadeEmUnidades: 6,
        precoUnitario: 1000,
        descontoManual: 250,
      }),
    ];

    const resultado = repricarSku(linhas, SKU, 8, 10);

    // Faixa 2 (900) × 6 = 5400; 10% = 540 de convênio, e o manual continua 250.
    expect(resultado[0]?.descontoConvenio).toBe(540);
    expect(resultado[0]?.descontoManual).toBe(250);
  });
});

describe('repricarTodosOsSkus — troca de cliente (FR-018)', () => {
  it('recalcula cada SKU distinto com linha ativa não-congelada', () => {
    const outro = snapshotDe({
      codigoProduto: OUTRO_SKU,
      precosFaixa: [2000, 1500, 0, 0, 0],
      limiaresFaixaEmUnidades: [2, 0, 0, 0],
    });

    const linhas = [
      linhaDe({ snapshot: produto, quantidadeEmUnidades: 6, precoUnitario: 1000 }),
      linhaDe({ snapshot: outro, quantidadeEmUnidades: 3, precoUnitario: 2000 }),
    ];

    const resultado = repricarTodosOsSkus(linhas, 8);

    expect(resultado[0]?.precoUnitario).toBe(900);
    expect(resultado[1]?.precoUnitario).toBe(1500);
  });
});

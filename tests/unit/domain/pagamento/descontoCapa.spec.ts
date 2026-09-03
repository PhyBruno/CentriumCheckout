import { describe, expect, it } from 'vitest';
import { centavos } from '../../../../src/client/domain/precificacao/dinheiro';
import {
  ErroDescontoCapaAcimaDoSubtotal,
  ratearDescontoCapa,
  resolverDescontoCapa,
  type LinhaRateavel,
} from '../../../../src/client/domain/pagamento/descontoCapa';

/** Soma das parcelas do rateio, na mesma ordem de `linhas` recebida no teste. */
function somaMapa(mapa: ReadonlyMap<string, number>): number {
  return Array.from(mapa.values()).reduce<number>((total, parcela) => total + parcela, 0);
}

describe('resolverDescontoCapa — resolução da entrada do operador (FR-015)', () => {
  it('modo VALOR: entrada já é centavos inteiros, devolvida como está', () => {
    expect(resolverDescontoCapa('VALOR', 1000, centavos(10000))).toBe(1000);
  });

  it('modo PERCENTUAL: aplica o percentual sobre o subtotal', () => {
    expect(resolverDescontoCapa('PERCENTUAL', 10, centavos(10000))).toBe(1000);
  });

  it('sem teto (AD-039): percentual acima de 100 não é recusado aqui — a guarda I8 vive no slice', () => {
    expect(resolverDescontoCapa('PERCENTUAL', 150, centavos(10000))).toBe(15000);
  });
});

describe('ratearDescontoCapa — caso de borda autoritativo (data-model.md §5)', () => {
  it('70,00 / 29,00 / 1,00 com desconto de 10,00: terceira linha estoura e é redividida entre as duas primeiras', () => {
    const linhas: readonly LinhaRateavel[] = [
      { idLinha: 'L1', totalLiquido: centavos(7000) },
      { idLinha: 'L2', totalLiquido: centavos(2900) },
      { idLinha: 'L3', totalLiquido: centavos(100) },
    ];

    const resultado = ratearDescontoCapa(centavos(1000), linhas);

    expect(resultado.get('L1')).toBe(450);
    expect(resultado.get('L2')).toBe(450);
    expect(resultado.get('L3')).toBe(100);
    expect(somaMapa(resultado)).toBe(1000);
    for (const linha of linhas) {
      expect(resultado.get(linha.idLinha)).toBeLessThanOrEqual(linha.totalLiquido);
    }
  });

  it('o mesmo carrinho via modo PERCENTUAL (10%) produz o mesmo resultado do modo VALOR', () => {
    const linhas: readonly LinhaRateavel[] = [
      { idLinha: 'L1', totalLiquido: centavos(7000) },
      { idLinha: 'L2', totalLiquido: centavos(2900) },
      { idLinha: 'L3', totalLiquido: centavos(100) },
    ];
    const subtotal = centavos(10000);

    const descontoPorPercentual = resolverDescontoCapa('PERCENTUAL', 10, subtotal);
    const descontoPorValor = resolverDescontoCapa('VALOR', 1000, subtotal);
    expect(descontoPorPercentual).toBe(descontoPorValor);

    const resultado = ratearDescontoCapa(descontoPorPercentual, linhas);
    expect(resultado.get('L1')).toBe(450);
    expect(resultado.get('L2')).toBe(450);
    expect(resultado.get('L3')).toBe(100);
  });
});

describe('ratearDescontoCapa — divisão sem clamp', () => {
  it('rateio que não fecha exato entre 3 linhas folgadas: soma exata, sem fração de centavo', () => {
    const linhas: readonly LinhaRateavel[] = [
      { idLinha: 'A', totalLiquido: centavos(50000) },
      { idLinha: 'B', totalLiquido: centavos(50000) },
      { idLinha: 'C', totalLiquido: centavos(50000) },
    ];

    const resultado = ratearDescontoCapa(centavos(1000), linhas);

    // 1000 / 3 = 333,33...; maior resto (AD-072) distribui a sobra pelo menor
    // índice em caso de empate — determinístico.
    expect(resultado.get('A')).toBe(334);
    expect(resultado.get('B')).toBe(333);
    expect(resultado.get('C')).toBe(333);
    expect(somaMapa(resultado)).toBe(1000);
    for (const linha of linhas) {
      expect(resultado.get(linha.idLinha)).toBeLessThanOrEqual(linha.totalLiquido);
    }
  });

  it('divide igualmente entre duas linhas com folga suficiente', () => {
    const linhas: readonly LinhaRateavel[] = [
      { idLinha: 'A', totalLiquido: centavos(20000) },
      { idLinha: 'B', totalLiquido: centavos(20000) },
    ];

    const resultado = ratearDescontoCapa(centavos(500), linhas);

    expect(resultado.get('A')).toBe(250);
    expect(resultado.get('B')).toBe(250);
    expect(somaMapa(resultado)).toBe(500);
  });
});

describe('ratearDescontoCapa — múltiplas rodadas de clamp', () => {
  it('duas linhas baratas estouram em iterações diferentes', () => {
    // Desconto de 27,00 entre 4 linhas: 5,00 / 4,00 / 90,00 / 90,00.
    // Rodada 1: 27,00 / 4 fecha exato em 6,75 cada (sem sobra de maior
    // resto). L1 (5,00) e L2 (4,00) estouram — ambas fixadas na mesma
    // rodada; os 18,00 restantes são redivididos entre L3/L4 (9,00 cada).
    const linhas: readonly LinhaRateavel[] = [
      { idLinha: 'barata1', totalLiquido: centavos(500) },
      { idLinha: 'barata2', totalLiquido: centavos(400) },
      { idLinha: 'cara1', totalLiquido: centavos(9000) },
      { idLinha: 'cara2', totalLiquido: centavos(9000) },
    ];

    const resultado = ratearDescontoCapa(centavos(2700), linhas);

    expect(resultado.get('barata1')).toBe(500);
    expect(resultado.get('barata2')).toBe(400);
    expect(somaMapa(resultado)).toBe(2700);
    for (const linha of linhas) {
      expect(resultado.get(linha.idLinha)).toBeLessThanOrEqual(linha.totalLiquido);
    }
  });

  it('uma linha estoura logo na primeira rodada, a segunda só depois da redistribuição', () => {
    // Desconto de 100,00 entre 3 linhas: 10,00 / 60,00 / 60,00.
    // Rodada 1: split igual 33,34 / 33,33 / 33,33 → L1 (10,00) estoura,
    // fixada; sobra 90,00 para L2/L3.
    // Rodada 2: split igual 45,00 / 45,00 sobre L2/L3 (60,00 cada) — nenhuma
    // estoura, encerra.
    const linhas: readonly LinhaRateavel[] = [
      { idLinha: 'L1', totalLiquido: centavos(1000) },
      { idLinha: 'L2', totalLiquido: centavos(6000) },
      { idLinha: 'L3', totalLiquido: centavos(6000) },
    ];

    const resultado = ratearDescontoCapa(centavos(10000), linhas);

    expect(resultado.get('L1')).toBe(1000);
    expect(resultado.get('L2')).toBe(4500);
    expect(resultado.get('L3')).toBe(4500);
    expect(somaMapa(resultado)).toBe(10000);
  });
});

describe('ratearDescontoCapa — casos de fronteira', () => {
  it('desconto igual ao subtotal exato: cada linha zera, soma exata', () => {
    const linhas: readonly LinhaRateavel[] = [
      { idLinha: 'A', totalLiquido: centavos(3000) },
      { idLinha: 'B', totalLiquido: centavos(7000) },
    ];

    const resultado = ratearDescontoCapa(centavos(10000), linhas);

    expect(resultado.get('A')).toBe(3000);
    expect(resultado.get('B')).toBe(7000);
    expect(somaMapa(resultado)).toBe(10000);
  });

  it('desconto zero devolve toda linha zerada', () => {
    const linhas: readonly LinhaRateavel[] = [
      { idLinha: 'A', totalLiquido: centavos(3000) },
      { idLinha: 'B', totalLiquido: centavos(7000) },
    ];

    const resultado = ratearDescontoCapa(centavos(0), linhas);

    expect(resultado.get('A')).toBe(0);
    expect(resultado.get('B')).toBe(0);
  });

  it('lista vazia com desconto zero devolve mapa vazio', () => {
    const resultado = ratearDescontoCapa(centavos(0), []);
    expect(resultado.size).toBe(0);
  });

  it('lista vazia com desconto acima de zero lança ErroDescontoCapaAcimaDoSubtotal', () => {
    expect(() => ratearDescontoCapa(centavos(100), [])).toThrow(ErroDescontoCapaAcimaDoSubtotal);
  });

  it('desconto acima do subtotal lança ErroDescontoCapaAcimaDoSubtotal, nunca um rateio incompleto', () => {
    const linhas: readonly LinhaRateavel[] = [
      { idLinha: 'A', totalLiquido: centavos(1000) },
      { idLinha: 'B', totalLiquido: centavos(1000) },
    ];

    expect(() => ratearDescontoCapa(centavos(2001), linhas)).toThrow(
      ErroDescontoCapaAcimaDoSubtotal,
    );
  });
});

describe('ratearDescontoCapa — propriedade: soma exata e nunca excede a linha', () => {
  const casos: ReadonlyArray<{
    readonly nome: string;
    readonly desconto: number;
    readonly linhas: readonly LinhaRateavel[];
  }> = [
    {
      nome: '5 linhas heterogêneas, desconto no meio da faixa',
      desconto: 3333,
      linhas: [
        { idLinha: 'a', totalLiquido: centavos(1234) },
        { idLinha: 'b', totalLiquido: centavos(500) },
        { idLinha: 'c', totalLiquido: centavos(9999) },
        { idLinha: 'd', totalLiquido: centavos(1) },
        { idLinha: 'e', totalLiquido: centavos(2500) },
      ],
    },
    {
      nome: 'linha única recebe o desconto inteiro',
      desconto: 1500,
      linhas: [{ idLinha: 'unica', totalLiquido: centavos(1500) }],
    },
    {
      nome: 'muitas linhas de 1 centavo, desconto consome quase todas',
      desconto: 9,
      linhas: Array.from({ length: 10 }, (_valor, indice) => ({
        idLinha: `centavo-${String(indice)}`,
        totalLiquido: centavos(1),
      })),
    },
  ];

  it.each(casos)('$nome', ({ desconto, linhas }) => {
    const resultado = ratearDescontoCapa(centavos(desconto), linhas);

    expect(somaMapa(resultado)).toBe(desconto);
    for (const linha of linhas) {
      const parcela = resultado.get(linha.idLinha);
      expect(parcela).toBeDefined();
      expect(parcela).toBeLessThanOrEqual(linha.totalLiquido);
      expect(parcela).toBeGreaterThanOrEqual(0);
    }
  });
});

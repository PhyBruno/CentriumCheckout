/**
 * Aritmética monetária em **centavos inteiros** (T002).
 *
 * Constitution V (Precisão Monetária Inegociável) e AD-071: nenhuma biblioteca
 * de dinheiro — as regras mapeadas cabem em aritmética inteira escrita à mão.
 * Domínio puro: sem React, Zustand, Query ou rede.
 *
 * Nenhum valor de preço, desconto ou total existe como `double` aqui dentro. Um
 * `double` de preço só vive entre a resposta HTTP e o `.transform()` do Zod
 * (`data-model.md` §1).
 */

import { MILESIMOS_POR_UNIDADE, type Milesimos } from './quantidade';

/**
 * Branded type: impede, em tempo de compilação, passar um `number` cru (reais,
 * por exemplo) onde se espera centavos — erro que `type Centavos = number` não
 * pegaria (`research.md`, D4).
 */
export type Centavos = number & { readonly __brand: 'Centavos' };

/** Valor monetário fora do domínio representável em centavos inteiros. */
export class ErroPrecisaoMonetaria extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroPrecisaoMonetaria';
  }
}

/**
 * Constrói `Centavos` a partir de um valor **já em centavos inteiros**.
 *
 * Recusa fração em vez de arredondar: uma fração aqui significa que um `double`
 * atravessou a fronteira Zod sem conversão, e falhar alto é preferível a
 * produzir uma discrepância de centavo numa NFCe.
 */
export function centavos(valorInteiro: number): Centavos {
  if (!Number.isSafeInteger(valorInteiro)) {
    throw new ErroPrecisaoMonetaria(
      `Valor monetário precisa ser inteiro seguro em centavos; recebido ${String(valorInteiro)}.`,
    );
  }
  return valorInteiro as Centavos;
}

export const ZERO_CENTAVOS = centavos(0);

export function somar(a: Centavos, b: Centavos): Centavos {
  return centavos(a + b);
}

export function subtrair(a: Centavos, b: Centavos): Centavos {
  return centavos(a - b);
}

/**
 * Divisão inteira com arredondamento em `.5` para longe do zero.
 *
 * `Math.round(a / b)` passaria pelo ponto flutuante antes de arredondar; aqui
 * quociente e resto são exatos enquanto o dividendo for inteiro seguro.
 */
function dividirArredondando(dividendo: number, divisor: number): number {
  const quociente = Math.trunc(dividendo / divisor);
  const resto = Math.abs(dividendo % divisor);
  if (resto * 2 >= Math.abs(divisor)) {
    return quociente + Math.sign(dividendo);
  }
  return quociente;
}

/**
 * Total **bruto** da linha: `arredondar(preço × quantidade ÷ 1000)`.
 *
 * `preco` é sempre a base **unitária** (`PrecoVenda`, ou o `PrecoVenda{n}` da
 * faixa em `TipoPreco = 8`) — nunca o valor de uma linha (`data-model.md` §1).
 */
export function multiplicarPorQuantidade(preco: Centavos, qtd: Milesimos): Centavos {
  const produto = preco * qtd;
  if (!Number.isSafeInteger(produto)) {
    throw new ErroPrecisaoMonetaria(
      `Produto preço × quantidade estourou a faixa segura de inteiros: ${String(produto)}.`,
    );
  }
  return centavos(dividirArredondando(produto, MILESIMOS_POR_UNIDADE));
}

/**
 * Aplica um percentual a um valor, arredondando a centavo inteiro.
 *
 * Cobre o desconto de convênio (AD-023): o fator é `(100 − DescontoConvenio)`,
 * aplicado ao **total bruto** da linha. `percentual` é o único `double` que
 * entra num cálculo do domínio — vem do cadastro do cliente e o resultado é
 * arredondado a centavo na mesma expressão, sem propagar fração adiante.
 */
export function aplicarPercentual(valor: Centavos, percentual: number): Centavos {
  if (!Number.isFinite(percentual)) {
    throw new ErroPrecisaoMonetaria(
      `Percentual precisa ser finito; recebido ${String(percentual)}.`,
    );
  }
  return centavos(Math.round((valor * percentual) / 100));
}

/**
 * Rateio de `total` entre `pesos` pelo método do **maior resto** (AD-072,
 * `FR-016`).
 *
 * Cada parcela é arredondada para baixo e a diferença é distribuída um centavo
 * por vez, da maior parte fracionária descartada para a menor; empate resolve
 * pelo menor índice, para o resultado ser determinístico. A soma das parcelas
 * devolvidas é **sempre exatamente** `total` — esta é a invariante que o teste
 * unitário afirma. Nunca existe fração de centavo.
 */
export function distribuirPorMaiorResto(
  total: Centavos,
  pesos: readonly Centavos[],
): readonly Centavos[] {
  const somaPesos = pesos.reduce<number>((acumulado, peso) => acumulado + peso, 0);

  if (pesos.length === 0 || somaPesos <= 0) {
    if (total !== 0) {
      throw new ErroPrecisaoMonetaria(
        'Não há como ratear um total diferente de zero entre pesos vazios ou de soma zero.',
      );
    }
    return pesos.map(() => ZERO_CENTAVOS);
  }

  const produtos = pesos.map((peso) => {
    const produto = total * peso;
    if (!Number.isSafeInteger(produto)) {
      throw new ErroPrecisaoMonetaria(
        `Rateio estourou a faixa segura de inteiros: ${String(produto)}.`,
      );
    }
    return produto;
  });

  const parcelas = produtos.map((produto) => Math.floor(produto / somaPesos));
  const restos = produtos.map((produto) => produto % somaPesos);

  const distribuido = parcelas.reduce<number>((acumulado, parcela) => acumulado + parcela, 0);
  const sobra = total - distribuido;

  const ordemPorResto = restos
    .map((resto, indice) => ({ resto, indice }))
    .sort((a, b) => b.resto - a.resto || a.indice - b.indice);

  for (let k = 0; k < sobra; k += 1) {
    const alvo = ordemPorResto[k];
    if (alvo === undefined) {
      break;
    }
    parcelas[alvo.indice] = (parcelas[alvo.indice] ?? 0) + 1;
  }

  return parcelas.map((parcela) => centavos(parcela));
}

/**
 * **Única** forma de obter o valor de uma linha (invariante I9 de
 * `data-model.md`): o total nunca é armazenado no estado, porque estado
 * redundante divergiria do preço logo na primeira reprecificação.
 *
 * O desconto é absoluto e incide **sobre o total**, depois da multiplicação —
 * não sobre o preço unitário. O piso é `0`: o total de uma linha nunca é
 * negativo (invariante I8).
 */
export function calcularTotalLinha(
  precoUnitario: Centavos,
  quantidade: Milesimos,
  descontoLinha: Centavos,
): Centavos {
  const bruto = multiplicarPorQuantidade(precoUnitario, quantidade);
  return centavos(Math.max(0, bruto - descontoLinha));
}

const CENTAVOS_POR_REAL = 100;

/**
 * Exibição em pt-BR, com aritmética inteira: converter para `number` decimal só
 * para formatar reintroduziria o ponto flutuante que este módulo evita.
 */
export function formatarCentavos(valor: Centavos): string {
  const sinal = valor < 0 ? '-' : '';
  const absoluto = Math.abs(valor);
  const reais = Math.trunc(absoluto / CENTAVOS_POR_REAL);
  const resto = absoluto % CENTAVOS_POR_REAL;
  const inteiros = String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sinal}R$ ${inteiros},${String(resto).padStart(2, '0')}`;
}

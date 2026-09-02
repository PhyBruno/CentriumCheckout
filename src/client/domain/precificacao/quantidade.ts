/**
 * Quantidade do carrinho em **milésimos de unidade**, inteiros (T003).
 *
 * Domínio puro: sem React, Zustand, Query ou rede. Três casas cobrem a precisão
 * exigida pela fórmula de produto pesável — `round(..., 3)` de AD-076 — e são o
 * que impede `0.1 + 0.2` de quebrar a comparação com os limiares de faixa, que
 * é a decisão crítica de `TipoPreco = 8` (`research.md`, D4).
 */

/**
 * Branded type: um `number` cru (unidades) não é aceito onde se espera
 * `Milesimos`. Um `type Milesimos = number` simples deixaria passar
 * `quantidade: 3` onde o correto é `3000`.
 */
export type Milesimos = number & { readonly __brand: 'Milesimos' };

/** Fator de conversão unidade → milésimo. */
export const MILESIMOS_POR_UNIDADE = 1000;

/** Quantidade fora do domínio representável (não inteira, insegura ou negativa). */
export class ErroQuantidadeInvalida extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroQuantidadeInvalida';
  }
}

/**
 * Constrói `Milesimos` a partir de um valor **já em milésimos**.
 *
 * Recusa não-inteiro em vez de arredondar em silêncio: chegar aqui com fração
 * significa que alguém dividiu antes de entrar no domínio, e é exatamente esse
 * erro que os branded types existem para pegar.
 */
export function milesimos(valorInteiro: number): Milesimos {
  if (!Number.isSafeInteger(valorInteiro)) {
    throw new ErroQuantidadeInvalida(
      `Quantidade em milésimos precisa ser inteiro seguro; recebido ${String(valorInteiro)}.`,
    );
  }
  if (valorInteiro < 0) {
    throw new ErroQuantidadeInvalida(
      `Quantidade não pode ser negativa; recebido ${String(valorInteiro)}.`,
    );
  }
  return valorInteiro as Milesimos;
}

export const ZERO_MILESIMOS = milesimos(0);

/** Converte unidades (inteiras ou fracionárias) para milésimos. */
export function milesimosDeUnidades(unidades: number): Milesimos {
  if (!Number.isFinite(unidades)) {
    throw new ErroQuantidadeInvalida(`Quantidade precisa ser finita; recebido ${String(unidades)}.`);
  }
  return milesimos(Math.round(unidades * MILESIMOS_POR_UNIDADE));
}

/** Soma de quantidades — usada pelo agregado por SKU. */
export function somarQuantidades(a: Milesimos, b: Milesimos): Milesimos {
  return milesimos(a + b);
}

/**
 * Formatação para exibição, em pt-BR (vírgula decimal).
 *
 * Feita com aritmética inteira, não com `toFixed`: converter para `number`
 * decimal só para formatar reintroduziria o ponto flutuante que o resto do
 * módulo existe para evitar.
 */
export function formatarQuantidade(q: Milesimos, casas: 0 | 3): string {
  if (casas === 0) {
    return String(Math.round(q / MILESIMOS_POR_UNIDADE));
  }
  const inteiros = Math.trunc(q / MILESIMOS_POR_UNIDADE);
  const fracao = q % MILESIMOS_POR_UNIDADE;
  return `${String(inteiros)},${String(fracao).padStart(3, '0')}`;
}

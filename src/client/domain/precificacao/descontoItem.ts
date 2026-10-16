/**
 * Vínculo preço ↔ desconto do item e limite do preço mínimo (feature 017,
 * `contracts/motor-desconto-api.md` §1.2, AD-279).
 *
 * Domínio puro: sem React, Zustand, Query ou rede, e sem ponto flutuante.
 *
 * A linha **não ganha campo** (`research.md` D1): `precoUnitario` guarda a
 * referência (o preço de tabela, ou o preço digitado quando é maior que ele) e
 * `descontoManual` guarda o desconto absoluto sobre o total da linha. O preço
 * que o operador vê é derivado — e por isso nunca volta como entrada do
 * desconto (D4).
 *
 * Pré-condição de todas as funções abaixo, exceto `ehVinculavel`:
 * `ehVinculavel(snapshot)`. Fora dele a barra não chama este módulo e preço e
 * desconto seguem independentes.
 */

import {
  ZERO_CENTAVOS,
  centavos,
  dividirPorQuantidade,
  multiplicarPorQuantidade,
  type Centavos,
} from './dinheiro';
import type { SnapshotPrecoProduto } from './linha';
import type { Milesimos } from './quantidade';

/**
 * Produto `'E'` com preço de tabela positivo: o único em que preço e desconto
 * se vinculam (D2). Em `'S'`/`'B'`/`''` os dois campos são somente leitura, e
 * com preço de tabela zero não há referência de onde derivar desconto (FR-005).
 */
export function ehVinculavel(snapshot: SnapshotPrecoProduto): boolean {
  return snapshot.pesavelEditavel === 'E' && snapshot.precoBase > ZERO_CENTAVOS;
}

/** `(precoBase − preço) × quantidade`; zero quando o preço não fica abaixo da tabela. */
export function descontoDoPreco(
  precoBase: Centavos,
  preco: Centavos,
  quantidade: Milesimos,
): Centavos {
  if (preco >= precoBase) {
    return ZERO_CENTAVOS;
  }
  return multiplicarPorQuantidade(centavos(precoBase - preco), quantidade);
}

/**
 * `precoBase − desconto ÷ quantidade`, com piso em zero.
 *
 * Valor de **exibição** (D3/D4): com divisão não exata ele é arredondado ao
 * centavo, e o desconto total — não este preço — é a verdade da linha.
 */
export function precoDoDesconto(
  precoBase: Centavos,
  desconto: Centavos,
  quantidade: Milesimos,
): Centavos {
  const preco = precoBase - dividirPorQuantidade(desconto, quantidade);
  return centavos(Math.max(0, preco));
}

/**
 * Maior desconto manual que mantém o preço no mínimo (017, FR-011):
 * `(precoBase − precoMinimo) × quantidade`, com piso em zero. `null` quando
 * não há mínimo cadastrado (`precoMinimo = 0`).
 *
 * Compara **totais**, nunca preços unitários (`research.md` D7): o desconto é
 * absoluto sobre a linha, e dividi-lo pela quantidade reintroduziria o
 * arredondamento de `precoDoDesconto`.
 */
export function limiteDeDesconto(
  precoBase: Centavos,
  precoMinimo: Centavos,
  quantidade: Milesimos,
): Centavos | null {
  if (precoMinimo <= ZERO_CENTAVOS) {
    return null;
  }
  if (precoMinimo >= precoBase) {
    return ZERO_CENTAVOS;
  }
  return multiplicarPorQuantidade(centavos(precoBase - precoMinimo), quantidade);
}

export interface AjusteDeMinimo {
  readonly desconto: Centavos;
  readonly ajustado: boolean;
}

/**
 * Limita o desconto ao limite do preço mínimo. **Ajusta, não recusa** (FR-010):
 * é o que o usuário pediu — "automaticamente deve alterar o valor para o
 * limiar".
 */
export function ajustarAoPrecoMinimo(desconto: Centavos, limite: Centavos | null): AjusteDeMinimo {
  if (limite === null || desconto <= limite) {
    return { desconto, ajustado: false };
  }
  return { desconto: limite, ajustado: true };
}

/** Os dois campos que a linha guarda para um item vinculável. */
export interface ItemConsolidado {
  readonly precoUnitario: Centavos;
  readonly descontoManual: Centavos;
}

/**
 * Preço praticado → o par que a linha guarda.
 *
 * Acima da tabela não existe acréscimo: o preço digitado vira o
 * `precoUnitario`, com desconto zero (FR-003).
 */
export function consolidarPorPreco(
  snapshot: SnapshotPrecoProduto,
  preco: Centavos,
  quantidade: Milesimos,
): ItemConsolidado {
  if (preco >= snapshot.precoBase) {
    return { precoUnitario: preco, descontoManual: ZERO_CENTAVOS };
  }
  return {
    precoUnitario: snapshot.precoBase,
    descontoManual: descontoDoPreco(snapshot.precoBase, preco, quantidade),
  };
}

/**
 * Desconto digitado → o par que a linha guarda. A referência é sempre o preço
 * de tabela, nunca um preço elevado digitado antes (D1): fixar a referência
 * impede que ela "ande" conforme o operador digita.
 */
export function consolidarPorDesconto(
  snapshot: SnapshotPrecoProduto,
  desconto: Centavos,
): ItemConsolidado {
  return { precoUnitario: snapshot.precoBase, descontoManual: desconto };
}

/**
 * Rateio do desconto de capa entre as linhas ativas do carrinho (T005).
 *
 * AD-098 (`specs/008-pagamento-geral/research.md`, D8): decisão direta do
 * usuário pela divisão **igual** com clamp e redistribuição — a alternativa
 * proporcional (padrão fiscal, nunca negativa um item) foi apresentada com o
 * risco explícito e rejeitada em favor da redação literal de `PAY-10` AC3.
 * Domínio puro: sem React, Zustand, Query ou rede.
 */

import {
  aplicarPercentual,
  centavos,
  distribuirPorMaiorResto,
  type Centavos,
} from '../precificacao/dinheiro';

/** Linha do carrinho elegível para o rateio — só o que o algoritmo precisa. */
export interface LinhaRateavel {
  readonly idLinha: string;
  readonly totalLiquido: Centavos;
}

/**
 * Modo e entrada bruta com que o operador expressou o desconto de capa
 * (`FR-015`). `entrada` é percentual (`number`) em `'PERCENTUAL'` e
 * `Centavos` em `'VALOR'` — ver `data-model.md` §2, campo `DescontoCapa`.
 */
export interface DescontoCapa {
  readonly modo: 'PERCENTUAL' | 'VALOR';
  readonly entrada: number;
  readonly valorResolvido: Centavos;
}

/** Desconto de capa maior que a soma das linhas — pré-condição de `ratearDescontoCapa` violada. */
export class ErroDescontoCapaAcimaDoSubtotal extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroDescontoCapaAcimaDoSubtotal';
  }
}

/**
 * Resolve a entrada do operador para `Centavos`, sem aplicar teto.
 *
 * `FR-015`/AD-039: o desconto de capa não tem limite máximo no domínio — o
 * único freio é a guarda I8 (`descontoCapa <= subtotal`), que vive no slice,
 * porque é ali que o subtotal corrente do carrinho está disponível para
 * recusar a aplicação com toast. Aqui a função só resolve o valor.
 */
export function resolverDescontoCapa(
  modo: 'PERCENTUAL' | 'VALOR',
  entrada: number,
  subtotal: Centavos,
): Centavos {
  if (modo === 'PERCENTUAL') {
    return aplicarPercentual(subtotal, entrada);
  }
  // 'VALOR': a entrada já chega em centavos inteiros — `centavos()` recusa
  // fração em vez de arredondar (mesma defesa de fronteira de `dinheiro.ts`).
  return centavos(entrada);
}

/**
 * Rateia `descontoCapa` entre `linhas` por divisão igual com clamp e
 * redistribuição (AD-098, `data-model.md` §5).
 *
 * Cada rodada divide o restante igualmente (maior resto, AD-072) entre as
 * linhas ainda elegíveis; toda linha cuja parcela estourar o próprio
 * `totalLiquido` é fixada nesse teto e sai do conjunto elegível, e o
 * excedente acumulado volta para uma nova rodada. Isso é o que impede um
 * `ValorTotal` negativo na NFCe — o modo de falha fiscal real que a guarda
 * existe para evitar.
 *
 * Terminação: cada rodada com estouro remove **ao menos uma** linha do
 * conjunto elegível (nunca todas — a pré-condição garante que sempre resta
 * folga suficiente), então o laço não pode iterar mais vezes do que
 * `linhas.length`. Uma rodada sem estouro devolve imediatamente.
 *
 * Pré-condição (I8, garantida pelo slice antes de chamar): `descontoCapa <=
 * Σ totalLiquido(linhas)`. Violá-la lançaria um rateio silenciosamente
 * incompleto (sobra sem para onde ir) — em vez disso lança
 * `ErroDescontoCapaAcimaDoSubtotal` explícito (mesmo padrão de
 * `ErroPrecisaoMonetaria` em `dinheiro.ts`).
 */
export function ratearDescontoCapa(
  descontoCapa: Centavos,
  linhas: readonly LinhaRateavel[],
): ReadonlyMap<string, Centavos> {
  const somaTotalLiquido = linhas.reduce<number>(
    (acumulado, linha) => acumulado + linha.totalLiquido,
    0,
  );

  if (descontoCapa > somaTotalLiquido) {
    throw new ErroDescontoCapaAcimaDoSubtotal(
      `Desconto de capa (${String(descontoCapa)}) excede a soma das linhas (${String(somaTotalLiquido)}).`,
    );
  }

  // Nenhum caso especial para `descontoCapa === 0` ou `linhas` vazia: o laço
  // abaixo já os resolve — `distribuirPorMaiorResto(0, pesos)` devolve zeros
  // (ou `[]` quando `pesos` também é vazio), e nenhuma linha estoura zero.
  let elegiveis = linhas;
  const fixadas = new Map<string, Centavos>();
  let restante = descontoCapa;

  for (;;) {
    const pesosIguais = elegiveis.map(() => centavos(1));
    const parcelas = distribuirPorMaiorResto(restante, pesosIguais);

    const estouram = elegiveis.filter(
      (linha, indice) => (parcelas[indice] ?? centavos(0)) > linha.totalLiquido,
    );

    if (estouram.length === 0) {
      const resultado = new Map(fixadas);
      elegiveis.forEach((linha, indice) => {
        resultado.set(linha.idLinha, parcelas[indice] ?? centavos(0));
      });
      return resultado;
    }

    for (const linha of estouram) {
      fixadas.set(linha.idLinha, linha.totalLiquido);
      restante = centavos(restante - linha.totalLiquido);
    }
    const idsEstourados = new Set(estouram.map((linha) => linha.idLinha));
    elegiveis = elegiveis.filter((linha) => !idsEstourados.has(linha.idLinha));
  }
}

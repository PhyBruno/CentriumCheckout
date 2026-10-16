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
  ZERO_CENTAVOS,
  aplicarPercentual,
  centavos,
  distribuirPorMaiorResto,
  type Centavos,
} from '../precificacao/dinheiro';
import { TOTAL_MINIMO_DA_LINHA } from '../precificacao/linha';
import type { CondicaoPagamento } from './formaPagamento';

/** Linha do carrinho elegível para o rateio — só o que o algoritmo precisa. */
export interface LinhaRateavel {
  readonly idLinha: string;
  readonly totalLiquido: Centavos;
}

/**
 * Quem definiu a capa (017, FR-025): a condição de pagamento escolhida
 * (`selecionarCondicao`) ou o operador digitando (`aplicarDescontoCapa`).
 */
export type OrigemDescontoCapa = 'CONDICAO' | 'MANUAL';

/**
 * Modo e entrada bruta com que o operador expressou o desconto de capa
 * (`FR-015`). `entrada` é percentual (`number`) em `'PERCENTUAL'` e
 * `Centavos` em `'VALOR'` — ver `data-model.md` §2, campo `DescontoCapa`.
 */
export interface DescontoCapa {
  readonly modo: 'PERCENTUAL' | 'VALOR';
  readonly entrada: number;
  readonly valorResolvido: Centavos;
  readonly origem: OrigemDescontoCapa;
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
 * Aqui a função só resolve o valor. ⚠️ O "sem teto" de `FR-015`/AD-039 foi
 * superado pela 017 (AD-279): quem aplica o teto da condição é
 * `resolverCapaComTeto`, abaixo, chamado pelo slice; a guarda I8
 * (`descontoCapa < subtotal`) continua vivendo no slice.
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
 * Por que um desconto de capa não pode ser aplicado — `null` significa "pode".
 *
 * - `ZERA_A_VENDA` — o desconto engole o subtotal inteiro. Não sobra nota a
 *   emitir: o total a pagar seria zero e não existe pagamento capaz de fechar
 *   uma venda de R$ 0,00.
 * - `ZERA_UM_ITEM` — o total da venda ainda é positivo, mas o **rateio** deixa
 *   pelo menos uma linha valendo menos de um centavo. Com a chave
 *   `DESCONTO_CAPA_NO_ERP` ligada o rateio é do ERP e esta recusa não é
 *   avaliada (017, AD-279).
 * - `CONDICAO_SEM_DESCONTO` — a condição escolhida tem teto zero (017,
 *   FR-018): não há valor ao qual ajustar além de zero.
 */
export type RecusaDescontoCapa = 'ZERA_A_VENDA' | 'ZERA_UM_ITEM' | 'CONDICAO_SEM_DESCONTO';

/**
 * Teto da capa em centavos (017, FR-017/FR-018): o percentual máximo da
 * condição sobre o subtotal líquido. `null` = sem condição, sem teto (FR-022);
 * `0` = a condição não permite desconto.
 */
export function tetoDaCapa(
  condicao: Pick<CondicaoPagamento, 'descontoMaximo'> | null,
  subtotal: Centavos,
): Centavos | null {
  if (condicao === null) {
    return null;
  }
  if (condicao.descontoMaximo <= 0) {
    return ZERO_CENTAVOS;
  }
  return aplicarPercentual(subtotal, condicao.descontoMaximo);
}

/** A capa resolvida, já ajustada ao teto quando passou dele. */
export interface ResolucaoDaCapa {
  readonly modo: 'PERCENTUAL' | 'VALOR';
  readonly entrada: number;
  readonly valorResolvido: Centavos;
  readonly ajustadaAoTeto: boolean;
}

/**
 * Resolve a entrada do operador aplicando o teto da condição como **ajuste**,
 * não como recusa (017, FR-016, `research.md` D8): a capa grava a cada tecla
 * (AD-278), e ao digitar "10" o "1" já foi uma capa válida — recusar e "voltar
 * ao último valor" restauraria um número que o operador nunca escolheu.
 *
 * A comparação é em **centavos**, nunca em percentual (D8): percentual contra
 * percentual e valor contra valor dariam respostas diferentes para o mesmo
 * desconto por causa do arredondamento. Ajustada, a entrada passa a ser o
 * próprio teto na unidade do modo — `descontoMaximo` em `'PERCENTUAL'`, o teto
 * em centavos em `'VALOR'`.
 *
 * Teto zero com desconto positivo é a única recusa daqui.
 */
export function resolverCapaComTeto(
  modo: 'PERCENTUAL' | 'VALOR',
  entrada: number,
  subtotal: Centavos,
  teto: Centavos | null,
  descontoMaximo: number | null,
): ResolucaoDaCapa | { readonly recusa: 'CONDICAO_SEM_DESCONTO' } {
  const valorResolvido = resolverDescontoCapa(modo, entrada, subtotal);
  if (teto === null || valorResolvido <= teto) {
    return { modo, entrada, valorResolvido, ajustadaAoTeto: false };
  }
  if (teto === ZERO_CENTAVOS) {
    return { recusa: 'CONDICAO_SEM_DESCONTO' };
  }
  return {
    modo,
    entrada: modo === 'PERCENTUAL' ? (descontoMaximo ?? entrada) : teto,
    valorResolvido: teto,
    ajustadaAoTeto: true,
  };
}

/**
 * Guarda do desconto de capa antes de aplicá-lo (pedido do usuário,
 * 2026-09-04): ele nunca pode zerar o valor da venda **nem** o de um item
 * depois do rateio.
 *
 * **Aperta AD-098 sem revogá-la.** O rateio continua sendo divisão igual com
 * clamp e redistribuição, e `ratearDescontoCapa` continua fixando no próprio
 * `totalLiquido` a linha cuja parcela estouraria. O que muda é que esse
 * desfecho deixa de ser aceitável na entrada: uma linha fixada no teto fica
 * valendo zero, e é exatamente isso que a regra nova proíbe. Na prática,
 * portanto, todo desconto aceito daqui em diante produz um rateio **sem
 * clamp** — o clamp segue no algoritmo como rede de segurança do caminho de
 * montagem do payload, que não repete esta checagem.
 *
 * `subtotal` e `linhas` chegam separados, e não derivados um do outro, porque
 * são portas distintas do slice (`subtotalCarrinho()` e `linhasRateaveis()`):
 * em produção coincidem, mas depender dessa coincidência faria a função mentir
 * quando não coincidissem. Com `linhas` vazia só a primeira regra pode falar —
 * não há rateio a examinar.
 *
 * Nunca lança: a pré-condição de `ratearDescontoCapa` (`desconto <= Σ linhas`)
 * é verificada aqui antes da chamada, e violá-la já é `ZERA_A_VENDA`.
 */
export function recusaDoDescontoCapa(
  descontoCapa: Centavos,
  subtotal: Centavos,
  linhas: readonly LinhaRateavel[],
): RecusaDescontoCapa | null {
  if (descontoCapa >= subtotal) {
    return 'ZERA_A_VENDA';
  }

  if (linhas.length === 0) {
    return null;
  }

  const somaTotalLiquido = linhas.reduce<number>(
    (acumulado, linha) => acumulado + linha.totalLiquido,
    0,
  );
  if (descontoCapa >= somaTotalLiquido) {
    return 'ZERA_A_VENDA';
  }

  const rateio = ratearDescontoCapa(descontoCapa, linhas);
  for (const linha of linhas) {
    // Linha que **já** valia menos de um centavo antes do rateio não é
    // responsabilidade deste desconto, e por isso não o recusa. Sem esta
    // condição, um brinde cadastrado com `PrecoVenda = 0` — ou uma linha de DAV
    // cujo desconto igualava o bruto — travava **todo** desconto de capa,
    // inclusive R$ 0,01: a parcela dela é zero, `0 - 0 = 0` é menor que o
    // mínimo, e o operador lia "zeraria um item" sobre um item que ele não
    // zerou, sem nenhum valor menor capaz de liberar a operação.
    //
    // A regra é sobre a **transição**: recusa-se o desconto que faz uma linha
    // viável deixar de ser.
    if (linha.totalLiquido < TOTAL_MINIMO_DA_LINHA) {
      continue;
    }

    const parcela = rateio.get(linha.idLinha) ?? ZERO_CENTAVOS;
    if (linha.totalLiquido - parcela < TOTAL_MINIMO_DA_LINHA) {
      return 'ZERA_UM_ITEM';
    }
  }

  return null;
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

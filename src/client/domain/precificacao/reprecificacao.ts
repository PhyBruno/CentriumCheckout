/**
 * Cascata de reprecificação por SKU (T008) — função **pura**: recebe linhas,
 * devolve linhas. Não conhece Zustand, rede, pagamento ou cliente.
 *
 * Chamada obrigatoriamente após inserção, edição de quantidade e cancelamento
 * (`FR-007`), e na troca de cliente quando `TipoPreco = 9` (`FR-018`).
 */

import {
  aplicarPercentual,
  multiplicarPorQuantidade,
  subtrair,
  ZERO_CENTAVOS,
  type Centavos,
} from './dinheiro';
import { participaDaPrecificacao, quantidadeAgregada, type LinhaCarrinho } from './linha';
import { resolvePrecoUnitario } from './tabelaPreco';
import type { Milesimos } from './quantidade';

const PERCENTUAL_TOTAL = 100;

/**
 * Desconto de convênio da linha (AD-023): fator `(100 − DescontoConvenio)`
 * aplicado ao **total bruto**, depois da multiplicação pela quantidade — nunca
 * ao preço unitário (`data-model.md` §1).
 *
 * O cliente default nunca tem convênio (AD-108): `percentual = 0` devolve
 * `ZERO_CENTAVOS`.
 */
export function descontoDeConvenio(
  precoUnitario: Centavos,
  quantidade: Milesimos,
  descontoConvenioPercentual: number,
): Centavos {
  if (descontoConvenioPercentual <= 0) {
    return ZERO_CENTAVOS;
  }
  const bruto = multiplicarPorQuantidade(precoUnitario, quantidade);
  return subtrair(bruto, aplicarPercentual(bruto, PERCENTUAL_TOTAL - descontoConvenioPercentual));
}

/**
 * Recalcula o preço de **todas** as linhas ativas não-congeladas do SKU.
 *
 * Contrato de comportamento (`contracts/precificacao-domain-api.md`):
 *
 * 1. Agrega a quantidade das linhas do SKU que são ativas e não-congeladas
 *    (invariantes I2/I3).
 * 2. Chama `resolvePrecoUnitario` **uma única vez** com esse agregado.
 * 3. Aplica o preço a todas essas linhas, não só à que mudou (`CART-06`).
 * 4. Linhas canceladas, congeladas e de outros SKUs voltam **inalteradas por
 *    identidade** (mesma referência), o que mantém o custo de re-render baixo
 *    com Immer.
 *
 * `descontoConvenioPercentual` é opcional e default `0`: a assinatura de três
 * argumentos do contrato continua válida. Ele entra aqui, e não numa segunda
 * passagem, porque o desconto de convênio é derivado de `precoUnitario` e
 * `quantidade` (T028) — recalcular em duas etapas deixaria a linha
 * momentaneamente com preço novo e desconto velho.
 *
 * Com `percentual = 0` o `descontoLinha` existente é **preservado**, e não
 * zerado: é assim que o desconto manual de um produto `'E'` sobrevive a uma
 * reprecificação numa venda sem convênio (o caso dominante, AD-108).
 */
export function repricarSku(
  linhas: readonly LinhaCarrinho[],
  codigoProduto: string,
  tipoPreco: number,
  descontoConvenioPercentual = 0,
): readonly LinhaCarrinho[] {
  const elegiveis = linhas.filter(
    (linha) => linha.snapshot.codigoProduto === codigoProduto && participaDaPrecificacao(linha),
  );

  const referencia = elegiveis[0];
  if (referencia === undefined) {
    // Nenhuma linha ativa não-congelada deste SKU: nada a recalcular, e o array
    // volta por identidade.
    return linhas;
  }

  const agregado = quantidadeAgregada(linhas, codigoProduto);
  const precoUnitario = resolvePrecoUnitario(tipoPreco, referencia.snapshot, agregado);

  return linhas.map((linha) => {
    if (linha.snapshot.codigoProduto !== codigoProduto || !participaDaPrecificacao(linha)) {
      return linha;
    }

    const descontoLinha =
      descontoConvenioPercentual > 0
        ? descontoDeConvenio(precoUnitario, linha.quantidade, descontoConvenioPercentual)
        : linha.descontoLinha;

    if (linha.precoUnitario === precoUnitario && linha.descontoLinha === descontoLinha) {
      return linha;
    }

    return { ...linha, precoUnitario, descontoLinha };
  });
}

/**
 * Reprecifica todos os SKUs distintos com linha ativa não-congelada — usado na
 * troca de cliente (`FR-018`), quando o preço de qualquer produto pode mudar de
 * uma vez (lista de preço em `TipoPreco = 9`, ou novo `DescontoConvenio`).
 */
export function repricarTodosOsSkus(
  linhas: readonly LinhaCarrinho[],
  tipoPreco: number,
  descontoConvenioPercentual = 0,
): readonly LinhaCarrinho[] {
  const skus = new Set(
    linhas.filter(participaDaPrecificacao).map((linha) => linha.snapshot.codigoProduto),
  );

  return [...skus].reduce<readonly LinhaCarrinho[]>(
    (atuais, sku) => repricarSku(atuais, sku, tipoPreco, descontoConvenioPercentual),
    linhas,
  );
}

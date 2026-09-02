/**
 * Entidades de linha do carrinho e os seletores derivados (`data-model.md` §2–§4).
 *
 * Vive no domínio puro, não no slice, por dois motivos: `repricarSku` e
 * `tabelaPreco` precisam destes tipos sem depender do Zustand, e os seletores
 * são cálculo, não estado — `totalLinha` **nunca** é armazenado (invariante I9),
 * porque um campo redundante divergiria do preço na primeira reprecificação.
 */

import {
  ZERO_CENTAVOS,
  calcularTotalLinha,
  multiplicarPorQuantidade,
  somar,
  type Centavos,
} from './dinheiro';
import { ZERO_MILESIMOS, somarQuantidades, type Milesimos } from './quantidade';

/**
 * `ProdutoPesavelEditavel` do ERP. Os quatro valores são mutuamente exclusivos
 * **por construção do campo** (AD-070): é um único campo string entre 4 valores
 * discretos, não dois booleanos combináveis — daí a união exaustiva.
 */
export type PesavelEditavel = 'S' | 'B' | '' | 'E';

/**
 * Cópia dos dados de preço do produto, feita **no momento da inserção** e
 * guardada dentro da própria linha.
 *
 * É o que torna `repricarSku` independente do cache do TanStack Query
 * (`CART-05`, AC5) — o cache é otimização de rede, nunca fonte de dado para
 * cálculo. Só pode ser montado a partir de `SDTCheckout_GetProduto`:
 * `GetListaProdutos` não traz `PrecoVenda` nem `ProdutoPesavelEditavel`
 * (AD-091, `research.md` D1).
 */
export interface SnapshotPrecoProduto {
  readonly codigoProduto: string;
  readonly descricao: string;
  readonly unidadeMedida: string;
  /** `PrecoVenda` — preço unitário base, usado para todo `TipoPreco ≠ 8`. */
  readonly precoBase: Centavos;
  /** `PrecoVenda1..PrecoVenda5` — usados só quando `TipoPreco = 8`. */
  readonly precosFaixa: readonly [Centavos, Centavos, Centavos, Centavos, Centavos];
  /** `QtdMinimaPreco2..QtdMinimaPreco5`; `0` = faixa não configurada. */
  readonly limiaresFaixa: readonly [Milesimos, Milesimos, Milesimos, Milesimos];
  readonly pesavelEditavel: PesavelEditavel;
}

/** Como a linha entrou na venda. `RASCUNHO`/`DAV` são as origens congeladas. */
export type OrigemLinha = 'MANUAL' | 'BUSCA' | 'BALANCA' | 'RASCUNHO' | 'DAV';

export interface LinhaCarrinho {
  /** Identidade própria: o mesmo SKU pode ocupar várias linhas (`research.md` D12). */
  readonly idLinha: string;
  readonly snapshot: SnapshotPrecoProduto;
  quantidade: Milesimos;
  /** Preço unitário base corrente — resultado de `resolvePrecoUnitario`. */
  precoUnitario: Centavos;
  /**
   * Desconto de convênio, absoluto sobre o **total** da linha (AD-023).
   *
   * Campo **derivado**: só `repricarSku`/`repricarTodosOsSkus` escrevem aqui,
   * recalculando a cada reprecificação a partir do `descontoConvenio` do
   * cliente atual — inclusive para zerar quando o cliente muda para um sem
   * convênio (AD-108). Nunca preserva valor de um cliente anterior.
   */
  descontoConvenio: Centavos;
  /**
   * Desconto manual, absoluto sobre o **total** da linha, digitado pelo
   * operador num produto `'E'` (`FR-014`).
   *
   * Campo **independente** de `descontoConvenio`: `repricarSku` nunca o
   * escreve, então sobrevive intacto a qualquer troca de cliente.
   */
  descontoManual: Centavos;
  /** `CART-08` — a linha nunca sai do array; cancelar só marca (invariante I1). */
  cancelada: boolean;
  /** `true` só quando `origem ∈ {'RASCUNHO','DAV'}` (AD-067, invariantes I5/I6). */
  readonly precoCongelado: boolean;
  readonly origem: OrigemLinha;
}

/** As origens que produzem linha com preço congelado (invariante I5). */
export function origemCongelaPreco(origem: OrigemLinha): boolean {
  return origem === 'RASCUNHO' || origem === 'DAV';
}

/**
 * Linhas que participam de reprecificação e do agregado do SKU: ativas **e**
 * não-congeladas (invariantes I2/I3, `research.md` D3).
 *
 * A linha congelada fica fora do agregado porque, se contasse, empurraria as
 * demais para uma faixa superior sem receber esse preço de volta — produziria
 * duas linhas do mesmo SKU com preços divergentes por um motivo invisível ao
 * operador.
 */
export function participaDaPrecificacao(linha: LinhaCarrinho): boolean {
  return !linha.cancelada && !linha.precoCongelado;
}

export function linhasAtivas(linhas: readonly LinhaCarrinho[]): readonly LinhaCarrinho[] {
  return linhas.filter((linha) => !linha.cancelada);
}

/**
 * Quantidade acumulada do SKU na venda inteira — a entrada que decide a faixa em
 * `TipoPreco = 8` (`FR-006`).
 */
export function quantidadeAgregada(
  linhas: readonly LinhaCarrinho[],
  codigoProduto: string,
): Milesimos {
  return linhas
    .filter((linha) => linha.snapshot.codigoProduto === codigoProduto)
    .filter(participaDaPrecificacao)
    .reduce<Milesimos>((total, linha) => somarQuantidades(total, linha.quantidade), ZERO_MILESIMOS);
}

export function totalBruto(linha: LinhaCarrinho): Centavos {
  return multiplicarPorQuantidade(linha.precoUnitario, linha.quantidade);
}

export function totalLinha(linha: LinhaCarrinho): Centavos {
  return calcularTotalLinha(
    linha.precoUnitario,
    linha.quantidade,
    somar(linha.descontoConvenio, linha.descontoManual),
  );
}

/**
 * Soma das linhas ativas — canceladas ficam de fora (invariante I2, `FR-009`);
 * congeladas entram com o preço que trouxeram (`data-model.md` §4).
 */
export function totalVenda(linhas: readonly LinhaCarrinho[]): Centavos {
  return linhasAtivas(linhas).reduce<Centavos>(
    (total, linha) => somar(total, totalLinha(linha)),
    ZERO_CENTAVOS,
  );
}

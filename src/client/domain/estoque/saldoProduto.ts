/**
 * Regra de saldo de estoque do Checkout (AD-236).
 *
 * Réplica de `PNFCe_ValidaSaldoProdutos`, a validação que o ERP roda em
 * SUSPENDER e FATURAR: soma a quantidade de **todas** as linhas do mesmo
 * produto e compara com o saldo, acusando só quando a soma é **maior** que o
 * saldo. O Checkout valida primeiro (decisão do usuário, 2026-09-16); o ERP
 * continua sendo a segunda barreira.
 *
 * Fora do escopo, e por isso deixado ao ERP: o desconto de pedidos em aberto
 * (`PRM0401 = 'S'`) e o fator de conversão de unidade (`NfcQtd × fator`). Com
 * eles o ERP pode recusar uma venda que o Checkout deixou passar, e a recusa
 * chega pelo caminho de sempre (`messages` do `FaturarNFCe`).
 *
 * Domínio puro: sem React, Zustand, Query ou rede. Toda a aritmética é em
 * milésimos inteiros (`money-precision`), então `0,1 + 0,2` contra um saldo de
 * `0,3` passa, como deve.
 */

import { linhasAtivas, type LinhaCarrinho } from '../precificacao/linha';
import {
  MILESIMOS_POR_UNIDADE,
  ZERO_MILESIMOS,
  formatarQuantidade,
  milesimos,
  somarQuantidades,
  type Milesimos,
} from '../precificacao/quantidade';

/**
 * `SessaoUsuario.FaturaProdutoSemSaldo` (`EmpSldPro` do ERP): `'A'` avisa,
 * `'B'` bloqueia, `''` não valida.
 */
export type PoliticaSaldo = 'A' | 'B' | '';

/**
 * Valor desconhecido vira `''` (não valida), como o próprio ERP faz — o
 * procedure só age em `'A'` e `'B'`. Caixa e espaços são tolerados porque o
 * campo é um `char` do cadastro da empresa.
 */
export function normalizarPoliticaSaldo(valor: string | undefined): PoliticaSaldo {
  const limpo = (valor ?? '').trim().toUpperCase();
  return limpo === 'A' || limpo === 'B' ? limpo : '';
}

/**
 * Saldo em milésimos de unidade, **com sinal**.
 *
 * Tipo próprio, e não `Milesimos`: o saldo do ERP pode ser negativo
 * (`"-205.000"`, medido no preview), e `Milesimos` recusa negativo por
 * construção — é quantidade de linha. Os dois só se encontram na comparação de
 * `avaliarSaldo`, que é entre inteiros.
 */
export type SaldoMilesimos = number & { readonly __brand: 'SaldoMilesimos' };

/** Converte o saldo em unidades (decimal do ERP) para milésimos inteiros. */
export function saldoEmMilesimos(unidades: number): SaldoMilesimos {
  if (!Number.isFinite(unidades)) {
    throw new RangeError(`Saldo precisa ser finito; recebido ${String(unidades)}.`);
  }
  const valor = Math.round(unidades * MILESIMOS_POR_UNIDADE);
  if (!Number.isSafeInteger(valor)) {
    throw new RangeError(`Saldo fora do intervalo representável; recebido ${String(unidades)}.`);
  }
  // `Math.round(-0.0001 * 1000)` é `-0`; normalizado para o zero comum.
  return (valor === 0 ? 0 : valor) as SaldoMilesimos;
}

/** `78,000`, `-205,000` — mesma forma de `formatarQuantidade`, com sinal. */
export function formatarSaldo(saldo: SaldoMilesimos): string {
  const absoluto = formatarQuantidade(milesimos(Math.abs(saldo)), 3);
  return saldo < 0 ? `-${absoluto}` : absoluto;
}

/**
 * Quantidade do produto já na venda: linhas **ativas** (não canceladas) do
 * mesmo `codigoProduto`, **incluindo as congeladas** de DAV/NFCe.
 *
 * Não é `quantidadeAgregada`: aquela exclui as congeladas porque decide faixa
 * de preço, e a linha congelada não participa da reprecificação. Para estoque
 * ela conta como qualquer outra — é mercadoria saindo da loja, e o ERP soma
 * todas as linhas do rascunho.
 *
 * `excetoLinhaId` é a linha em edição: a quantidade dela é a **proposta**, e
 * somá-la de novo contaria a mesma mercadoria duas vezes.
 */
export function quantidadeDoProdutoNoCarrinho(
  linhas: readonly LinhaCarrinho[],
  codigoProduto: string,
  excetoLinhaId?: string,
): Milesimos {
  return linhasAtivas(linhas)
    .filter((linha) => linha.snapshot.codigoProduto === codigoProduto)
    .filter((linha) => linha.idLinha !== excetoLinhaId)
    .reduce<Milesimos>((total, linha) => somarQuantidades(total, linha.quantidade), ZERO_MILESIMOS);
}

export interface EntradaAvaliacaoSaldo {
  readonly politica: PoliticaSaldo;
  /** `null` quando o ERP não devolveu `Saldo` (versão anterior do contrato). */
  readonly saldo: SaldoMilesimos | null;
  /** Soma das demais linhas do produto (`quantidadeDoProdutoNoCarrinho`). */
  readonly quantidadeNoCarrinho: Milesimos;
  /** Quantidade que a linha nova (ou editada) passaria a ter. */
  readonly quantidadeProposta: Milesimos;
  /**
   * Quantidade atual da linha em edição. Presente só na edição: é o que permite
   * reconhecer uma **redução**, que nunca bloqueia (ver `avaliarSaldo`).
   */
  readonly quantidadeAnterior?: Milesimos;
  /** Descrição do produto, para a frase. */
  readonly descricao: string;
}

export type AvaliacaoSaldo =
  | { readonly veredito: 'livre' }
  | { readonly veredito: 'aviso' | 'bloqueio'; readonly frase: string };

export const AVALIACAO_LIVRE: AvaliacaoSaldo = { veredito: 'livre' };

/** Frase que o operador lê, no toast e no botão bloqueado. */
export function fraseEstoqueInsuficiente(
  descricao: string,
  saldo: SaldoMilesimos,
  total: Milesimos,
): string {
  return `Estoque insuficiente para ${descricao}: disponível ${formatarSaldo(saldo)}, na venda ${formatarQuantidade(total, 3)}.`;
}

/**
 * Decide se a quantidade proposta cabe no saldo.
 *
 * - `''` ou saldo desconhecido → `livre`.
 * - soma ≤ saldo → `livre` (igual ao saldo passa, como no ERP).
 * - soma > saldo → `'A'` avisa; `'B'` bloqueia.
 *
 * **Diminuir nunca bloqueia** (AD-236): uma edição que não aumenta a linha só
 * pode reduzir a violação, então em `'B'` ela vira aviso. Bloquear ali
 * prenderia o operador numa venda que já excedia o saldo — trazida de um DAV,
 * por exemplo — sem poder nem corrigir a quantidade para baixo.
 */
export function avaliarSaldo(entrada: EntradaAvaliacaoSaldo): AvaliacaoSaldo {
  if (entrada.politica === '' || entrada.saldo === null) {
    return AVALIACAO_LIVRE;
  }

  const total = somarQuantidades(entrada.quantidadeNoCarrinho, entrada.quantidadeProposta);
  if (total <= entrada.saldo) {
    return AVALIACAO_LIVRE;
  }

  const frase = fraseEstoqueInsuficiente(entrada.descricao, entrada.saldo, total);
  const naoAumenta =
    entrada.quantidadeAnterior !== undefined &&
    entrada.quantidadeProposta <= entrada.quantidadeAnterior;

  if (entrada.politica === 'A' || naoAumenta) {
    return { veredito: 'aviso', frase };
  }
  return { veredito: 'bloqueio', frase };
}

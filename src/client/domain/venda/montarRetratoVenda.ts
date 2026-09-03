/**
 * Retrato da venda enviado ao ERP (T004, `contracts/faturamento-api.md`).
 *
 * Este módulo é **compartilhado** entre a finalização/suspensão (feature 004) e
 * a validação prévia (feature 014, `specs/014-validacao-previa-nfce/contracts/
 * validacao-domain-api.md`): as duas produzem o corpo de `CheckoutFaturarNFCe`
 * pela mesma função, o que impede por construção que a venda validada e a venda
 * emitida divirjam (`FR-015`, AD-111). Substitui o antigo
 * `montarPayloadFaturarNFCe`, que era exclusivo da 004.
 *
 * Domínio puro (Constitution II): recebe snapshots já prontos e não conhece
 * Zustand, React, TanStack Query nem rede. É total — para o mesmo snapshot
 * devolve sempre o mesmo objeto, sem ler relógio nem gerar identificador.
 */

import { somar, type Centavos } from '../precificacao/dinheiro';
import { linhasAtivas, totalBruto, totalLinha, type LinhaCarrinho } from '../precificacao/linha';
import { MILESIMOS_POR_UNIDADE, type Milesimos } from '../precificacao/quantidade';
import { serializarLogAuditoria } from '../auditoria/serializarLog';
import type { HistoricoAuditoriaVenda } from '../auditoria/eventos';
import type { IdentidadeVenda } from '../../stores/slices/identidadeVendaSlice';

/** Operação que o retrato representa (`contracts/validacao-domain-api.md` §1). */
export type OperacaoVenda = 'FATURAR' | 'SUSPENDER' | 'VALIDAR';

/** Valor de `SuspenderOuFaturar` aceito pelo ERP — `'VALIDAR'` não existe lá. */
export type SuspenderOuFaturar = 'FATURAR' | 'SUSPENDER';

/**
 * Uma forma de pagamento já pronta para o payload
 * (`CheckoutFaturarNFCe.FormasDePagamento_FormasDePagamentoItem`, YAML linha
 * 1555).
 *
 * O shape pertence à feature 008 (`specs/008-pagamento-geral/contracts/
 * erp-pagamento-api.md` §3), que é a dona única do que é uma forma de
 * pagamento. Esta feature **transporta sem interpretar** — declarar os campos
 * aqui criaria uma segunda fonte de verdade que divergiria da 008 no primeiro
 * campo novo de TEF/PIX. Não é dado de fronteira de entrada: é corpo de saída,
 * então não há schema Zod a aplicar (Constitution IV vale para o que **entra**).
 */
export type FormaDePagamentoRetrato = Readonly<Record<string, unknown>>;

/** Item de `produtos[]` (`CheckoutFaturarNFCe.produtos_produtosItem`, YAML linha 1514). */
export interface ItemRetratoVenda {
  readonly sequencial: number;
  readonly codigoProduto: string;
  /** Unidades decimais — o ERP recebe `double`, não milésimos. */
  readonly quantidade: number;
  /** Reais decimais — o ERP recebe `double`, não centavos. */
  readonly precoUnitario: number;
  /** Sempre `0`: o desconto é expresso em valor absoluto (`DescontoValor`). */
  readonly DescontoPercentual: number;
  readonly DescontoValor: number;
  readonly UDM: string;
  readonly ValorBruto: number;
  readonly ValorTotal: number;
}

/** Corpo de `CheckoutFaturarNFCe` (YAML linha 1462). */
export interface CheckoutFaturarNFCe {
  readonly SuspenderOuFaturar: SuspenderOuFaturar;
  readonly NumeroNota: number;
  readonly CadSerieNFCe: string;
  readonly clienteCodigo: number;
  readonly vendedorCodigo: number;
  readonly CondicaoPagamentoCodigo: number;
  readonly produtos: readonly ItemRetratoVenda[];
  readonly FormasDePagamento: readonly FormaDePagamentoRetrato[];
  readonly Log: string;
}

/**
 * Tudo que o retrato precisa, já colhido dos slices pelo call site.
 *
 * Não há `Empresa` aqui: o BFF injeta esse campo em toda chamada `/api/erp/*`
 * (feature 002, AD-019) — o cliente nunca o monta.
 */
export interface SnapshotVenda {
  /** Linhas do carrinho, **incluindo canceladas** (feature 003, invariante I1). */
  readonly linhas: readonly LinhaCarrinho[];
  /** Identidade da venda no ERP (feature 004, `data-model.md` §1). */
  readonly identidade: IdentidadeVenda;
  /** `SessaoUsuario.CadSerieNFCe` — sempre do bootstrap, nunca do operador (AD-034). */
  readonly cadSerieNFCe: string;
  /** Cliente da venda; o default do PDV quando não houve identificação (AD-032). */
  readonly clienteCodigo: number;
  /** Vendedor **selecionado** para a venda, nunca o operador logado (`FR-010`). */
  readonly vendedorCodigo: number;
  /** Condição de pagamento vigente — escalar, uma por venda (feature 008). */
  readonly condicaoPagamentoCodigo: number;
  /** Histórico acumulado da sessão de venda (feature 001). */
  readonly eventos: HistoricoAuditoriaVenda;
}

const CENTAVOS_POR_REAL = 100;
const SEM_DESCONTO_PERCENTUAL = 0;

/**
 * Fronteira de saída: centavos inteiros → reais decimais.
 *
 * É o **único** ponto em que um valor monetário deixa de ser inteiro, e o
 * resultado nunca volta para dentro de um cálculo — ele só é serializado no
 * corpo da requisição. `valor / 100` sobre um inteiro seguro produz o `double`
 * mais próximo do decimal exato, que é o que `JSON.stringify` imprime de volta
 * como `12.34` (Constitution V).
 */
function reaisDeCentavos(valor: Centavos): number {
  return valor / CENTAVOS_POR_REAL;
}

/** Mesma fronteira de saída, para quantidade: milésimos inteiros → unidades. */
function unidadesDeMilesimos(quantidade: Milesimos): number {
  return quantidade / MILESIMOS_POR_UNIDADE;
}

/**
 * `'VALIDAR'` não é um valor de `SuspenderOuFaturar` no ERP: a validação prévia
 * envia o retrato **como a venda seria faturada**
 * (`specs/014-validacao-previa-nfce/contracts/erp-validacao-api.md`).
 *
 * É o que torna a invariante I5 daquela feature verificável de forma forte: o
 * retrato `'VALIDAR'` não só "difere apenas em `SuspenderOuFaturar`" do retrato
 * `'FATURAR'` — ele é idêntico a ele.
 */
function suspenderOuFaturar(operacao: OperacaoVenda): SuspenderOuFaturar {
  return operacao === 'SUSPENDER' ? 'SUSPENDER' : 'FATURAR';
}

/**
 * Linhas canceladas ficam **fora** do payload: elas permanecem no array do
 * carrinho por rastreabilidade (`CART-08`, invariante I1 da 003) e já estão no
 * `Log` de auditoria como `PRODUTO_CANCELADO` — enviá-las como item da NFCe
 * faturaria um produto que o operador removeu.
 */
function itensDoRetrato(linhas: readonly LinhaCarrinho[]): readonly ItemRetratoVenda[] {
  return linhasAtivas(linhas).map((linha, indice) => ({
    sequencial: indice + 1,
    codigoProduto: linha.snapshot.codigoProduto,
    quantidade: unidadesDeMilesimos(linha.quantidade),
    precoUnitario: reaisDeCentavos(linha.precoUnitario),
    // O contrato tem os dois campos, mas o percentual não reproduz o mesmo
    // centavo do desconto absoluto já calculado pelo carrinho — mandar os dois
    // deixaria o ERP escolher qual aplicar (`erp-pagamento-api.md`, §3).
    DescontoPercentual: SEM_DESCONTO_PERCENTUAL,
    DescontoValor: reaisDeCentavos(somar(linha.descontoConvenio, linha.descontoManual)),
    UDM: linha.snapshot.unidadeMedida,
    ValorBruto: reaisDeCentavos(totalBruto(linha)),
    ValorTotal: reaisDeCentavos(totalLinha(linha)),
  }));
}

export function montarRetratoVenda(
  snapshot: SnapshotVenda,
  operacao: OperacaoVenda,
  pagamentos: readonly FormaDePagamentoRetrato[],
): CheckoutFaturarNFCe {
  return {
    SuspenderOuFaturar: suspenderOuFaturar(operacao),
    NumeroNota: snapshot.identidade.numeroNota,
    CadSerieNFCe: snapshot.cadSerieNFCe,
    clienteCodigo: snapshot.clienteCodigo,
    vendedorCodigo: snapshot.vendedorCodigo,
    CondicaoPagamentoCodigo: snapshot.condicaoPagamentoCodigo,
    produtos: itensDoRetrato(snapshot.linhas),
    FormasDePagamento: pagamentos,
    // O log entra serializado e íntegro — sem filtrar, resumir nem reordenar
    // (`contracts/auditoria-events.md`). `FR-011`: vale para `FATURAR` **e**
    // `SUSPENDER`.
    Log: serializarLogAuditoria(snapshot.eventos),
  };
}

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

import {
  centavos,
  reaisDeCentavos,
  somar,
  ZERO_CENTAVOS,
  type Centavos,
} from '../precificacao/dinheiro';
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
  /**
   * Código da empresa — **primeiro campo que o ERP avalia**, e o único cuja
   * ausência recusa a venda antes de qualquer outra regra.
   *
   * Vai **no corpo**, não só no header. Ver o TSDoc de `SnapshotVenda.empresa`.
   */
  readonly Empresa: string;
  readonly SuspenderOuFaturar: SuspenderOuFaturar;
  /**
   * Rascunho de NFCe desta venda — `0` para venda ainda não gravada no ERP
   * (AD-235; era `NumeroNota` até o contrato de 2026-09-14). Vai igual em
   * `SUSPENDER`, `FATURAR` e `VALIDAR`.
   */
  readonly NumeroRascunho: number;
  readonly CadSerieNFCe: string;
  readonly clienteCodigo: number;
  readonly vendedorCodigo: number;
  /**
   * Operador logado que emitiu a nota — `SessaoUsuario.UsuarioCodigo`, nunca o
   * vendedor da venda. Ver o TSDoc de `SnapshotVenda.usuarioCodigo`.
   */
  readonly UsuarioCodigo: number;
  readonly CondicaoPagamentoCodigo: number;
  readonly produtos: readonly ItemRetratoVenda[];
  readonly FormasDePagamento: readonly FormaDePagamentoRetrato[];
  readonly Log: string;
  /**
   * Desconto de capa em reais, até 2 casas (017, AD-279) — só com a chave
   * `DESCONTO_CAPA_NO_ERP` ligada, e então **sempre** presente (zero sem capa).
   * Com a chave desligada a chave **não existe** no objeto, para o corpo ficar
   * byte a byte igual ao de antes da 017 (SC-007).
   */
  readonly DescontoCapaValor?: number;
}

/**
 * Tudo que o retrato precisa, já colhido dos slices pelo call site.
 */
export interface SnapshotVenda {
  /**
   * `codigoEmpresa` do bootstrap (feature 002), ecoado **dentro** do retrato.
   *
   * **O TSDoc anterior dizia o oposto e estava errado** — afirmava que o campo
   * não existia aqui porque "o BFF injeta esse campo em toda chamada
   * `/api/erp/*` (AD-019), o cliente nunca o monta". O BFF de fato injeta, mas
   * como **header**; `PCheckout_ValidarNFCe` e `PCheckout_FaturarNFCe` leem
   * `&Empresa` do **corpo** do SDT (`CheckoutFaturarNFCe.Empresa`, YAML). São
   * dois canais distintos, e o header não alimenta o segundo.
   *
   * Confirmado contra o ERP real em 2026-09-08 (AD-188): o retrato sem este
   * campo devolve `Valido: false` com "Empresa é obrigatório" — ou seja, **toda**
   * venda seria recusada. Com o campo no corpo, a mesma venda volta
   * `Valido: true`.
   */
  readonly empresa: string;
  /** Linhas do carrinho, **incluindo canceladas** (feature 003, invariante I1). */
  readonly linhas: readonly LinhaCarrinho[];
  /** Identidade da venda no ERP (feature 004, `data-model.md` §1). */
  readonly identidade: IdentidadeVenda;
  /**
   * `SessaoUsuario.CadSerieNFCe` — do bootstrap, nunca do operador (AD-034).
   *
   * É o **recuo**: a série da identidade da venda (documento importado ou
   * rascunho adotado) tem precedência, porque o documento já existe no ERP com
   * aquela série e a da sessão pode até vir vazia (AD-239).
   */
  readonly cadSerieNFCe: string;
  /** Cliente da venda; o default do PDV quando não houve identificação (AD-032). */
  readonly clienteCodigo: number;
  /** Vendedor **selecionado** para a venda, nunca o operador logado (`FR-010`). */
  readonly vendedorCodigo: number;
  /**
   * Operador logado — `SessaoUsuario.UsuarioCodigo` do bootstrap, sempre
   * (correção do usuário, 2026-09-11).
   *
   * É o **par** de `vendedorCodigo`, não um substituto: o vendedor é quem
   * atendeu e o operador é quem operou o caixa, e o ERP tem um campo para cada
   * um no mesmo SDT. O campo existia no contrato (`CheckoutFaturarNFCe`
   * .`UsuarioCodigo`) e nunca era preenchido — toda NFCe emitida pelo Checkout
   * saía sem identificar quem a emitiu.
   *
   * Vem do bootstrap e nunca da tela: o operador não escolhe quem ele é.
   *
   * **O valor montado aqui não é o que chega ao ERP.** O BFF reescreve
   * `UsuarioCodigo` com o operador cifrado no cookie de sessão — gravado em
   * `/session/start` a partir do `GetSessao` (AD-224) —, como já faz com
   * `Empresa`: o corpo sai do navegador e seria editável no DevTools, e o ERP
   * não confere o campo contra o token. A reescrita desce no envelope
   * `CheckoutFaturarNFCe`, que é como este retrato viaja
   * (`corpoComUsuarioDaSessao`, `erp-proxy.ts`). O cliente continua preenchendo
   * porque o retrato tem de ficar completo para a validação prévia (feature
   * 014) e para o log de auditoria; a autoridade, porém, é do servidor.
   */
  readonly usuarioCodigo: number;
  /** Condição de pagamento vigente — escalar, uma por venda (feature 008). */
  readonly condicaoPagamentoCodigo: number;
  /** Histórico acumulado da sessão de venda (feature 001). */
  readonly eventos: HistoricoAuditoriaVenda;
}

const SEM_DESCONTO_PERCENTUAL = 0;

/**
 * Como a capa entra no retrato (017, `research.md` D12, AD-279) — decidido por
 * `pagamentoSlice.montarPagamentosParaPayload()`, o único produtor, para o
 * retrato validado (014) e o emitido (004) receberem a mesma (I-D5).
 *
 * - `RATEADA` — chave `DESCONTO_CAPA_NO_ERP` desligada: a capa vai diluída no
 *   `DescontoValor` de cada item, pelo rateio de AD-098, como antes da 017.
 * - `NO_CABECALHO` — chave ligada: a capa vai inteira em `DescontoCapaValor` e
 *   o ERP rateia.
 *
 * União, e não dois parâmetros opcionais: com dois seria representável o
 * estado "os dois", em que o desconto contaria em dobro.
 */
export type DescontoCapaNoRetrato =
  | { readonly tipo: 'RATEADA'; readonly rateio: ReadonlyMap<string, Centavos> }
  | { readonly tipo: 'NO_CABECALHO'; readonly valor: Centavos };

const SEM_RATEIO: ReadonlyMap<string, Centavos> = new Map();
const CAPA_RATEADA_VAZIA: DescontoCapaNoRetrato = { tipo: 'RATEADA', rateio: SEM_RATEIO };

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
function itensDoRetrato(
  linhas: readonly LinhaCarrinho[],
  descontoCapa: DescontoCapaNoRetrato,
): readonly ItemRetratoVenda[] {
  const rateioDescontoCapa = descontoCapa.tipo === 'RATEADA' ? descontoCapa.rateio : SEM_RATEIO;
  return linhasAtivas(linhas).map((linha, indice) => {
    // Com a capa `RATEADA` (chave desligada) ela vai diluída por item, pelo
    // rateio de `FR-016`, e **soma** ao desconto que a linha já trazia
    // (convênio + manual) — os três são descontos distintos da mesma venda.
    // Com `NO_CABECALHO` (017) não há parcela aqui: o item leva só convênio +
    // manual e a capa vai em `DescontoCapaValor`.
    const descontoDaLinha = somar(linha.descontoConvenio, linha.descontoManual);
    const parcelaDeCapa = rateioDescontoCapa.get(linha.idLinha) ?? ZERO_CENTAVOS;
    const descontoTotal = somar(descontoDaLinha, parcelaDeCapa);

    return {
      sequencial: indice + 1,
      codigoProduto: linha.snapshot.codigoProduto,
      quantidade: unidadesDeMilesimos(linha.quantidade),
      precoUnitario: reaisDeCentavos(linha.precoUnitario),
      // O contrato tem os dois campos, mas o percentual não reproduz o mesmo
      // centavo do desconto absoluto já calculado pelo carrinho — mandar os dois
      // deixaria o ERP escolher qual aplicar (`erp-pagamento-api.md`, §3).
      DescontoPercentual: SEM_DESCONTO_PERCENTUAL,
      DescontoValor: reaisDeCentavos(descontoTotal),
      UDM: linha.snapshot.unidadeMedida,
      ValorBruto: reaisDeCentavos(totalBruto(linha)),
      // O clamp do rateio (AD-098) garante que a parcela nunca excede o total
      // líquido da linha, então `ValorTotal` não fica negativo — item negativo é
      // rejeitado pela SEFAZ. O piso aqui é defesa em profundidade, não a regra:
      // quem a garante é `ratearDescontoCapa`.
      ValorTotal: reaisDeCentavos(centavos(Math.max(0, totalLinha(linha) - parcelaDeCapa))),
    };
  });
}

/**
 * @param descontoCapa Como a capa entra no retrato, vindo de
 * `pagamentoSlice.montarPagamentosParaPayload()` (008/017). Omitido quando não
 * há desconto de capa — é o caso da maioria das vendas, e da feature 014 quando
 * ela valida uma venda antes de qualquer desconto.
 */
export function montarRetratoVenda(
  snapshot: SnapshotVenda,
  operacao: OperacaoVenda,
  pagamentos: readonly FormaDePagamentoRetrato[],
  descontoCapa: DescontoCapaNoRetrato = CAPA_RATEADA_VAZIA,
): CheckoutFaturarNFCe {
  const retrato: CheckoutFaturarNFCe = {
    Empresa: snapshot.empresa,
    SuspenderOuFaturar: suspenderOuFaturar(operacao),
    NumeroRascunho: snapshot.identidade.numeroRascunho,
    CadSerieNFCe:
      snapshot.identidade.serie.trim() === '' ? snapshot.cadSerieNFCe : snapshot.identidade.serie,
    clienteCodigo: snapshot.clienteCodigo,
    vendedorCodigo: snapshot.vendedorCodigo,
    UsuarioCodigo: snapshot.usuarioCodigo,
    CondicaoPagamentoCodigo: snapshot.condicaoPagamentoCodigo,
    produtos: itensDoRetrato(snapshot.linhas, descontoCapa),
    FormasDePagamento: pagamentos,
    // O log entra serializado e íntegro — sem filtrar, resumir nem reordenar
    // (`contracts/auditoria-events.md`). `FR-011`: vale para `FATURAR` **e**
    // `SUSPENDER`.
    Log: serializarLogAuditoria(snapshot.eventos),
  };
  // Acrescentado só no ramo do cabeçalho: na capa rateada a chave não pode nem
  // existir com valor zero (SC-007).
  return descontoCapa.tipo === 'NO_CABECALHO'
    ? { ...retrato, DescontoCapaValor: reaisDeCentavos(descontoCapa.valor) }
    : retrato;
}

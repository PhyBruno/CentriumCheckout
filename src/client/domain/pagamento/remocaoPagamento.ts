/**
 * O que o evento `FORMA_PAGAMENTO_REMOVIDA` leva ao ERP (feature 018,
 * FR-010 a FR-014).
 *
 * Função única para as três actions que excluem uma forma (`removerPagamento`,
 * `confirmarEstornoTef`, `descartarPagamento`): elas não podem divergir no
 * formato do `Log`, e o slice continua só orquestrando (Constitution II).
 *
 * Domínio puro: sem store, sem rede, sem React.
 */

import type {
  EventoFormaPagamentoRemovida,
  MotivoRemocaoPagamento,
} from '../auditoria/eventos';
import type { PagamentoAplicado } from './saldoPagamento';

/**
 * Motivo com que as janelas de TEF e PIX avisam que **o operador** encerrou a
 * cobrança. É um código, não uma frase, e mora aqui para o slice reconhecê-lo
 * sem importar uma feature: as duas janelas o reexportam com o nome antigo.
 */
export const MOTIVO_DESISTENCIA_DO_OPERADOR = 'FECHADO_PELO_OPERADOR';

/**
 * Os identificadores que o `Log` do ERP leva de uma forma, quando existem.
 *
 * Compartilhada por `detalhesDaRemocao` e pela recusa de uma cobrança, para os
 * dois eventos nomearem a mesma transação do mesmo jeito. Omite o que não há:
 * campo vazio afirmaria uma transação que não existe.
 */
export function identificadoresDaForma(
  pagamento: PagamentoAplicado,
): { readonly tefPagId?: string; readonly pixGuid?: string } {
  const tefPagId = pagamento.dadosTEF?.pagId ?? pagamento.tefPagId;
  return {
    ...(tefPagId !== null && { tefPagId }),
    ...(pagamento.pixGuid !== null && { pixGuid: pagamento.pixGuid }),
  };
}

/**
 * @param rotulo Descrição da forma, resolvida pelo chamador **antes** de qualquer
 * `set` que a zere (a condição some no "Limpar").
 *
 * `valor` é o que a forma valia na venda em centavos: `valorRecebido` no dinheiro
 * (o que entrou na gaveta, igual ao `FormaValor` do retrato), `valorAplicado` nas
 * demais. Os identificadores só aparecem quando existem: campo vazio no `Log`
 * afirmaria uma transação que não houve, mesmo cuidado de `formaParaRetrato`.
 */
export function detalhesDaRemocao(
  pagamento: PagamentoAplicado,
  rotulo: string,
  motivo: MotivoRemocaoPagamento,
): EventoFormaPagamentoRemovida['detalhes'] {
  return {
    formaPagamento: rotulo,
    valor: pagamento.valorRecebido ?? pagamento.valorAplicado,
    motivo,
    ...identificadoresDaForma(pagamento),
  };
}

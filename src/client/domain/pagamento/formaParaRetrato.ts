/**
 * Uma forma de pagamento aplicada → um item de `FormasDePagamento[]` do retrato
 * enviado ao ERP (`CheckoutFaturarNFCe.FormasDePagamento_FormasDePagamentoItem`,
 * YAML linha 1555).
 *
 * Extraído de `pagamentoSlice.montarPagamentosParaPayload` ao implementar a
 * feature 014, e não duplicado nela, por causa da invariante I5: o retrato que
 * o gate valida e o retrato que o faturamento emite precisam ser **byte a byte**
 * o mesmo objeto para os mesmos pagamentos. Duas versões deste mapeamento
 * divergiriam no primeiro campo novo de TEF/PIX, e a divergência apareceria
 * como "o ERP aprovou e depois recusou a mesma venda" — o modo de falha mais
 * grave da 014 (`specs/014-validacao-previa-nfce/data-model.md`, I5).
 *
 * Domínio puro (Constitution II): sem store, sem rede, sem React.
 */

import { reaisDeCentavos } from '../precificacao/dinheiro';
import type { FormaDePagamentoRetrato } from '../venda/montarRetratoVenda';
import type { PagamentoAplicado } from './saldoPagamento';

/**
 * @param pagamento Forma já aplicada (ou a candidata projetada como se fosse).
 *
 * Campos TEF/PIX só aparecem quando existem: o contrato os tem como opcionais e
 * mandá-los vazios faria o ERP registrar uma transação que não houve.
 */
export function formaParaRetrato(pagamento: PagamentoAplicado): FormaDePagamentoRetrato {
  const forma: Record<string, unknown> = {
    FormaCodigo: pagamento.formaCodigo,
    FormaMeioPagtoNFe: pagamento.meioPagtoNFe,
    // Fronteira de saída: o ERP recebe `double` em reais, não centavos.
    // `Σ FormaValor` é exatamente o total líquido — o troco não tem campo no
    // contrato e **nunca** aparece aqui (`research.md` D3 da 008).
    FormaValor: reaisDeCentavos(pagamento.valorAplicado),
    FormaIntegracaoCartao: pagamento.integracaoCartao,
    // `FpgUtiCar` é como o ERP identifica **crediário** ao somar `&TotalCrediario`
    // em `PCheckout_ValidarNFCe` (`erp-validacao-api.md`). Faltava no payload até
    // a feature 014: sem ele o total de crediário fica zero e todo o bloco de
    // limite de crédito é pulado — o gate aprovaria exatamente o caso que existe
    // para barrar. Mesmo modo de falha já documentado para `FormaEntrada`
    // (AD-111), e a mesma correção.
    FormaFpgUtiCar: pagamento.fpgUtiCar,
    // `FR-022`/AD-111: sem `FormaEntrada` o ERP calcula crediário zero.
    FormaEntrada: pagamento.entrada,
    // O campo é por-forma no contrato, não por-venda; string vazia quando não há
    // vale vinculado a esta forma.
    TicketDevolucao: pagamento.ticketDevolucao ?? '',
  };

  if (pagamento.dadosTEF !== null) {
    forma.TEFidentificacao = pagamento.dadosTEF.identificacao;
    forma.TEFCNPJ = pagamento.dadosTEF.cnpj;
    forma.TEFBandeira = pagamento.dadosTEF.bandeira;
    forma.TEFNumeroAutorizacao = pagamento.dadosTEF.numeroAutorizacao;
    forma.TEFTipoIntegracao = pagamento.dadosTEF.tipoIntegracao;
  }
  if (pagamento.pixGuid !== null) {
    forma.FormaPixGUID = pagamento.pixGuid;
  }

  return forma;
}

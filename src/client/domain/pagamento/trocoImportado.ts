/**
 * O troco de um documento retomado (feature 018, FR-020/FR-021).
 *
 * Desde a 018 a forma dinheiro vai ao ERP com o que o cliente **entregou**
 * (`formaParaRetrato`), então o documento pode voltar com `Σ FormaValor` acima
 * do total: o excedente é o troco. Importada como veio, essa forma viraria
 * "pagamento acima do total" com troco zero, e o operador mandaria o recebido
 * duas vezes no faturamento seguinte.
 *
 * Domínio puro (Constitution II); aritmética só em `Centavos` (Constitution V).
 */

import { somar, subtrair, ZERO_CENTAVOS, type Centavos } from '../precificacao/dinheiro';
import { MEIO_PAGTO } from './formaPagamento';
import type { PagamentoAplicado } from './saldoPagamento';

/**
 * Devolve o troco ao dinheiro que o recebeu: `valorRecebido` fica o que o
 * documento traz e `valorAplicado` o que sobra depois de tirar o excedente.
 *
 * Só age quando há como atribuir o excedente sem inventar dado (Constitution
 * IV): exatamente **uma** forma dinheiro, e que o cubra por inteiro. Sem
 * excedente, sem dinheiro, com dois dinheiros ou com excedente maior que o
 * dinheiro, a lista volta intacta — o documento é importado como está.
 *
 * @param totalLiquido Total da venda **antes** de qualquer pagamento: o
 * subtotal dos itens já importados. O desconto de capa do documento não é
 * importado, então num documento com capa o excedente pode ficar subestimado e
 * o troco não ser reconstruído (lacuna anterior, registrada na spec).
 *
 * @returns Lista nova; a de origem não é mutada.
 */
export function reconstruirTrocoImportado(
  pagamentos: readonly PagamentoAplicado[],
  totalLiquido: Centavos,
): PagamentoAplicado[] {
  const totalDoDocumento = pagamentos.reduce<Centavos>(
    (soma, pagamento) => somar(soma, pagamento.valorAplicado),
    ZERO_CENTAVOS,
  );
  const excedente = subtrair(totalDoDocumento, totalLiquido);
  const intacta = [...pagamentos];

  if (excedente <= 0) {
    return intacta;
  }

  const dinheiros = pagamentos.filter((pagamento) => pagamento.meioPagtoNFe === MEIO_PAGTO.Dinheiro);
  const [dinheiro] = dinheiros;
  if (dinheiros.length !== 1 || dinheiro === undefined || dinheiro.valorAplicado < excedente) {
    return intacta;
  }

  return pagamentos.map((pagamento) =>
    pagamento === dinheiro
      ? {
          ...pagamento,
          valorRecebido: pagamento.valorAplicado,
          valorAplicado: subtrair(pagamento.valorAplicado, excedente),
        }
      : pagamento,
  );
}

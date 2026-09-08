/**
 * Projeção "como a venda ficaria" (T003, `FR-002`, invariante I2).
 *
 * O gate não valida a venda atual: valida a venda **que existiria** se a
 * inserção fosse efetivada. Por isso a lista enviada ao ERP é sempre as formas
 * já aplicadas **mais** a candidata — validar só o que já está aplicado
 * aprovaria uma venda diferente da que o operador está montando, e o crediário
 * da forma nova nunca seria somado.
 *
 * Domínio puro (Constitution II) e **não mutante**: a lista de origem é lida,
 * nunca alterada — a inserção de verdade acontece depois, no `pagamentoSlice`, e
 * só se o veredito for favorável.
 */

import type { Centavos } from '../precificacao/dinheiro';
import type { MeioPagtoNFe } from '../pagamento/formaPagamento';
import { formaParaRetrato } from '../pagamento/formaParaRetrato';
import type { PagamentoAplicado } from '../pagamento/saldoPagamento';
import type { FormaDePagamentoRetrato } from '../venda/montarRetratoVenda';

/**
 * A forma que o operador está tentando inserir, no formato que o ERP a veria
 * (`contracts/validacao-domain-api.md` §1).
 *
 * `fpgUtiCar` e `entrada` são obrigatórios e não têm default: sem `entrada`
 * (`FpgEnt`) ou sem `fpgUtiCar` o ERP calcula crediário zero e aprova
 * exatamente o que a validação prévia existe para barrar (`FR-022`/AD-111).
 *
 * `integracaoCartao` e `ticketDevolucao` não são lidos pelo `ValidarNFCe`, mas
 * entram aqui pela invariante I5: o retrato validado e o retrato emitido
 * precisam ser o mesmo objeto para os mesmos pagamentos. Omiti-los faria a
 * candidata ser projetada com campos vazios que a forma real teria preenchidos.
 */
export interface FormaCandidata {
  readonly formaCodigo: number;
  readonly meioPagtoNFe: MeioPagtoNFe;
  readonly valor: Centavos;
  readonly fpgUtiCar: string;
  readonly entrada: string;
  readonly integracaoCartao: '1' | '2' | '';
  /** Código do ticket quando a forma é a de vale devolução; `null` caso contrário. */
  readonly ticketDevolucao: string | null;
}

/**
 * A candidata vista como um pagamento aplicado, para atravessar o **mesmo**
 * mapeamento de `formaParaRetrato` que as formas reais (I5).
 *
 * Os campos que só existem depois da aplicação recebem o valor que a forma teria
 * no instante em que entrasse: sem identificador (nada foi criado ainda), sem
 * dados de TEF/PIX (a integração só é acionada **após** o aceite, I9) e sem a
 * marca de documento (a candidata é gesto do operador, por definição).
 */
function candidataComoPagamento(candidata: FormaCandidata): PagamentoAplicado {
  return {
    idPagamento: '',
    formaCodigo: candidata.formaCodigo,
    meioPagtoNFe: candidata.meioPagtoNFe,
    integracaoCartao: candidata.integracaoCartao,
    entrada: candidata.entrada,
    fpgUtiCar: candidata.fpgUtiCar,
    valorAplicado: candidata.valor,
    valorRecebido: null,
    integracao: 'NENHUMA',
    status: 'APROVADO',
    dadosTEF: null,
    pixGuid: null,
    ticketDevolucao: candidata.ticketDevolucao,
    veioDeDocumento: false,
  };
}

/**
 * @param aplicados Pagamentos da venda no instante do gesto, na ordem em que
 * foram inseridos. Só os `APROVADO` entram — é a mesma regra do payload de
 * faturamento (`erp-pagamento-api.md` §3): pendente de integração e excluído
 * não são registrados, e incluí-los faria o gate validar um total que a venda
 * nunca teria.
 *
 * @returns Lista nova, na ordem `aplicados` seguida da candidata. `aplicados`
 * não é mutada.
 */
export function projetarPagamentos(
  aplicados: readonly PagamentoAplicado[],
  candidata: FormaCandidata,
): readonly FormaDePagamentoRetrato[] {
  const jaAplicados = aplicados
    .filter((pagamento) => pagamento.status === 'APROVADO')
    .map(formaParaRetrato);

  return [...jaAplicados, formaParaRetrato(candidataComoPagamento(candidata))];
}

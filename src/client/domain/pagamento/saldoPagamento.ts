/**
 * Estado de um pagamento aplicado e o saldo derivado da venda (T004).
 *
 * Domínio puro: aritmética exclusivamente em `Centavos` inteiros
 * (`src/client/domain/precificacao/dinheiro.ts`, Constitution V) — nenhum
 * `double` participa de saldo, troco ou valor aplicado.
 */

import { centavos, somar, subtrair, ZERO_CENTAVOS, type Centavos } from '../precificacao/dinheiro';
import type { FormaPagamento, MeioPagtoNFe } from './formaPagamento';
import type { IntegracaoPagamento } from './roteamentoIntegracao';

/** Máquina de estados de `PagamentoAplicado` — `data-model.md` §4. */
export type StatusPagamento = 'PENDENTE_INTEGRACAO' | 'APROVADO' | 'RECUSADO';

/** Preenchido pela feature 010; opaco para o domínio de pagamento geral. */
export interface DadosTEF {
  readonly identificacao: number;
  readonly cnpj: string;
  readonly bandeira: string;
  readonly numeroAutorizacao: string;
  readonly tipoIntegracao: string;
}

/**
 * Pagamento aplicado à venda. `meioPagtoNFe`/`integracaoCartao` são cópias
 * congeladas do catálogo no momento da aplicação — o pagamento nunca resolve
 * seus dados olhando o catálogo depois (`data-model.md` §2, "Regra de
 * fronteira").
 */
export interface PagamentoAplicado {
  readonly idPagamento: string;
  readonly formaCodigo: number;
  readonly meioPagtoNFe: MeioPagtoNFe;
  readonly integracaoCartao: '1' | '2' | '';
  /** Ecoado no payload (`FR-022`/AD-111). */
  readonly entrada: string;
  readonly valorAplicado: Centavos;
  readonly valorRecebido: Centavos | null;
  readonly integracao: IntegracaoPagamento;
  readonly status: StatusPagamento;
  readonly dadosTEF: DadosTEF | null;
  readonly pixGuid: string | null;
  readonly ticketDevolucao: string | null;
}

/** Derivado, nunca armazenado — seletor puro sobre carrinho + pagamentos. */
export interface SaldoPagamento {
  readonly totalLiquido: Centavos;
  readonly totalAplicado: Centavos;
  readonly saldoRestante: Centavos;
  readonly troco: Centavos;
}

export type ResultadoValidacao =
  | { readonly ok: true }
  | { readonly ok: false; readonly motivo: 'DINHEIRO_DUPLICADO' | 'SALDO_JA_COBERTO' };

/**
 * Algoritmo de `data-model.md` §6: `totalLiquido` é o subtotal do carrinho
 * menos o desconto de capa; `totalAplicado` soma **apenas** pagamentos
 * `APROVADO` (`PENDENTE_INTEGRACAO` não conta — `FR-004`/`FR-005`);
 * `saldoRestante` nunca fica negativo; `troco` só existe quando há um
 * pagamento em dinheiro aprovado, e é sempre `Σ recebido − Σ aplicado` **desse**
 * pagamento (no máximo um, por I2) — nenhuma outra forma gera troco (`FR-012`).
 */
export function calcularSaldo(
  subtotalCarrinho: Centavos,
  descontoCapa: Centavos,
  pagamentos: readonly PagamentoAplicado[],
): SaldoPagamento {
  const totalLiquido = subtrair(subtotalCarrinho, descontoCapa);
  const aprovados = pagamentos.filter((pagamento) => pagamento.status === 'APROVADO');
  const totalAplicado = aprovados.reduce<Centavos>(
    (acumulado, pagamento) => somar(acumulado, pagamento.valorAplicado),
    ZERO_CENTAVOS,
  );
  const saldoRestante = centavos(Math.max(0, totalLiquido - totalAplicado));

  const dinheiro = aprovados.find((pagamento) => pagamento.meioPagtoNFe === 'Dinheiro');
  const troco =
    dinheiro !== undefined && dinheiro.valorRecebido !== null
      ? centavos(Math.max(0, dinheiro.valorRecebido - dinheiro.valorAplicado))
      : ZERO_CENTAVOS;

  return { totalLiquido, totalAplicado, saldoRestante, troco };
}

/**
 * `FR-013`/AD-036 (I2): recusa uma segunda forma `Dinheiro`, considerando
 * apenas pagamentos que não estejam `RECUSADO` — um pagamento recusado já foi
 * retirado do fluxo e não deveria travar uma nova tentativa.
 *
 * O terceiro parâmetro `saldoRestante` é **opcional** por design: esta função
 * decide `DINHEIRO_DUPLICADO` sem depender do saldo, mas o motivo
 * `SALDO_JA_COBERTO` só existe quando o chamador já calculou o saldo (via
 * `calcularSaldo`). Passar o saldo é o que permite ao slice reaproveitar a
 * mesma checagem para os dois casos sem duplicar a regra; omiti-lo mantém a
 * função utilizável em qualquer teste que só queira a checagem de duplicidade.
 */
export function podeAplicarForma(
  forma: FormaPagamento,
  pagamentosAtuais: readonly PagamentoAplicado[],
  saldoRestante?: Centavos,
): ResultadoValidacao {
  const naoRecusados = pagamentosAtuais.filter((pagamento) => pagamento.status !== 'RECUSADO');

  if (
    forma.meioPagtoNFe === 'Dinheiro' &&
    naoRecusados.some((pagamento) => pagamento.meioPagtoNFe === 'Dinheiro')
  ) {
    return { ok: false, motivo: 'DINHEIRO_DUPLICADO' };
  }

  if (saldoRestante !== undefined && saldoRestante === ZERO_CENTAVOS) {
    return { ok: false, motivo: 'SALDO_JA_COBERTO' };
  }

  return { ok: true };
}

/**
 * Única forma de obter o par `valorAplicado`/`valorRecebido` — é o que torna
 * I3/I5 impossíveis de violar no call site (`data-model.md` §6).
 *
 * Para `Dinheiro`: `valorAplicado = min(valorInformado, saldoRestante)` e
 * `valorRecebido = valorInformado` — o excedente nunca entra em
 * `valorAplicado`, ele só aparece como troco em `calcularSaldo`. Para
 * qualquer outra forma: `valorRecebido = null` e `valorAplicado` é o valor
 * informado/autorizado, também limitado ao saldo restante (`FR-012`: nenhuma
 * outra forma gera troco).
 */
export function derivarValores(
  forma: FormaPagamento,
  valorInformado: Centavos,
  saldoRestante: Centavos,
): { readonly valorAplicado: Centavos; readonly valorRecebido: Centavos | null } {
  const valorAplicado = centavos(Math.min(valorInformado, saldoRestante));

  if (forma.meioPagtoNFe === 'Dinheiro') {
    return { valorAplicado, valorRecebido: valorInformado };
  }
  return { valorAplicado, valorRecebido: null };
}

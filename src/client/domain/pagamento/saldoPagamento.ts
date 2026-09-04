/**
 * Estado de um pagamento aplicado e o saldo derivado da venda (T004).
 *
 * Domínio puro: aritmética exclusivamente em `Centavos` inteiros
 * (`src/client/domain/precificacao/dinheiro.ts`, Constitution V) — nenhum
 * `double` participa de saldo, troco ou valor aplicado.
 */

import { centavos, somar, subtrair, ZERO_CENTAVOS, type Centavos } from '../precificacao/dinheiro';
import { geraTroco, type FormaPagamento, type MeioPagtoNFe } from './formaPagamento';
import { ehFormaDeValeDevolucao } from './valeDevolucao';
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
  | {
      readonly ok: false;
      readonly motivo: 'DINHEIRO_DUPLICADO' | 'SALDO_JA_COBERTO' | 'VALOR_ACIMA_DO_SALDO';
    };

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
  // Nunca negativo. I8 já garante `desconto <= subtotal` no momento em que o
  // desconto é aplicado, mas o subtotal cai depois — ao esvaziar o carrinho no
  // fim da venda, por exemplo — e um desconto sobrevivente produziria um "Total
  // a pagar" negativo em tela. Zero é a leitura correta: não há o que cobrar.
  const totalLiquido = centavos(Math.max(0, subtrair(subtotalCarrinho, descontoCapa)));
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
 * `VALOR_ACIMA_DO_SALDO` (`FR-024`): uma forma que **não gera troco** — tudo o
 * que não é `Dinheiro` — não pode receber mais do que o saldo em aberto. O
 * excedente não teria para onde ir: `FR-012` proíbe troco fora do dinheiro, de
 * modo que a única saída seria truncar o valor em silêncio e registrar no ERP
 * um `FormaValor` diferente do que o operador digitou — justamente o que se
 * pede que não aconteça. Trinta reais cobrados a mais no cartão não voltam pelo
 * caixa: quem estorna é a operadora. Recusar com aviso devolve a decisão a quem
 * pode tomá-la.
 *
 * Os dois últimos parâmetros são **opcionais** por design: esta função decide
 * `DINHEIRO_DUPLICADO` sem depender de nenhum deles. `SALDO_JA_COBERTO` exige o
 * saldo já calculado (via `calcularSaldo`) e `VALOR_ACIMA_DO_SALDO` exige
 * também o valor que o operador digitou. Passá-los é o que permite ao slice
 * reaproveitar a mesma checagem para os três casos sem duplicar regra; omiti-los
 * mantém a função utilizável em qualquer teste que só queira a duplicidade.
 */
export function podeAplicarForma(
  forma: FormaPagamento,
  pagamentosAtuais: readonly PagamentoAplicado[],
  saldoRestante?: Centavos,
  valorInformado?: Centavos,
): ResultadoValidacao {
  const naoRecusados = pagamentosAtuais.filter((pagamento) => pagamento.status !== 'RECUSADO');

  if (
    forma.meioPagtoNFe === 'Dinheiro' &&
    naoRecusados.some((pagamento) => pagamento.meioPagtoNFe === 'Dinheiro')
  ) {
    return { ok: false, motivo: 'DINHEIRO_DUPLICADO' };
  }

  if (saldoRestante === undefined) {
    return { ok: true };
  }

  if (saldoRestante === ZERO_CENTAVOS) {
    return { ok: false, motivo: 'SALDO_JA_COBERTO' };
  }

  // O vale devolução é a exceção: o valor não foi digitado, é o do ticket, e o
  // ERP baixa `DevValTot` inteiro na hora de faturar — recusar aqui deixaria o
  // operador sem nenhuma saída para um vale maior que a compra. Ele **pode**
  // entrar, com a diferença perdida, desde que o operador confirme isso
  // explicitamente; a confirmação é responsabilidade de `aplicarValeDevolucao`,
  // não desta função pura (`FR-024`/`FR-026`).
  if (
    valorInformado !== undefined &&
    !geraTroco(forma) &&
    !ehFormaDeValeDevolucao(forma) &&
    valorInformado > saldoRestante
  ) {
    return { ok: false, motivo: 'VALOR_ACIMA_DO_SALDO' };
  }

  return { ok: true };
}

/**
 * Única forma de obter o par `valorAplicado`/`valorRecebido` — é o que torna
 * I3/I5 impossíveis de violar no call site (`data-model.md` §6).
 *
 * Para `Dinheiro`: `valorAplicado = min(valorInformado, saldoRestante)` e
 * `valorRecebido = valorInformado` — o excedente nunca entra em
 * `valorAplicado`, ele só aparece como troco em `calcularSaldo`.
 *
 * Para qualquer outra forma: `valorRecebido = null` e `valorAplicado` continua
 * limitado ao saldo. Esse `min` deixou de ser o caminho normal desde `FR-024`:
 * um valor acima do saldo numa forma sem troco é **recusado** por
 * `podeAplicarForma` antes de chegar aqui, em vez de truncado em silêncio. Ele
 * permanece como rede de segurança — se um chamador futuro esquecer de passar
 * `valorInformado` à validação, o pior desfecho é um valor truncado, nunca um
 * `FormaValor` acima do total da nota.
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

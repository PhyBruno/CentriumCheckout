import { centavos, type Centavos } from '../../src/client/domain/precificacao/dinheiro';
import type {
  FormaPagamento,
  MeioPagtoNFe,
} from '../../src/client/domain/pagamento/formaPagamento';
import type { IntegracaoPagamento } from '../../src/client/domain/pagamento/roteamentoIntegracao';
import type {
  DadosTEF,
  PagamentoAplicado,
  StatusPagamento,
} from '../../src/client/domain/pagamento/saldoPagamento';

/**
 * Fixtures sintéticas do domínio de pagamento, compartilhadas pelos testes
 * unitários da feature 008. Todos os valores são inventados — nenhum dado de
 * produção. Mesmo espírito de `tests/support/precificacao.ts` (feature 003).
 */

export interface OpcoesForma {
  readonly codigo?: number;
  readonly descricao?: string;
  readonly entrada?: string;
  readonly meioPagtoNFe?: MeioPagtoNFe;
  readonly integracaoCartao?: '1' | '2' | '';
  readonly tipoTransacaoTEF?: string;
  readonly fpgUtiCar?: string;
}

export function formaDe(opcoes: OpcoesForma = {}): FormaPagamento {
  return {
    codigo: opcoes.codigo ?? 1,
    descricao: opcoes.descricao ?? 'FORMA EXEMPLO',
    entrada: opcoes.entrada ?? '',
    meioPagtoNFe: opcoes.meioPagtoNFe ?? 'Dinheiro',
    integracaoCartao: opcoes.integracaoCartao ?? '',
    tipoTransacaoTEF: opcoes.tipoTransacaoTEF ?? '',
    fpgUtiCar: opcoes.fpgUtiCar ?? '',
  };
}

export interface OpcoesPagamento {
  readonly idPagamento?: string;
  readonly formaCodigo?: number;
  readonly meioPagtoNFe?: MeioPagtoNFe;
  readonly integracaoCartao?: '1' | '2' | '';
  readonly entrada?: string;
  readonly valorAplicado?: number;
  readonly valorRecebido?: number | null;
  readonly integracao?: IntegracaoPagamento;
  readonly status?: StatusPagamento;
  readonly dadosTEF?: DadosTEF | null;
  readonly pixGuid?: string | null;
  readonly ticketDevolucao?: string | null;
}

let sequenciaPagamento = 0;

export function pagamentoDe(opcoes: OpcoesPagamento = {}): PagamentoAplicado {
  sequenciaPagamento += 1;

  return {
    idPagamento: opcoes.idPagamento ?? `pagamento-${String(sequenciaPagamento)}`,
    formaCodigo: opcoes.formaCodigo ?? 1,
    meioPagtoNFe: opcoes.meioPagtoNFe ?? 'Dinheiro',
    integracaoCartao: opcoes.integracaoCartao ?? '',
    entrada: opcoes.entrada ?? '',
    valorAplicado: centavos(opcoes.valorAplicado ?? 0),
    valorRecebido: opcoes.valorRecebido == null ? null : centavos(opcoes.valorRecebido),
    integracao: opcoes.integracao ?? 'NENHUMA',
    status: opcoes.status ?? 'APROVADO',
    dadosTEF: opcoes.dadosTEF ?? null,
    pixGuid: opcoes.pixGuid ?? null,
    ticketDevolucao: opcoes.ticketDevolucao ?? null,
  };
}

export function emCentavos(valor: number): Centavos {
  return centavos(valor);
}

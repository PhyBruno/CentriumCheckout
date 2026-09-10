import { centavos, type Centavos } from '../../src/client/domain/precificacao/dinheiro';
import {
  MEIO_PAGTO,
  type CondicaoPagamento,
  type FormaPagamento,
  type MeioPagtoNFe,
} from '../../src/client/domain/pagamento/formaPagamento';
import type { IntegracaoPagamento } from '../../src/client/domain/pagamento/roteamentoIntegracao';
import type {
  DadosTEF,
  PagamentoAplicado,
  StatusPagamento,
} from '../../src/client/domain/pagamento/saldoPagamento';
import type { ValidacaoDeps } from '../../src/client/stores/slices/validacaoVendaSlice';

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
    meioPagtoNFe: opcoes.meioPagtoNFe ?? MEIO_PAGTO.Dinheiro,
    integracaoCartao: opcoes.integracaoCartao ?? '',
    tipoTransacaoTEF: opcoes.tipoTransacaoTEF ?? '',
    fpgUtiCar: opcoes.fpgUtiCar ?? '',
  };
}

/**
 * Condição do catálogo (`SessaoUsuario.CondicoesDePagamento[]`).
 *
 * Mora aqui desde AD-171 porque deixou de ser fixture só do slice: as suítes de
 * importação de DAV e de recuperação de NFCe precisam de uma condição para
 * resolver o `CondicaoPagamentoCodigo` do documento contra o catálogo.
 */
export function condicaoDe(
  codigo: number,
  descricao: string,
  formas: readonly FormaPagamento[] = [formaDe()],
): CondicaoPagamento {
  return {
    codigo,
    descricao,
    prazo: 0,
    minimoEntrada: centavos(0),
    desconto: 0,
    descontoMaximo: 0,
    formas,
  };
}

/**
 * Corpo **cru** de `GET /api/bootstrap` recortado no que
 * `bootstrapPagamentoSchema` exige — só `SessaoUsuario.CondicoesDePagamento`.
 *
 * Existe para as suítes que exercitam a importação de documento pela UI real
 * (AD-171): o hook resolve a condição do documento por `queryClient.query`, que
 * bate nesta rota. Sem ela a retomada abortaria com "condição indisponível", e
 * o teste acusaria a rede em vez do comportamento.
 *
 * A condição é a de código `1`, que é o `CondicaoPagamentoCodigo` das fixtures
 * de documento (`tests/support/dav.ts`), com `FormaEntrada: 'S'` na forma `1`
 * para o efeito do catálogo sobre a forma importada ser observável.
 */
export function bootstrapPagamentoDe(): Record<string, unknown> {
  return {
    tenant: 'acme',
    codigoEmpresa: '1',
    SessaoUsuario: {
      CondicoesDePagamento: [
        {
          CondicaoCodigo: 1,
          CondicaoDescricao: 'A VISTA',
          CondicaoPrazo: 0,
          CondicaoMinimoEntrada: 0,
          CondicaoDesconto: 0,
          CondicaoDescontoMaximo: 0,
          CondicaoFormasDePagamento: [
            {
              FormaCodigo: 1,
              FormaDescricao: 'DINHEIRO',
              FormaEntrada: 'S',
              FormaMeioPagtoNFe: MEIO_PAGTO.Dinheiro,
              FormaIntegracaoCartao: '',
              FormaTipoTransacaoTEF: '',
              FormaFpgUtiCar: '',
            },
          ],
        },
      ],
    },
  };
}

export interface OpcoesPagamento {
  readonly idPagamento?: string;
  readonly formaCodigo?: number;
  readonly meioPagtoNFe?: MeioPagtoNFe;
  readonly integracaoCartao?: '1' | '2' | '';
  readonly entrada?: string;
  /** `FpgUtiCar` — como o ERP reconhece crediário no gate da 014. Default `''`. */
  readonly fpgUtiCar?: string;
  readonly valorAplicado?: number;
  readonly valorRecebido?: number | null;
  readonly integracao?: IntegracaoPagamento;
  readonly status?: StatusPagamento;
  readonly dadosTEF?: DadosTEF | null;
  readonly pixGuid?: string | null;
  readonly ticketDevolucao?: string | null;
  /** Forma vinda de um documento importado/retomado — default `false`. */
  readonly veioDeDocumento?: boolean;
}

let sequenciaPagamento = 0;

export function pagamentoDe(opcoes: OpcoesPagamento = {}): PagamentoAplicado {
  sequenciaPagamento += 1;

  return {
    idPagamento: opcoes.idPagamento ?? `pagamento-${String(sequenciaPagamento)}`,
    formaCodigo: opcoes.formaCodigo ?? 1,
    meioPagtoNFe: opcoes.meioPagtoNFe ?? MEIO_PAGTO.Dinheiro,
    integracaoCartao: opcoes.integracaoCartao ?? '',
    entrada: opcoes.entrada ?? '',
    fpgUtiCar: opcoes.fpgUtiCar ?? '',
    valorAplicado: centavos(opcoes.valorAplicado ?? 0),
    valorRecebido: opcoes.valorRecebido == null ? null : centavos(opcoes.valorRecebido),
    integracao: opcoes.integracao ?? 'NENHUMA',
    status: opcoes.status ?? 'APROVADO',
    dadosTEF: opcoes.dadosTEF ?? null,
    pixGuid: opcoes.pixGuid ?? null,
    ticketDevolucao: opcoes.ticketDevolucao ?? null,
    veioDeDocumento: opcoes.veioDeDocumento ?? false,
  };
}

export function emCentavos(valor: number): Centavos {
  return centavos(valor);
}

/**
 * Gate da feature 014 desligado, para suítes que compõem o `vendaStore` e não
 * exercitam a validação prévia.
 *
 * `validar` devolve `ACEITA` sem consultar nada: essas suítes injetam o seu
 * próprio duplo em `PagamentoDeps.validarInsercao` e nunca chegam a este slice —
 * o que elas precisam é apenas que o store combinado esteja **completo**.
 * Lançar aqui derrubaria uma suíte inteira por causa de um caminho que ela não
 * pretende testar; devolver recusa esconderia o desfecho que ela pretende.
 */
export const validacaoDepsInertes: ValidacaoDeps = {
  snapshotVenda: () => {
    throw new Error('snapshotVenda não é exercitado nesta suíte');
  },
  pagamentosAplicados: () => [],
  rateioDescontoCapa: () => new Map(),
  validar: () => Promise.resolve({ resultado: 'ACEITA', avisos: [] }),
  registrarEvento: () => undefined,
  notificar: () => undefined,
};

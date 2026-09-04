import { describe, expect, it } from 'vitest';
import {
  paraCapacidadesPagamento,
  paraCondicoesPagamento,
} from '../../../../src/client/services/pagamento/pagamentoMapper';
import {
  condicoesDePagamentoSchema,
  sessaoPagamentoSchema,
} from '../../../../src/shared/schemas/pagamento.schema';

/** T008 — tradução do payload validado para os tipos de domínio de pagamento. */

function formaValida(sobrescritas: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    FormaCodigo: 1,
    FormaDescricao: 'DINHEIRO',
    FormaEntrada: 'S',
    FormaMeioPagtoNFe: 'Dinheiro',
    FormaIntegracaoCartao: '',
    FormaTipoTransacaoTEF: '',
    FormaFpgUtiCar: '',
    ...sobrescritas,
  };
}

function condicaoValida(sobrescritas: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    CondicaoCodigo: 1,
    CondicaoDescricao: 'A VISTA',
    CondicaoPrazo: 0,
    CondicaoMinimoEntrada: 0,
    CondicaoDesconto: 0,
    CondicaoDescontoMaximo: 0,
    CondicaoFormasDePagamento: [formaValida()],
    ...sobrescritas,
  };
}

describe('paraCondicoesPagamento', () => {
  it('exclui condição que ficou sem forma alguma', () => {
    const validadas = condicoesDePagamentoSchema.parse([
      condicaoValida({ CondicaoCodigo: 1, CondicaoFormasDePagamento: [] }),
      condicaoValida({ CondicaoCodigo: 2 }),
    ]);

    const resultado = paraCondicoesPagamento(validadas);

    expect(resultado).toHaveLength(1);
    expect(resultado[0]?.codigo).toBe(2);
  });

  it('mantém FormaEntrada íntegro ao chegar no domínio (FR-022/AD-111)', () => {
    const validadas = condicoesDePagamentoSchema.parse([
      condicaoValida({
        CondicaoFormasDePagamento: [
          formaValida({ FormaCodigo: 2, FormaMeioPagtoNFe: 'CartaoCredito', FormaEntrada: 'N' }),
        ],
      }),
    ]);

    const [condicao] = paraCondicoesPagamento(validadas);

    expect(condicao?.formas[0]?.entrada).toBe('N');
  });

  it('traduz os demais campos da condição e da forma sem reinterpretar', () => {
    const validadas = condicoesDePagamentoSchema.parse([
      condicaoValida({
        CondicaoCodigo: 7,
        CondicaoDescricao: 'CREDIÁRIO 30/60/90',
        CondicaoPrazo: 30,
        CondicaoMinimoEntrada: 10,
        CondicaoDesconto: 5,
        CondicaoDescontoMaximo: 15,
      }),
    ]);

    const [condicao] = paraCondicoesPagamento(validadas);

    expect(condicao).toMatchObject({
      codigo: 7,
      descricao: 'CREDIÁRIO 30/60/90',
      prazo: 30,
      minimoEntrada: 1000,
      desconto: 5,
      descontoMaximo: 15,
    });
    expect(condicao?.formas[0]).toMatchObject({
      codigo: 1,
      descricao: 'DINHEIRO',
      meioPagtoNFe: 'Dinheiro',
      integracaoCartao: '',
      tipoTransacaoTEF: '',
      fpgUtiCar: '',
    });
  });
});

describe('paraCapacidadesPagamento', () => {
  it('traduz TEFAtivo e UtilizaCentriumPAG para tefAtivo/pixAtivo', () => {
    const sessao = sessaoPagamentoSchema.parse({
      CondicoesDePagamento: [condicaoValida()],
      ConfiguracoesTEF: { TEFAtivo: true },
      ConfiguracoesPIX: { UtilizaCentriumPAG: false },
    });

    expect(paraCapacidadesPagamento(sessao)).toEqual({ tefAtivo: true, pixAtivo: false });
  });

  it('devolve as duas capacidades false quando os blocos estão ausentes', () => {
    const sessao = sessaoPagamentoSchema.parse({
      CondicoesDePagamento: [condicaoValida()],
    });

    expect(paraCapacidadesPagamento(sessao)).toEqual({ tefAtivo: false, pixAtivo: false });
  });
});

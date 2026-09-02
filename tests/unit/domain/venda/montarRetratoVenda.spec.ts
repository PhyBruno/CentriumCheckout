import { describe, expect, it } from 'vitest';
import type { EventoAuditoria } from '../../../../src/client/domain/auditoria/eventos';
import {
  montarRetratoVenda,
  type SnapshotVenda,
} from '../../../../src/client/domain/venda/montarRetratoVenda';
import type { IdentidadeVenda } from '../../../../src/client/stores/slices/identidadeVendaSlice';
import { linhaDe, snapshotDe } from '../../../support/precificacao';

/**
 * Retrato da venda (T009, `quickstart.md` Camada 1).
 *
 * Cobre `FR-001` a `FR-003`, `FR-010`, `FR-011` e `FR-015` — e a invariante I5
 * da feature 014 (retrato `VALIDAR` vs. `FATURAR`).
 *
 * Todos os valores são sintéticos.
 */

const TIMESTAMP_SINTETICO = '2026-08-26T17:32:07.123Z';

function eventosDe(): EventoAuditoria[] {
  return [
    { tipo: 'VENDA_INICIADA', timestamp: TIMESTAMP_SINTETICO, detalhes: { origem: 'NOVA' } },
    { tipo: 'VENDA_FINALIZADA', timestamp: TIMESTAMP_SINTETICO, detalhes: {} },
  ];
}

function snapshotVendaDe(sobrescritas: Partial<SnapshotVenda> = {}): SnapshotVenda {
  return {
    linhas: [linhaDe({ quantidadeEmUnidades: 3, precoUnitario: 1000 })],
    identidade: { origem: 'NOVA', numeroNota: 0 },
    cadSerieNFCe: '1',
    clienteCodigo: 1,
    vendedorCodigo: 42,
    condicaoPagamentoCodigo: 1,
    eventos: eventosDe(),
    ...sobrescritas,
  };
}

describe('montarRetratoVenda — identidade da venda (FR-003)', () => {
  it('envia NumeroNota = 0 para venda criada do zero', () => {
    const retrato = montarRetratoVenda(snapshotVendaDe(), 'FATURAR', []);

    expect(retrato.NumeroNota).toBe(0);
  });

  it.each<IdentidadeVenda>([
    { origem: 'RASCUNHO', numeroNota: 4821 },
    { origem: 'DAV', numeroNota: 4790 },
  ])('envia o NumeroNota do documento de origem ($origem)', (identidade) => {
    const retrato = montarRetratoVenda(snapshotVendaDe({ identidade }), 'FATURAR', []);

    expect(retrato.NumeroNota).toBe(identidade.numeroNota);
  });
});

describe('montarRetratoVenda — campos obrigatórios (FR-010, AD-034)', () => {
  it('carrega sempre CadSerieNFCe e vendedorCodigo', () => {
    const retrato = montarRetratoVenda(snapshotVendaDe(), 'FATURAR', []);

    expect(retrato.CadSerieNFCe).toBe('1');
    expect(retrato.vendedorCodigo).toBe(42);
    expect(retrato.clienteCodigo).toBe(1);
    expect(retrato.CondicaoPagamentoCodigo).toBe(1);
  });

  it('repassa as formas de pagamento sem interpretar', () => {
    const formas = [{ FormaCodigo: 1, FormaMeioPagtoNFe: 'Dinheiro', FormaValor: 30.0 }];

    const retrato = montarRetratoVenda(snapshotVendaDe(), 'FATURAR', formas);

    expect(retrato.FormasDePagamento).toEqual(formas);
  });
});

describe('montarRetratoVenda — Log de auditoria (FR-011)', () => {
  it('serializa o array corrente, round-trip parseável', () => {
    const eventos = eventosDe();

    const retrato = montarRetratoVenda(snapshotVendaDe({ eventos }), 'FATURAR', []);

    expect(JSON.parse(retrato.Log)).toEqual(eventos);
  });

  it('inclui o Log também em SUSPENDER', () => {
    const retrato = montarRetratoVenda(snapshotVendaDe(), 'SUSPENDER', []);

    expect(retrato.SuspenderOuFaturar).toBe('SUSPENDER');
    expect(JSON.parse(retrato.Log)).toHaveLength(2);
  });
});

describe('montarRetratoVenda — itens (produtos[])', () => {
  it('converte centavos e milésimos para os decimais do contrato do ERP', () => {
    const retrato = montarRetratoVenda(
      snapshotVendaDe({
        linhas: [
          linhaDe({
            quantidadeEmUnidades: 3,
            precoUnitario: 1000,
            descontoManual: 250,
            snapshot: snapshotDe({ codigoProduto: '001234' }),
          }),
        ],
      }),
      'FATURAR',
      [],
    );

    expect(retrato.produtos).toEqual([
      {
        sequencial: 1,
        codigoProduto: '001234',
        quantidade: 3,
        precoUnitario: 10.0,
        DescontoPercentual: 0,
        DescontoValor: 2.5,
        UDM: 'UN',
        ValorBruto: 30.0,
        ValorTotal: 27.5,
      },
    ]);
  });

  it('deixa a linha cancelada fora do payload e renumera o sequencial', () => {
    const retrato = montarRetratoVenda(
      snapshotVendaDe({
        linhas: [
          linhaDe({ idLinha: 'a', cancelada: true }),
          linhaDe({ idLinha: 'b', snapshot: snapshotDe({ codigoProduto: '009999' }) }),
        ],
      }),
      'FATURAR',
      [],
    );

    expect(retrato.produtos).toHaveLength(1);
    expect(retrato.produtos[0]?.codigoProduto).toBe('009999');
    expect(retrato.produtos[0]?.sequencial).toBe(1);
  });

  it('não produz fração de centavo com quantidade fracionária (Constitution V)', () => {
    const retrato = montarRetratoVenda(
      snapshotVendaDe({
        linhas: [linhaDe({ quantidadeEmUnidades: 0.333, precoUnitario: 1000 })],
      }),
      'FATURAR',
      [],
    );

    // 0,333 × R$ 10,00 = R$ 3,33 (arredondado a centavo inteiro no domínio).
    expect(retrato.produtos[0]?.quantidade).toBe(0.333);
    expect(retrato.produtos[0]?.ValorTotal).toBe(3.33);
  });
});

describe('montarRetratoVenda — retrato VALIDAR (I5 da feature 014, FR-015)', () => {
  it('produz para VALIDAR exatamente o retrato de FATURAR', () => {
    const snapshot = snapshotVendaDe();
    const formas = [{ FormaCodigo: 2, FormaValor: 70.0 }];

    const paraValidar = montarRetratoVenda(snapshot, 'VALIDAR', formas);
    const paraFaturar = montarRetratoVenda(snapshot, 'FATURAR', formas);

    // I5 pede "idêntico exceto `SuspenderOuFaturar`"; o contrato do ERP
    // (`erp-validacao-api.md`) manda enviar o valor que a venda teria ao ser
    // faturada, então a garantia real é mais forte: são iguais em tudo.
    expect(paraValidar).toEqual(paraFaturar);
    expect(paraValidar.SuspenderOuFaturar).toBe('FATURAR');
  });

  it('difere de SUSPENDER apenas em SuspenderOuFaturar', () => {
    const snapshot = snapshotVendaDe();

    const paraSuspender = montarRetratoVenda(snapshot, 'SUSPENDER', []);
    const paraFaturar = montarRetratoVenda(snapshot, 'FATURAR', []);

    expect({ ...paraSuspender, SuspenderOuFaturar: 'FATURAR' }).toEqual(paraFaturar);
  });
});

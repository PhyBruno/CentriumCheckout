import { describe, expect, it } from 'vitest';
import {
  formaDisponivel,
  resolverIntegracao,
} from '../../../../src/client/domain/pagamento/roteamentoIntegracao';
import { formaDe } from '../../../support/pagamento';

describe('resolverIntegracao — tabela de decisão (research.md D5)', () => {
  it('CartaoCredito com TEF ativo roteia para TEF', () => {
    expect(
      resolverIntegracao(formaDe({ meioPagtoNFe: 'CartaoCredito' }), {
        tefAtivo: true,
        pixAtivo: false,
      }),
    ).toBe('TEF');
  });

  it('CartaoDebito sem TEF ativo não roteia', () => {
    expect(
      resolverIntegracao(formaDe({ meioPagtoNFe: 'CartaoDebito' }), {
        tefAtivo: false,
        pixAtivo: false,
      }),
    ).toBe('NENHUMA');
  });

  it('Pix com PIX ativo roteia para PIX_DINAMICO', () => {
    expect(
      resolverIntegracao(formaDe({ meioPagtoNFe: 'Pix' }), {
        tefAtivo: false,
        pixAtivo: true,
      }),
    ).toBe('PIX_DINAMICO');
  });

  it('PixEstatico nunca integra, mesmo com PIX ativo (FR-006)', () => {
    expect(
      resolverIntegracao(formaDe({ meioPagtoNFe: 'PixEstatico' }), {
        tefAtivo: true,
        pixAtivo: true,
      }),
    ).toBe('NENHUMA');
  });

  it('Dinheiro nunca integra', () => {
    expect(
      resolverIntegracao(formaDe({ meioPagtoNFe: 'Dinheiro' }), {
        tefAtivo: true,
        pixAtivo: true,
      }),
    ).toBe('NENHUMA');
  });
});

describe('formaDisponivel — FR-002/FR-003', () => {
  it('Pix com PIX inativo fica indisponível — não há caminho manual', () => {
    expect(
      formaDisponivel(formaDe({ meioPagtoNFe: 'Pix' }), { tefAtivo: true, pixAtivo: false }),
    ).toBe(false);
  });

  it('cartão continua disponível sem TEF ativo — vira pagamento manual', () => {
    expect(
      formaDisponivel(formaDe({ meioPagtoNFe: 'CartaoCredito' }), {
        tefAtivo: false,
        pixAtivo: false,
      }),
    ).toBe(true);
  });

  it('PixEstatico está sempre disponível', () => {
    expect(
      formaDisponivel(formaDe({ meioPagtoNFe: 'PixEstatico' }), {
        tefAtivo: false,
        pixAtivo: false,
      }),
    ).toBe(true);
  });
});

describe('AD-144 (2026-09-03) — o veredito não depende de layout', () => {
  it('resolverIntegracao só aceita forma + capacidades, sem parâmetro de plataforma', () => {
    // Mudar isso silenciosamente reintroduziria o campo de layout que
    // AD-144 removeu do contrato.
    expect(resolverIntegracao.length).toBe(2);
  });

  it('cartão com TEF ativo roteia para TEF independente do layout, mobile incluído', () => {
    // `CapacidadesPagamento` não tem campo de plataforma — este objeto é
    // exatamente o shape do contrato, e o resultado não muda conforme onde a
    // tela roda (a exclusão de TEF no mobile de AD-074 foi revogada).
    const capacidadesSemPlataforma = { tefAtivo: true, pixAtivo: false };
    expect(
      resolverIntegracao(formaDe({ meioPagtoNFe: 'CartaoCredito' }), capacidadesSemPlataforma),
    ).toBe('TEF');
  });
});

import { describe, expect, it } from 'vitest';
import {
  interpretarStatusSistema,
  rotularStatusOperacao,
} from '../../../../src/client/domain/sessao/statusOperacaoNFCe';

/**
 * Tradução do inteiro devolvido por `GetStatusSistema` no que o operador vê na
 * barra superior (`FR-013`, AD-088).
 */

describe('interpretarStatusSistema', () => {
  it('trata 0 como emissão online', () => {
    expect(interpretarStatusSistema(0)).toBe('ONLINE');
  });

  it.each([1, 2, 7])('trata %i como contingência', (valor) => {
    expect(interpretarStatusSistema(valor)).toBe('CONTINGENCIA');
  });

  it('não afirma nada antes da primeira leitura', () => {
    // O ponto cinza de "Verificando…" é deliberado: dizer "Online" sem ter
    // perguntado ao ERP seria afirmar o que o Checkout ainda não sabe.
    expect(interpretarStatusSistema(null)).toBe('DESCONHECIDO');
  });
});

describe('rotularStatusOperacao', () => {
  it('usa o rótulo do desenho para o caminho feliz', () => {
    expect(rotularStatusOperacao('ONLINE')).toBe('Online');
  });

  it('nomeia a contingência pelo nome', () => {
    expect(rotularStatusOperacao('CONTINGENCIA')).toBe('Contingência');
  });

  it('avisa que ainda está verificando', () => {
    expect(rotularStatusOperacao('DESCONHECIDO')).toBe('Verificando…');
  });
});

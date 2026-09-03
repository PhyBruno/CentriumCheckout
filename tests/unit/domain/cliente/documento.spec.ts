import { describe, expect, it } from 'vitest';
import {
  apenasDigitos,
  classificarDocumento,
  formatarDocumento,
  validarFormatoCEP,
  validarFormatoCPF,
} from '../../../../src/client/domain/cliente/documento';

/**
 * Classificação e máscara de documento (T007, `quickstart.md` Camada 1) —
 * `CLI-04`, `FR-010`, `FR-012`.
 */

describe('classificarDocumento', () => {
  it('classifica 11 dígitos como CPF e 14 como CNPJ', () => {
    expect(classificarDocumento('11122233344')).toBe('CPF');
    expect(classificarDocumento('52059715000113')).toBe('CNPJ');
  });

  it('classifica qualquer outro comprimento como INVALIDO', () => {
    expect(classificarDocumento('')).toBe('INVALIDO');
    expect(classificarDocumento('1112223334')).toBe('INVALIDO');
    expect(classificarDocumento('111222333445')).toBe('INVALIDO');
    expect(classificarDocumento('520597150001139')).toBe('INVALIDO');
    expect(classificarDocumento('bruno')).toBe('INVALIDO');
  });

  it('ignora a pontuação da máscara ao contar os dígitos', () => {
    expect(classificarDocumento('123.456.789-00')).toBe('CPF');
    expect(classificarDocumento('52.059.715/0001-13')).toBe('CNPJ');
    expect(classificarDocumento(' 111 222 333 44 ')).toBe('CPF');
  });

  it('não valida dígito verificador — formato só (`research.md` D6)', () => {
    // Sequência com DV inválido para o CPF real: mesmo assim é "formato de CPF",
    // porque quem valida o documento de verdade é o ERP (Constitution III).
    expect(classificarDocumento('11111111111')).toBe('CPF');
  });
});

describe('validarFormatoCPF', () => {
  it('aceita 11 dígitos, com ou sem máscara', () => {
    expect(validarFormatoCPF('11122233344')).toBe(true);
    expect(validarFormatoCPF('111.222.333-44')).toBe(true);
  });

  it('rejeita menos ou mais que 11 dígitos', () => {
    expect(validarFormatoCPF('1112223334')).toBe(false);
    expect(validarFormatoCPF('111222333445')).toBe(false);
    expect(validarFormatoCPF('')).toBe(false);
  });
});

describe('validarFormatoCEP', () => {
  it('aceita 12345-678 e 12345678', () => {
    expect(validarFormatoCEP('12345-678')).toBe(true);
    expect(validarFormatoCEP('12345678')).toBe(true);
  });

  it('rejeita menos ou mais que 8 dígitos', () => {
    expect(validarFormatoCEP('1234567')).toBe(false);
    expect(validarFormatoCEP('123456789')).toBe(false);
    expect(validarFormatoCEP('')).toBe(false);
  });
});

describe('apenasDigitos', () => {
  it('descarta pontuação, barra e espaço', () => {
    expect(apenasDigitos('52.059.715/0001-13')).toBe('52059715000113');
  });
});

describe('formatarDocumento', () => {
  it('aplica a máscara de CPF e de CNPJ', () => {
    expect(formatarDocumento('11122233344')).toBe('111.222.333-44');
    expect(formatarDocumento('52059715000113')).toBe('52.059.715/0001-13');
  });

  it('é idempotente sobre um documento já mascarado', () => {
    expect(formatarDocumento('111.222.333-44')).toBe('111.222.333-44');
    expect(formatarDocumento('52.059.715/0001-13')).toBe('52.059.715/0001-13');
  });

  it('devolve o texto inalterado quando não é CPF nem CNPJ', () => {
    // O campo nunca "corrige" em silêncio o que não sabe interpretar.
    expect(formatarDocumento('1234')).toBe('1234');
    expect(formatarDocumento('bruno')).toBe('bruno');
    expect(formatarDocumento('')).toBe('');
  });
});

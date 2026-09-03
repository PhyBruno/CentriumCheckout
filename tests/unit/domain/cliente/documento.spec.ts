import { describe, expect, it } from 'vitest';
import {
  apenasDigitos,
  classificarDocumento,
  classificarEntradaCliente,
  documentoEhPessoaJuridica,
  formatarCEP,
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

describe('classificarEntradaCliente', () => {
  it('trata até 6 dígitos como código do cliente', () => {
    expect(classificarEntradaCliente('1')).toEqual({ tipo: 'CODIGO', codigo: 1 });
    expect(classificarEntradaCliente('2538')).toEqual({ tipo: 'CODIGO', codigo: 2538 });
    expect(classificarEntradaCliente('999999')).toEqual({ tipo: 'CODIGO', codigo: 999999 });
  });

  it('trata de 7 a 11 dígitos como CPF, devolvendo só os dígitos', () => {
    expect(classificarEntradaCliente('1234567')).toEqual({ tipo: 'CPF', documento: '1234567' });
    expect(classificarEntradaCliente('12298023980')).toEqual({
      tipo: 'CPF',
      documento: '12298023980',
    });
  });

  it('descarta pontos e traços antes de contar e de enviar ao ERP', () => {
    // O operador digita a máscara; o ERP recebe o número limpo.
    expect(classificarEntradaCliente('122.980.239-80')).toEqual({
      tipo: 'CPF',
      documento: '12298023980',
    });
    // Com pontuação, `2.538` continua sendo código — a máscara não muda a faixa.
    expect(classificarEntradaCliente('2.538')).toEqual({ tipo: 'CODIGO', codigo: 2538 });
  });

  it('recusa 14 dígitos — CNPJ não entra na venda (Ajuste SINIEF 11/2025)', () => {
    // Sem `documento`: nada é enviado ao ERP, porque a venda não pode acontecer
    // no Checkout nem que o cadastro exista.
    expect(classificarEntradaCliente('52059715000113')).toEqual({ tipo: 'PESSOA_JURIDICA' });
    expect(classificarEntradaCliente('52.059.715/0001-13')).toEqual({ tipo: 'PESSOA_JURIDICA' });
  });

  it('recusa 12, 13 e mais de 14 dígitos do mesmo jeito que o CNPJ inteiro', () => {
    // Corte único acima de 11 dígitos: um CNPJ pela metade só levaria o
    // operador a completar o número e receber a mesma recusa.
    expect(classificarEntradaCliente('123456789012')).toEqual({ tipo: 'PESSOA_JURIDICA' });
    expect(classificarEntradaCliente('1234567890123')).toEqual({ tipo: 'PESSOA_JURIDICA' });
    expect(classificarEntradaCliente('520597150001139')).toEqual({ tipo: 'PESSOA_JURIDICA' });
  });

  it('trata entrada sem dígito nenhum como inválida', () => {
    expect(classificarEntradaCliente('')).toEqual({ tipo: 'INVALIDO' });
    expect(classificarEntradaCliente('   ')).toEqual({ tipo: 'INVALIDO' });
    expect(classificarEntradaCliente('bruno')).toEqual({ tipo: 'INVALIDO' });
  });
});

describe('documentoEhPessoaJuridica', () => {
  it('reconhece o CNPJ completo, com ou sem máscara', () => {
    expect(documentoEhPessoaJuridica('52059715000113')).toBe(true);
    expect(documentoEhPessoaJuridica('52.059.715/0001-13')).toBe(true);
  });

  it('não reconhece CPF, documento vazio nem telefone com DDI', () => {
    // O modal busca por telefone: `5547999998888` tem 13 dígitos e é termo
    // legítimo — por isso o predicado exige os 14 exatos.
    expect(documentoEhPessoaJuridica('11122233344')).toBe(false);
    expect(documentoEhPessoaJuridica('')).toBe(false);
    expect(documentoEhPessoaJuridica('5547999998888')).toBe(false);
  });
});

describe('formatarCEP', () => {
  it('aplica a máscara sobre 8 dígitos, com ou sem traço digitado', () => {
    expect(formatarCEP('89000000')).toBe('89000-000');
    expect(formatarCEP('89000-000')).toBe('89000-000');
  });

  it('devolve o texto inalterado quando não há 8 dígitos', () => {
    expect(formatarCEP('890')).toBe('890');
    expect(formatarCEP('890000000')).toBe('890000000');
    expect(formatarCEP('')).toBe('');
  });
});

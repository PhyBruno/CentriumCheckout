import { describe, expect, it } from 'vitest';
import {
  classificarDocumentoOrigem,
  formatarNumeroDocumentoOrigem,
} from '../../../../src/client/domain/dav/documentoOrigem';

/** Coluna "Documento de Origem" da janela de DAV (AD-258). */
describe('classificarDocumentoOrigem', () => {
  it('reconhece os três tipos que o ERP devolve em Titulo', () => {
    expect(classificarDocumentoOrigem('PEDIDO')).toEqual({ tipo: 'PEDIDO', rotulo: 'Pedido' });
    expect(classificarDocumentoOrigem('ORCAMENTO')).toEqual({
      tipo: 'ORCAMENTO',
      rotulo: 'Orçamento',
    });
    expect(classificarDocumentoOrigem('ORDEM SERVICO')).toEqual({
      tipo: 'ORDEM_SERVICO',
      rotulo: 'O.S',
    });
  });

  it('tolera acento, caixa e espaços', () => {
    expect(classificarDocumentoOrigem(' Orçamento ').tipo).toBe('ORCAMENTO');
    expect(classificarDocumentoOrigem('ordem  de serviço').tipo).toBe('ORDEM_SERVICO');
    expect(classificarDocumentoOrigem('O.S').tipo).toBe('ORDEM_SERVICO');
  });

  it('tipo desconhecido fica OUTRO, com o texto do ERP como rótulo', () => {
    expect(classificarDocumentoOrigem('CONSIGNACAO')).toEqual({
      tipo: 'OUTRO',
      rotulo: 'CONSIGNACAO',
    });
  });
});

describe('formatarNumeroDocumentoOrigem', () => {
  it('junta número e série com barra', () => {
    expect(formatarNumeroDocumentoOrigem('1287', '99')).toBe('1287/99');
  });

  it('sem série mostra só o número, sem barra pendurada', () => {
    expect(formatarNumeroDocumentoOrigem('1605', '')).toBe('1605');
    expect(formatarNumeroDocumentoOrigem('1605', undefined)).toBe('1605');
  });

  it('sem número (vazio, zero ou ausente) não mostra nada', () => {
    expect(formatarNumeroDocumentoOrigem('', '99')).toBeNull();
    expect(formatarNumeroDocumentoOrigem('0', '99')).toBeNull();
    expect(formatarNumeroDocumentoOrigem(undefined, undefined)).toBeNull();
  });
});

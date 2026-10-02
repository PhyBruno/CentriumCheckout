import { describe, expect, it } from 'vitest';
import type { ClienteVenda } from '../../../../src/client/domain/cliente/clienteVenda';
import { montarPagadorTef } from '../../../../src/client/domain/tef/pagadorTef';

/** T005 — dados do pagador de `CriarCardPagamento` (`research.md` D9). Valores sintéticos. */

function clienteDe(sobrescritas: Partial<ClienteVenda> = {}): ClienteVenda {
  return {
    codigoCliente: 2538,
    nome: 'MARIA EXEMPLO',
    documento: '123.456.789-09',
    celular: null,
    listaPreco: 1,
    descontoConvenio: 0,
    codigoConvenio: null,
    origem: 'BUSCA_DOCUMENTO',
    ...sobrescritas,
  };
}

describe('montarPagadorTef', () => {
  it('cliente identificado com CPF formatado → só os dígitos e o nome', () => {
    expect(montarPagadorTef(clienteDe())).toEqual({ cpf: '12345678909', nome: 'MARIA EXEMPLO' });
  });

  it('CNPJ → só os dígitos (o domínio CPF do ERP é VARCHAR(14))', () => {
    expect(montarPagadorTef(clienteDe({ documento: '12.345.678/0001-95' }))?.cpf).toBe(
      '12345678000195',
    );
  });

  it('cliente default (documento null) → CPF vazio e o nome do default', () => {
    expect(
      montarPagadorTef(
        clienteDe({ codigoCliente: 999999, nome: 'CONSUMIDOR FINAL', documento: null, origem: 'DEFAULT' }),
      ),
    ).toEqual({ cpf: '', nome: 'CONSUMIDOR FINAL' });
  });

  it('venda sem cliente → null (o chamador recusa sem rede)', () => {
    expect(montarPagadorTef(null)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { montarDadosPagador } from '../../../../src/client/domain/pix/montarDadosPagador';
import type { ClienteVenda } from '../../../../src/client/domain/cliente/clienteVenda';

/**
 * T010 — `research.md` D7/AD-100: cliente identificado × cliente default ×
 * ausência de cliente.
 *
 * Todos os valores são sintéticos.
 */

function clienteVendaDe(sobrescritas: Partial<ClienteVenda> = {}): ClienteVenda {
  return {
    codigoCliente: 2538,
    nome: 'MARIA EXEMPLO',
    documento: '11122233344',
    celular: '55 47 90000-0000',
    listaPreco: 5,
    descontoConvenio: 10,
    codigoConvenio: 7,
    origem: 'BUSCA_DOCUMENTO',
    ...sobrescritas,
  };
}

describe('montarDadosPagador', () => {
  it('usa nome e documento do cliente identificado', () => {
    expect(montarDadosPagador(clienteVendaDe())).toEqual({
      nome: 'MARIA EXEMPLO',
      documento: '11122233344',
      email: '',
      telefone: '',
    });
  });

  // `GetSessao` não devolve CPF/CNPJ do cliente default, então `documento` é
  // `null` — e o ERP precisa receber string vazia, nunca `null` bruto no JSON.
  it('envia documento vazio para o cliente default', () => {
    const pagador = montarDadosPagador(
      clienteVendaDe({
        codigoCliente: 1,
        nome: 'CONSUMIDOR FINAL',
        documento: null,
        celular: null,
        descontoConvenio: 0,
        codigoConvenio: null,
        origem: 'DEFAULT',
      }),
    );

    expect(pagador).toEqual({
      nome: 'CONSUMIDOR FINAL',
      documento: '',
      email: '',
      telefone: '',
    });
    expect(pagador.documento).not.toBeNull();
  });

  it('devolve todos os campos vazios sem lançar quando não há cliente', () => {
    expect(() => montarDadosPagador(null)).not.toThrow();
    expect(montarDadosPagador(null)).toEqual({
      nome: '',
      documento: '',
      email: '',
      telefone: '',
    });
  });

  // Gap de escopo declarado (`research.md` D7): `ClienteVenda` não retém e-mail,
  // e `celular` **não** é promovido a `TrnPagadorFone` — os dois campos do ERP
  // ficam vazios até a feature 005 passar a reter esses dados.
  it('não promove o celular do cadastro a telefone do pagador', () => {
    expect(montarDadosPagador(clienteVendaDe({ celular: '55 47 91234-5678' })).telefone).toBe('');
  });
});

import { describe, expect, it } from 'vitest';
import { ufParaConsultaDeProduto } from '../../../../src/client/domain/cliente/clienteVenda';

/** `UFCliente` de `GetProduto` (AD-258). */
describe('ufParaConsultaDeProduto', () => {
  it('usa a UF do cliente da venda', () => {
    expect(ufParaConsultaDeProduto({ uf: 'PR' }, 'SC')).toBe('PR');
  });

  it('sem cliente na venda, usa a UF do cliente default', () => {
    expect(ufParaConsultaDeProduto(null, 'SC')).toBe('SC');
  });

  it('cliente sem UF conhecida vai vazio — nunca a UF do default no lugar', () => {
    expect(ufParaConsultaDeProduto({ uf: null }, 'SC')).toBe('');
  });

  it('normaliza caixa e espaços, e sem nada vai vazio', () => {
    expect(ufParaConsultaDeProduto({ uf: ' sc ' }, undefined)).toBe('SC');
    expect(ufParaConsultaDeProduto(null, undefined)).toBe('');
  });
});

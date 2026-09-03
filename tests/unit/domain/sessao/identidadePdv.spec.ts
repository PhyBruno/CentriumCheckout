import { describe, expect, it } from 'vitest';
import {
  descreverSessaoAtiva,
  nomeDoOperador,
  tituloDoProduto,
} from '../../../../src/client/domain/sessao/identidadePdv';

/**
 * Rótulos da barra superior (nós `HSvSJ`/`YNhuO` do Pencil). Todos os valores
 * aqui são sintéticos.
 */

describe('tituloDoProduto', () => {
  it('usa o nome fantasia da empresa', () => {
    expect(tituloDoProduto({ EmpresaNomeFantasia: 'Organizações Tabajara' })).toBe(
      'Centrium Checkout - Organizações Tabajara',
    );
  });

  it('cai na razão social quando não há nome fantasia', () => {
    expect(
      tituloDoProduto({ EmpresaNomeFantasia: '  ', EmpresaRazaoSocial: 'Tabajara Com. Ltda' }),
    ).toBe('Centrium Checkout - Tabajara Com. Ltda');
  });

  it('mostra só o nome do produto quando o ERP não manda empresa nenhuma', () => {
    expect(tituloDoProduto({})).toBe('Centrium Checkout');
  });
});

describe('descreverSessaoAtiva', () => {
  it('junta caixa e PDV como no desenho', () => {
    expect(descreverSessaoAtiva({ caixa: 3, CadMaqCod: '01' })).toBe('Caixa 03 • PDV 01');
  });

  it('não repete o prefixo quando o próprio CadMaqCod já traz "PDV"', () => {
    expect(descreverSessaoAtiva({ caixa: 12, CadMaqCod: 'PDV01' })).toBe('Caixa 12 • PDV 01');
  });

  it('mostra só o PDV quando não há caixa configurado', () => {
    expect(descreverSessaoAtiva({ caixa: 0, CadMaqCod: 'PDV07' })).toBe('PDV 07');
  });

  it('mostra só o caixa quando não há código de máquina', () => {
    expect(descreverSessaoAtiva({ caixa: 3, CadMaqCod: '' })).toBe('Caixa 03');
  });

  it('devolve null quando não há nada a dizer', () => {
    expect(descreverSessaoAtiva({})).toBeNull();
  });
});

describe('nomeDoOperador', () => {
  it('devolve o nome do usuário da sessão', () => {
    expect(nomeDoOperador({ UsuarioNome: 'Bruno' })).toBe('Bruno');
  });

  it('devolve null quando o campo vem vazio', () => {
    expect(nomeDoOperador({ UsuarioNome: '   ' })).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import {
  descreverSessaoAtiva,
  nomeDaLoja,
  nomeDoOperador,
  tituloDoProduto,
} from '../../../../src/client/domain/sessao/identidadePdv';

/**
 * Rótulos da barra superior (nós `HSvSJ`/`YNhuO` do Pencil). Todos os valores
 * aqui são sintéticos.
 */

describe('nomeDaLoja', () => {
  // Feature 015 (T004, research D1). É o rótulo da tela **virada ao cliente**,
  // e por isso não pode ser `tituloDoProduto`: o cliente não tem nada a ver com
  // o nome do software de PDV, e a empresa sem cadastro viraria a loja chamada
  // "Centrium Checkout".
  it('usa o nome fantasia da empresa', () => {
    expect(nomeDaLoja({ EmpresaNomeFantasia: 'Mercado Aurora' })).toBe('Mercado Aurora');
  });

  it('cai na razão social quando não há nome fantasia', () => {
    expect(
      nomeDaLoja({ EmpresaNomeFantasia: '  ', EmpresaRazaoSocial: 'Aurora Com. de Alim. Ltda' }),
    ).toBe('Aurora Com. de Alim. Ltda');
  });

  it('o nome fantasia vence a razão social quando os dois vêm preenchidos', () => {
    expect(
      nomeDaLoja({
        EmpresaNomeFantasia: 'Mercado Aurora',
        EmpresaRazaoSocial: 'Aurora Com. de Alim. Ltda',
      }),
    ).toBe('Mercado Aurora');
  });

  it('devolve null quando os dois vêm vazios — a tela de repouso mostra só a saudação', () => {
    expect(nomeDaLoja({ EmpresaNomeFantasia: '   ', EmpresaRazaoSocial: '' })).toBeNull();
  });

  it('devolve null quando o ERP não manda empresa nenhuma', () => {
    expect(nomeDaLoja({})).toBeNull();
  });

  it('nunca devolve o nome do produto — é o erro que research D1 corrige', () => {
    expect(nomeDaLoja({ EmpresaNomeFantasia: 'Mercado Aurora' })).not.toContain(
      'Centrium Checkout',
    );
  });
});

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

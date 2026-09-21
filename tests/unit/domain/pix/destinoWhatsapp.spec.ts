import { describe, expect, it } from 'vitest';
import {
  normalizarTelefoneWhatsapp,
  preencherDestinoWhatsapp,
} from '../../../../src/client/domain/pix/destinoWhatsapp';
import type { ClienteVenda } from '../../../../src/client/domain/cliente/clienteVenda';

const CLIENTE_BASE: ClienteVenda = {
  codigoCliente: 37,
  nome: 'FULANO DE TAL',
  documento: '00000000000',
  celular: '(11) 98765-4321',
  listaPreco: 1,
  descontoConvenio: 0,
  codigoConvenio: null,
  origem: 'BUSCA_DOCUMENTO',
};

describe('normalizarTelefoneWhatsapp', () => {
  it('tira a máscara e prefixa o DDI 55 num número nacional', () => {
    expect(normalizarTelefoneWhatsapp('(11) 98765-4321')).toBe('5511987654321');
  });

  it('aceita número fixo de oito dígitos', () => {
    expect(normalizarTelefoneWhatsapp('11 3456-7890')).toBe('551134567890');
  });

  it('não duplica o DDI de um número que já veio internacional', () => {
    expect(normalizarTelefoneWhatsapp('+55 11 98765-4321')).toBe('5511987654321');
  });

  it('trata o DDD 55 como DDD, não como DDI', () => {
    // `(55) 99999-9999` é Santa Maria/RS: onze dígitos, número nacional
    // completo. Lê-lo como "já tem DDI" produziria um destino inexistente.
    expect(normalizarTelefoneWhatsapp('(55) 99999-9999')).toBe('5555999999999');
  });

  it('recusa número curto demais, em vez de completar o que falta', () => {
    expect(normalizarTelefoneWhatsapp('98765-4321')).toBeNull();
    expect(normalizarTelefoneWhatsapp('')).toBeNull();
  });

  it('recusa número longo demais', () => {
    expect(normalizarTelefoneWhatsapp('5511987654321000')).toBeNull();
  });
});

describe('preencherDestinoWhatsapp', () => {
  it('cliente identificado chega preenchido e com o nome opcional', () => {
    expect(preencherDestinoWhatsapp(CLIENTE_BASE)).toEqual({
      nome: 'FULANO DE TAL',
      telefone: '(11) 98765-4321',
      nomeObrigatorio: false,
    });
  });

  it('cliente default entra vazio e exige o nome', () => {
    const padrao: ClienteVenda = {
      ...CLIENTE_BASE,
      codigoCliente: 999999,
      nome: 'CONSUMIDOR',
      documento: null,
      celular: null,
      origem: 'DEFAULT',
    };

    expect(preencherDestinoWhatsapp(padrao)).toEqual({
      nome: '',
      telefone: '',
      nomeObrigatorio: true,
    });
  });

  it('cliente identificado sem celular deixa o número vazio sem tornar o nome obrigatório', () => {
    expect(preencherDestinoWhatsapp({ ...CLIENTE_BASE, celular: null })).toEqual({
      nome: 'FULANO DE TAL',
      telefone: '',
      nomeObrigatorio: false,
    });
  });

  it('venda sem cliente nenhum segue a regra do default', () => {
    expect(preencherDestinoWhatsapp(null)).toEqual({
      nome: '',
      telefone: '',
      nomeObrigatorio: true,
    });
  });
});

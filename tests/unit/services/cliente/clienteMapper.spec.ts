import { describe, expect, it } from 'vitest';
import {
  mapClienteCheckoutParaVenda,
  mapClienteDefaultParaVenda,
} from '../../../../src/client/services/cliente/clienteMapper';
import type { SessaoUsuario } from '../../../../src/shared/schemas/bootstrap.schema';
import { clienteCheckoutDe } from '../../../support/cliente';
import { registroBootstrapDe } from '../../../support/sessao';

/**
 * `ClienteCheckout`/`SessaoUsuario` → `ClienteVenda` (T008, `quickstart.md`
 * Camada 1) — `FR-004`, `FR-005`, AD-108, `research.md` D3/D10.
 */

function sessaoDe(sobrescritas: Record<string, unknown> = {}): SessaoUsuario {
  return registroBootstrapDe(sobrescritas).SessaoUsuario;
}

describe('mapClienteCheckoutParaVenda', () => {
  it('preserva listaPreco, descontoConvenio e codigoConvenio reais do cadastro', () => {
    const cliente = mapClienteCheckoutParaVenda(
      clienteCheckoutDe({ CodCliente: 1255, nome: 'FULANO', cpf: '12298023980' }),
      'BUSCA_DOCUMENTO',
    );

    expect(cliente).toEqual({
      codigoCliente: 1255,
      nome: 'FULANO',
      documento: '12298023980',
      celular: '55 47 90000-0000',
      listaPreco: 5,
      descontoConvenio: 10,
      codigoConvenio: 7,
      origem: 'BUSCA_DOCUMENTO',
    });
  });

  it('mantém a origem BUSCA_LIVRE quando o candidato veio da lista', () => {
    const cliente = mapClienteCheckoutParaVenda(clienteCheckoutDe(), 'BUSCA_LIVRE');
    expect(cliente.origem).toBe('BUSCA_LIVRE');
    expect(cliente.descontoConvenio).toBe(10);
  });

  it('aceita a origem DAV sem tratá-la como caso especial (AD-115)', () => {
    const cliente = mapClienteCheckoutParaVenda(clienteCheckoutDe(), 'DAV');
    expect(cliente.origem).toBe('DAV');
    expect(cliente.listaPreco).toBe(5);
  });

  it('deixa listaPreco/desconto/convênio em null no cadastro simplificado (D10)', () => {
    // O cliente recém-criado não tem lista nem convênio configurados: `0` do
    // `GetCliente` seguinte não pode virar "sem desconto" para a feature 003.
    const cliente = mapClienteCheckoutParaVenda(
      clienteCheckoutDe({
        CodCliente: 9001,
        DescontoConvenio: 0,
        ListaPreco: 0,
        CodigoConvenio: 0,
      }),
      'CADASTRO_SIMPLIFICADO',
    );

    expect(cliente.listaPreco).toBeNull();
    expect(cliente.descontoConvenio).toBeNull();
    expect(cliente.codigoConvenio).toBeNull();
    expect(cliente.documento).toBe('11122233344');
  });
});

describe('mapClienteDefaultParaVenda', () => {
  it('monta o snapshot do default só com o bootstrap, sem GetCliente (AD-108)', () => {
    const cliente = mapClienteDefaultParaVenda(
      sessaoDe({ ClienteDefaultCodigo: 42, ClienteDefaultNome: 'Fulano', ListaPrecoDefault: 3 }),
    );

    expect(cliente).toEqual({
      codigoCliente: 42,
      nome: 'Fulano',
      documento: null,
      celular: null,
      listaPreco: 3,
      descontoConvenio: 0,
      codigoConvenio: null,
      origem: 'DEFAULT',
    });
  });

  it('devolve null quando a empresa não configurou cliente default (FR-005)', () => {
    expect(mapClienteDefaultParaVenda(sessaoDe({ ClienteDefaultCodigo: 0 }))).toBeNull();
  });

  it('não inventa nome quando o cadastro do default não tem um', () => {
    const cliente = mapClienteDefaultParaVenda(
      sessaoDe({ ClienteDefaultCodigo: 42, ClienteDefaultNome: undefined }),
    );
    expect(cliente?.nome).toBe('');
  });
});

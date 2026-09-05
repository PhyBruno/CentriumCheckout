import { describe, expect, it } from 'vitest';
import {
  checkoutListaClientesSchema,
  clienteCheckoutSchema,
  getClienteOutputSchema,
  getListaClientesOutputSchema,
  postClienteOutputSchema,
  primeiroErroDeNegocio,
} from '../../../src/shared/schemas/cliente.schema';
import { clienteCheckoutDe, clienteDaListaDe } from '../../support/cliente';

/**
 * Validação de fronteira dos endpoints de cliente (Constitution IV).
 *
 * Todos os payloads são sintéticos.
 */

describe('clienteCheckoutSchema', () => {
  it('aceita o payload do contrato e preserva convênio e lista de preço', () => {
    const validado = clienteCheckoutSchema.safeParse(clienteCheckoutDe());

    expect(validado.success).toBe(true);
    expect(validado.data?.DescontoConvenio).toBe(10);
    expect(validado.data?.ListaPreco).toBe(5);
  });

  it('aceita a ausência dos campos de crédito, que o Checkout nunca consome', () => {
    // `LimiteCredito`/`PermiteVendaCredito` são opcionais de propósito (AD-026):
    // a ausência não pode ser erro de fronteira.
    const semCredito: Record<string, unknown> = { ...clienteCheckoutDe() };
    delete semCredito['LimiteCredito'];
    delete semCredito['PermiteVendaCredito'];
    expect(clienteCheckoutSchema.safeParse(semCredito).success).toBe(true);
  });

  it('recusa DescontoConvenio ausente — o percentual decide preço', () => {
    const semConvenio: Record<string, unknown> = { ...clienteCheckoutDe() };
    delete semConvenio['DescontoConvenio'];
    expect(clienteCheckoutSchema.safeParse(semConvenio).success).toBe(false);
  });

  /**
   * Shape **real** do `GetCliente` (AD-165), verificado ao vivo em 2026-09-04:
   * `int64` e `double` chegam como string JSON (`"CodCliente": "2538"`,
   * `"LimiteCredito": "0.00"`). Antes desta correção toda identificação de
   * cliente contra o ERP real virava `ErroRespostaInvalida`.
   */
  it('aceita CodCliente e LimiteCredito como string, como o ERP real devolve (AD-165)', () => {
    const validado = clienteCheckoutSchema.parse(
      clienteCheckoutDe({ CodCliente: '2538' as never, LimiteCredito: '0.00' as never }),
    );

    expect(validado.CodCliente).toBe(2538);
    expect(validado.LimiteCredito).toBe(0);
  });

  it('recusa CodCliente em formato inesperado', () => {
    expect(
      clienteCheckoutSchema.safeParse(clienteCheckoutDe({ CodCliente: 'dois mil' as never }))
        .success,
    ).toBe(false);
  });

  it('preserva campos extras do ERP sem reinterpretar (looseObject)', () => {
    const validado = clienteCheckoutSchema.safeParse({
      ...clienteCheckoutDe(),
      CampoNovoDoErp: 'valor',
    });
    expect(validado.data?.['CampoNovoDoErp']).toBe('valor');
  });
});

describe('checkoutListaClientesSchema', () => {
  it('aceita a lista com o endereço aninhado', () => {
    const validado = checkoutListaClientesSchema.safeParse({
      PaginaAtual: 1,
      RegistrosPorPagina: 20,
      TotalRegistros: 1,
      TotalPaginas: 1,
      Clientes: [clienteDaListaDe()],
    });

    expect(validado.success).toBe(true);
    expect(validado.data?.Clientes[0]?.Endereco.cidade).toBe('SINOP');
  });

  it('aceita candidato com CPF vazio — cliente cadastrado sem documento', () => {
    // O contrato não exige documento; é por isso que a seleção resolve pelo
    // `ClienteCodigo`, não pelo CPF.
    const validado = checkoutListaClientesSchema.safeParse({
      PaginaAtual: 1,
      RegistrosPorPagina: 20,
      TotalRegistros: 1,
      TotalPaginas: 1,
      Clientes: [clienteDaListaDe({ CPF: '' })],
    });

    expect(validado.success).toBe(true);
    expect(validado.data?.Clientes[0]?.CPF).toBe('');
  });
});

/**
 * AD-165 — o ERP real devolve `GetCliente`/`GetListaClientes` **sem** o envelope
 * nomeado que o `ApiCentriumOAuth.yaml` desenha. Os dois formatos precisam
 * passar: o real (raiz) e o do YAML, que é o que o `erp-mock` das suítes E2E
 * produz. Em ambos, o resultado do parse é o conteúdo interno.
 */
describe('envelope opcional de GetCliente e GetListaClientes (AD-165)', () => {
  function listaSintetica(): Record<string, unknown> {
    return {
      PaginaAtual: 1,
      RegistrosPorPagina: 20,
      TotalRegistros: 1,
      TotalPaginas: 1,
      Clientes: [clienteDaListaDe()],
    };
  }

  it('aceita GetCliente na raiz, como o ERP real devolve', () => {
    const validado = getClienteOutputSchema.parse(clienteCheckoutDe());

    expect(validado.CodCliente).toBe(2538);
  });

  it('aceita GetCliente dentro do envelope Cliente, como o YAML e o erp-mock', () => {
    const validado = getClienteOutputSchema.parse({
      Cliente: clienteCheckoutDe(),
      messages: [],
    });

    expect(validado.CodCliente).toBe(2538);
  });

  it('aceita GetListaClientes na raiz, como o ERP real devolve', () => {
    const validado = getListaClientesOutputSchema.parse(listaSintetica());

    expect(validado.Clientes).toHaveLength(1);
  });

  it('aceita GetListaClientes dentro do envelope ListaClientes', () => {
    const validado = getListaClientesOutputSchema.parse({
      ListaClientes: listaSintetica(),
      messages: [],
    });

    expect(validado.TotalRegistros).toBe(1);
  });

  it('aceita ClienteCodigo como string na lista, como o ERP real devolve', () => {
    const lista = listaSintetica();
    lista['Clientes'] = [clienteDaListaDe({ ClienteCodigo: '1' })];

    expect(getListaClientesOutputSchema.parse(lista).Clientes[0]?.ClienteCodigo).toBe(1);
  });
});

describe('postClienteOutputSchema e primeiroErroDeNegocio', () => {
  it('aceita o array vazio do cadastro bem-sucedido', () => {
    const validado = postClienteOutputSchema.safeParse([]);
    expect(validado.success).toBe(true);
    expect(primeiroErroDeNegocio(validado.data ?? [])).toBeNull();
  });

  it('trata Type 1 como erro de negócio e devolve a Description do ERP', () => {
    const mensagens = [
      { Id: 'AVISO', Type: 0, Description: 'Cliente criado com pendências.' },
      { Id: 'DUP', Type: 1, Description: 'CPF já cadastrado em outra empresa.' },
    ];

    const validado = postClienteOutputSchema.safeParse(mensagens);
    expect(validado.success).toBe(true);
    expect(primeiroErroDeNegocio(validado.data ?? [])?.Description).toBe(
      'CPF já cadastrado em outra empresa.',
    );
  });

  it('não confunde aviso com erro — Type 0 sozinho não recusa o cadastro', () => {
    const validado = postClienteOutputSchema.safeParse([
      { Id: 'OK', Type: 0, Description: 'Registro gravado.' },
    ]);
    expect(primeiroErroDeNegocio(validado.data ?? [])).toBeNull();
  });

  it('recusa um corpo que não é array de mensagens', () => {
    expect(postClienteOutputSchema.safeParse({ mensagem: 'erro' }).success).toBe(false);
  });
});

import type { ClienteCheckout } from '../../src/shared/schemas/cliente.schema';

/**
 * Fixtures sintéticas de cliente, compartilhadas pelos testes da feature 005.
 *
 * Todos os valores são inventados — nenhum dado de produção.
 */
export function clienteCheckoutDe(sobrescritas: Partial<ClienteCheckout> = {}): ClienteCheckout {
  return {
    Empresa: 1,
    CodCliente: 2538,
    nome: 'CLIENTE EXEMPLO',
    cpf: '11122233344',
    email: 'exemplo@example.test',
    celular: '55 47 90000-0000',
    cep: '89000000',
    endereco: 'Rua Exemplo',
    bairro: 'Centro',
    numero: '100',
    cidade: 'SINOP',
    uf: 'MT',
    CodigoConvenio: 7,
    NomeConvenio: 'CONVENIO EXEMPLO',
    DescontoConvenio: 10,
    ListaPreco: 5,
    ...sobrescritas,
  };
}

/** Item de `GetListaClientes` — sem convênio nem e-mail, como o contrato real. */
export function clienteDaListaDe(
  sobrescritas: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ClienteCodigo: 2538,
    ClienteNome: 'CLIENTE EXEMPLO',
    CPF: '11122233344',
    ListaPreco: 5,
    Celular: '55 47 90000-0000',
    Telefone: '55 47 3000-0000',
    Endereco: {
      cep: '89000000',
      endereco: 'Rua Exemplo',
      bairro: 'Centro',
      numero: '100',
      cidade: 'SINOP',
      uf: 'MT',
    },
    ...sobrescritas,
  };
}

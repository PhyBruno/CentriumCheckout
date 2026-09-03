import { describe, expect, it, vi } from 'vitest';
import {
  ErroCadastroRecusado,
  ErroClienteNaoEncontrado,
  fetchClientePorCodigo,
  fetchClientePorDocumento,
  fetchListaClientes,
  postCliente,
} from '../../../../src/client/services/cliente/clienteQueries';
import {
  ErroRedeErp,
  ErroRespostaInvalida,
  ErroSessaoEncerrada,
} from '../../../../src/client/services/errosErp';
import type { ErpClient, ResultadoChamadaErp } from '../../../../src/client/services/erpClient';
import type { CadastroSimplificadoInput } from '../../../../src/client/domain/cliente/clienteVenda';
import { clienteCheckoutDe, clienteDaListaDe } from '../../../support/cliente';

/**
 * Camada de rede dos endpoints de cliente — o que o Checkout envia ao ERP e
 * como trata cada forma de resposta (Constitution III e IV).
 *
 * Todos os payloads são sintéticos.
 */

interface ChamadaRegistrada {
  readonly caminho: string;
  readonly init: RequestInit;
}

function clienteQueFalha(estado: 'erro-de-rede' | 'sessao-encerrada'): ErpClient {
  return {
    chamar: () =>
      Promise.resolve(
        (estado === 'erro-de-rede'
          ? { estado }
          : { estado, itensNaVenda: 0 }) as ResultadoChamadaErp,
      ),
  };
}

/** `ErpClient` que devolve respostas em fila e registra o que foi chamado. */
function clienteDe(respostas: Response[]): { erpClient: ErpClient; chamadas: ChamadaRegistrada[] } {
  const chamadas: ChamadaRegistrada[] = [];
  const fila = [...respostas];

  return {
    chamadas,
    erpClient: {
      chamar: (caminho, init = {}) => {
        chamadas.push({ caminho, init });
        const resposta = fila.shift();
        if (resposta === undefined) {
          throw new Error(`Chamada inesperada a ${caminho}`);
        }
        return Promise.resolve({ estado: 'ok', resposta });
      },
    },
  };
}

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status });
}

const DADOS_CADASTRO: CadastroSimplificadoInput = {
  nome: 'CLIENTE NOVO',
  cpf: '11122233344',
  email: 'novo@example.test',
  celular: '55 47 90000-0000',
  cep: '89000000',
  endereco: 'Rua Exemplo',
  bairro: 'Centro',
  numero: '100',
  cidade: 'SINOP',
  uf: 'MT',
};

describe('fetchClientePorDocumento', () => {
  it('consulta GetCliente por CPFCNPJ e devolve o cadastro validado', async () => {
    const { erpClient, chamadas } = clienteDe([respostaJson({ Cliente: clienteCheckoutDe() })]);

    const cliente = await fetchClientePorDocumento('11122233344', { erpClient });

    expect(chamadas[0]?.caminho).toBe('/ApiCentriumOAuth/GetCliente?CPFCNPJ=11122233344');
    expect(cliente.CodCliente).toBe(2538);
  });

  it('traduz 404 em ErroClienteNaoEncontrado — é o gatilho do cadastro simplificado', async () => {
    const { erpClient } = clienteDe([respostaJson({}, 404)]);

    await expect(fetchClientePorDocumento('99999999999', { erpClient })).rejects.toBeInstanceOf(
      ErroClienteNaoEncontrado,
    );
  });

  it('trata o SDT vazio (200, CodCliente 0) como não encontrado', async () => {
    // `PCheckout_GetCliente` não responde 404 quando o `For Each` não acha —
    // devolve o SDT recém-criado (código-fonte da KB, 2026-09-03). Sem esta
    // checagem, o Checkout associaria à venda um "cliente 0".
    const { erpClient } = clienteDe([
      respostaJson({ Cliente: { ...clienteCheckoutDe(), CodCliente: 0, nome: '' } }),
    ]);

    await expect(fetchClientePorDocumento('99999999999', { erpClient })).rejects.toBeInstanceOf(
      ErroClienteNaoEncontrado,
    );
  });

  it('envia só dígitos, mesmo com a máscara digitada pelo operador', async () => {
    // A procedure compara com `CliCgc2`, que guarda o documento cru; a máscara
    // faria o `For Each` não casar com nada.
    const { erpClient, chamadas } = clienteDe([respostaJson({ Cliente: clienteCheckoutDe() })]);

    await fetchClientePorDocumento('111.222.333-44', { erpClient });

    expect(chamadas[0]?.caminho).toBe('/ApiCentriumOAuth/GetCliente?CPFCNPJ=11122233344');
  });

  it('recusa resposta fora do contrato em vez de associar cliente parcial', async () => {
    // `DescontoConvenio` ausente: aceitar isso deixaria o preço da venda a
    // cargo de um dado que o ERP não mandou (Constitution IV/V).
    const incompleto: Record<string, unknown> = { ...clienteCheckoutDe() };
    delete incompleto['DescontoConvenio'];
    const { erpClient } = clienteDe([respostaJson({ Cliente: incompleto })]);

    await expect(fetchClientePorDocumento('11122233344', { erpClient })).rejects.toBeInstanceOf(
      ErroRespostaInvalida,
    );
  });

  it('propaga falha de rede e sessão encerrada como erros próprios', async () => {
    await expect(
      fetchClientePorDocumento('1', { erpClient: clienteQueFalha('erro-de-rede') }),
    ).rejects.toBeInstanceOf(ErroRedeErp);

    await expect(
      fetchClientePorDocumento('1', { erpClient: clienteQueFalha('sessao-encerrada') }),
    ).rejects.toBeInstanceOf(ErroSessaoEncerrada);
  });
});

describe('fetchClientePorCodigo (FR-016, AD-115)', () => {
  it('consulta GetCliente por CodCliente, nunca por documento', async () => {
    const { erpClient, chamadas } = clienteDe([respostaJson({ Cliente: clienteCheckoutDe() })]);

    const cliente = await fetchClientePorCodigo(1255, { erpClient });

    expect(chamadas[0]?.caminho).toBe('/ApiCentriumOAuth/GetCliente?CodCliente=1255');
    expect(chamadas[0]?.caminho).not.toContain('CPFCNPJ');
    expect(cliente.nome).toBe('CLIENTE EXEMPLO');
  });

  it('traduz 404 em ErroClienteNaoEncontrado identificado pelo código', async () => {
    const { erpClient } = clienteDe([respostaJson({}, 404)]);

    await expect(fetchClientePorCodigo(4242, { erpClient })).rejects.toThrow('4242');
  });
});

describe('fetchListaClientes', () => {
  it('envia termo e paginação e valida a resposta', async () => {
    const { erpClient, chamadas } = clienteDe([
      respostaJson({
        ListaClientes: {
          PaginaAtual: 2,
          RegistrosPorPagina: 5,
          TotalRegistros: 7,
          TotalPaginas: 2,
          Clientes: [clienteDaListaDe()],
        },
      }),
    ]);

    const lista = await fetchListaClientes(
      'CLIENTE',
      { qtdMinCharParaConsulta: 3, pagina: 2, tamanhoPagina: 5 },
      { erpClient },
    );

    expect(chamadas[0]?.caminho).toBe(
      '/ApiCentriumOAuth/GetListaClientes?Txtbusca=CLIENTE&Pagina=2&Tamanhopagina=5',
    );
    // Nenhum parâmetro de status é enviado — o contrato não tem (AD-093).
    expect(chamadas[0]?.caminho).not.toMatch(/Ativo|Status/i);
    expect(lista.TotalRegistros).toBe(7);
  });
});

describe('postCliente', () => {
  it('envia exatamente os 11 campos que a procedure grava (AD-024/AD-026)', async () => {
    const { erpClient, chamadas } = clienteDe([
      respostaJson([]),
      respostaJson({ Cliente: clienteCheckoutDe({ CodCliente: 9001 }) }),
    ]);

    const criado = await postCliente(DADOS_CADASTRO, 7, { erpClient });

    const corpo = JSON.parse(String(chamadas[0]?.init.body)) as {
      Cliente: Record<string, unknown>;
    };
    expect(Object.keys(corpo.Cliente).sort()).toEqual(
      [
        'Empresa',
        'bairro',
        'celular',
        'cep',
        'cidade',
        'cpf',
        'email',
        'endereco',
        'nome',
        'numero',
        'uf',
      ].sort(),
    );
    expect(corpo.Cliente['Empresa']).toBe(7);
    // Campos de crédito e `CliTip` nunca são enviados.
    expect(corpo.Cliente).not.toHaveProperty('LimiteCredito');
    expect(corpo.Cliente).not.toHaveProperty('PermiteVendaCredito');
    expect(corpo.Cliente).not.toHaveProperty('CliTip');

    // `PostCliente` não devolve o cliente criado: o `CodCliente` vem do
    // `GetCliente` seguinte.
    expect(chamadas[1]?.caminho).toBe('/ApiCentriumOAuth/GetCliente?CPFCNPJ=11122233344');
    expect(criado.CodCliente).toBe(9001);
  });

  it('normaliza CPF e CEP para dígitos antes de gravar', async () => {
    // `PCheckout_PostCliente` grava o valor recebido em `CliCgc2` (o campo
    // cru) e só então formata em `CliCgc`. Enviar a máscara gravaria máscara
    // no campo cru e quebraria toda busca posterior por documento.
    const { erpClient, chamadas } = clienteDe([
      respostaJson([]),
      respostaJson({ Cliente: clienteCheckoutDe() }),
    ]);

    await postCliente({ ...DADOS_CADASTRO, cpf: '111.222.333-44', cep: '89000-000' }, 1, {
      erpClient,
    });

    const corpo = JSON.parse(String(chamadas[0]?.init.body)) as {
      Cliente: Record<string, unknown>;
    };
    expect(corpo.Cliente['cpf']).toBe('11122233344');
    expect(corpo.Cliente['cep']).toBe('89000000');
    // O `GetCliente` encadeado também vai limpo.
    expect(chamadas[1]?.caminho).toBe('/ApiCentriumOAuth/GetCliente?CPFCNPJ=11122233344');
  });

  it('recusa o cadastro quando o ERP devolve 200 com Type 1, sem chamar GetCliente', async () => {
    // Padrão GeneXus: recusa de negócio não vem como status HTTP de erro. Sem
    // esta checagem, o `GetCliente` seguinte daria 404 e o operador veria a
    // mensagem genérica em vez do motivo real (`SC-003`).
    const { erpClient, chamadas } = clienteDe([
      respostaJson([{ Id: 'DUP', Type: 1, Description: 'CPF já cadastrado.' }]),
    ]);

    await expect(postCliente(DADOS_CADASTRO, 1, { erpClient })).rejects.toBeInstanceOf(
      ErroCadastroRecusado,
    );
    expect(chamadas).toHaveLength(1);
  });

  it('leva a Description do ERP para a mensagem, sem reinterpretar', async () => {
    const { erpClient } = clienteDe([
      respostaJson([{ Id: 'UF', Type: 1, Description: 'UF inválida para o município.' }]),
    ]);

    await expect(postCliente(DADOS_CADASTRO, 1, { erpClient })).rejects.toThrow(
      'UF inválida para o município.',
    );
  });

  it('segue adiante quando o lote traz apenas avisos (Type 0)', async () => {
    const { erpClient, chamadas } = clienteDe([
      respostaJson([{ Id: 'OK', Type: 0, Description: 'Registro gravado.' }]),
      respostaJson({ Cliente: clienteCheckoutDe({ CodCliente: 9002 }) }),
    ]);

    const criado = await postCliente(DADOS_CADASTRO, 1, { erpClient });

    expect(criado.CodCliente).toBe(9002);
    expect(chamadas).toHaveLength(2);
  });

  it('recusa corpo fora do contrato de mensagens', async () => {
    const { erpClient } = clienteDe([respostaJson({ mensagem: 'ops' })]);

    await expect(postCliente(DADOS_CADASTRO, 1, { erpClient })).rejects.toBeInstanceOf(
      ErroRespostaInvalida,
    );
  });

  it('não chama GetCliente quando o POST falha por HTTP', async () => {
    const { erpClient, chamadas } = clienteDe([respostaJson([], 500)]);

    await expect(postCliente(DADOS_CADASTRO, 1, { erpClient })).rejects.toBeInstanceOf(ErroRedeErp);
    expect(chamadas).toHaveLength(1);
  });
});

describe('nenhum dado de cliente vaza para o console', () => {
  it('não registra CPF nem nome em log ao recusar um cadastro', async () => {
    const espiao = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { erpClient } = clienteDe([
      respostaJson([{ Id: 'DUP', Type: 1, Description: 'CPF já cadastrado.' }]),
    ]);

    await expect(postCliente(DADOS_CADASTRO, 1, { erpClient })).rejects.toThrow();

    expect(espiao).not.toHaveBeenCalled();
  });
});

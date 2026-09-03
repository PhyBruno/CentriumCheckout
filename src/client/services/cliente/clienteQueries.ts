/**
 * Camada de rede dos endpoints de cliente (T005, T016, T022, T028).
 *
 * Todas as chamadas passam pelo proxy autenticado `/api/erp/*` da feature 002 —
 * o frontend nunca fala com o ERP direto nem manipula `access_token`, e
 * `Authorization`/`Empresa` são injetados no servidor como cabeçalhos.
 *
 * Nenhum parâmetro de status/`Ativo` é enviado em lugar nenhum: o contrato não
 * tem esse filtro (AD-093).
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import {
  getClienteOutputSchema,
  getListaClientesOutputSchema,
  postClienteOutputSchema,
  primeiroErroDeNegocio,
  type CheckoutListaClientes,
  type ClienteCheckout,
} from '../../../shared/schemas/cliente.schema';
import type { CadastroSimplificadoInput } from '../../domain/cliente/clienteVenda';
import { criarErpClient, type ErpClient } from '../erpClient';
import { ErroRedeErp, ErroRespostaInvalida, ErroSessaoEncerrada } from '../errosErp';

const CAMINHO_GET_CLIENTE = '/ApiCentriumOAuth/GetCliente';
const CAMINHO_GET_LISTA_CLIENTES = '/ApiCentriumOAuth/GetListaClientes';
const CAMINHO_POST_CLIENTE = '/ApiCentriumOAuth/PostCliente';

const HTTP_NAO_ENCONTRADO = 404;
const PAGINA_INICIAL = 1;
const TAMANHO_PAGINA_PADRAO = 20;

export interface ClienteQueriesDeps {
  readonly erpClient?: ErpClient;
}

/** Documento buscado sem correspondência no ERP — abre o cadastro simplificado. */
export class ErroClienteNaoEncontrado extends Error {
  constructor(readonly documento: string) {
    super(`Cliente ${documento} não encontrado.`);
    this.name = 'ErroClienteNaoEncontrado';
  }
}

/**
 * Recusa de negócio do ERP no cadastro simplificado — "CPF já cadastrado",
 * "UF inválida" e afins.
 *
 * A `message` é a `Description` que o próprio ERP devolveu: é ela que o
 * operador precisa ler para saber o que corrigir, e o Checkout não a
 * reinterpreta (Constitution III).
 */
export class ErroCadastroRecusado extends Error {
  constructor(descricao: string) {
    super(descricao);
    this.name = 'ErroCadastroRecusado';
  }
}

async function chamarErp(
  cliente: ErpClient,
  caminho: string,
  init: RequestInit = {},
): Promise<Response> {
  const resultado = await cliente.chamar(caminho, init);

  switch (resultado.estado) {
    case 'erro-de-rede':
      throw new ErroRedeErp();
    case 'sessao-encerrada':
      throw new ErroSessaoEncerrada();
    case 'ok':
      return resultado.resposta;
  }
}

/**
 * Resolve o cliente completo a partir de uma query de `GetCliente`.
 *
 * Compartilhado pelos dois lookups (documento e código): o shape de resposta é
 * o mesmo nos dois caminhos, só o parâmetro muda
 * (`contracts/erp-cliente-api.md`).
 */
async function buscarCliente(
  parametros: URLSearchParams,
  identificador: string,
  deps: ClienteQueriesDeps,
): Promise<ClienteCheckout> {
  const erpClient = deps.erpClient ?? criarErpClient();
  const resposta = await chamarErp(erpClient, `${CAMINHO_GET_CLIENTE}?${parametros.toString()}`, {
    method: 'GET',
  });

  if (resposta.status === HTTP_NAO_ENCONTRADO) {
    throw new ErroClienteNaoEncontrado(identificador);
  }
  if (!resposta.ok) {
    throw new ErroRedeErp();
  }

  const validado = getClienteOutputSchema.safeParse(await resposta.json());
  if (!validado.success) {
    throw new ErroRespostaInvalida('GetCliente', validado.error.message);
  }

  return validado.data.Cliente;
}

/**
 * Lookup por documento — chamada imperativa (não `useQuery` cacheado),
 * disparada em três pontos: busca direta por documento (`CLI-01`), seleção de
 * um candidato do modal de lista pelo `CPF` dele (`research.md` D1) e conclusão
 * do cadastro simplificado, que precisa do `CodCliente` recém-criado.
 */
export async function fetchClientePorDocumento(
  cpfCnpj: string,
  deps: ClienteQueriesDeps = {},
): Promise<ClienteCheckout> {
  return buscarCliente(new URLSearchParams({ CPFCNPJ: cpfCnpj }), cpfCnpj, deps);
}

/**
 * Lookup por `CodCliente` (`FR-016`, AD-115) — mesma natureza imperativa do
 * lookup por documento.
 *
 * **Sem uso próprio nesta feature**: existe para a importação de DAV (feature
 * 006), que recebe do documento apenas o código do cliente, nunca o CPF/CNPJ
 * (`specs/006-importacao-dav/contracts/importacao-domain-api.md`). O parâmetro
 * `CodCliente` foi acrescentado a `GetCliente` na KB do ERP em 2026-08-31 e
 * ainda não aparece em `Fluxograma - Diagrama - Alinhamentos/ApiCentriumOAuth.yaml`,
 * que é um snapshot anterior a essa data.
 */
export async function fetchClientePorCodigo(
  codigo: number,
  deps: ClienteQueriesDeps = {},
): Promise<ClienteCheckout> {
  const codigoTexto = String(codigo);
  return buscarCliente(new URLSearchParams({ CodCliente: codigoTexto }), codigoTexto, deps);
}

export interface ParametrosBuscaClientes {
  /** `SessaoUsuario.QtdMinCharParaConsulta` — piso do ERP, nunca hardcoded (AD-024). */
  readonly qtdMinCharParaConsulta: number;
  readonly pagina?: number;
  readonly tamanhoPagina?: number;
}

export async function fetchListaClientes(
  termo: string,
  parametros: ParametrosBuscaClientes,
  deps: ClienteQueriesDeps = {},
): Promise<CheckoutListaClientes> {
  const erpClient = deps.erpClient ?? criarErpClient();
  const query = new URLSearchParams({
    Txtbusca: termo,
    Pagina: String(parametros.pagina ?? PAGINA_INICIAL),
    Tamanhopagina: String(parametros.tamanhoPagina ?? TAMANHO_PAGINA_PADRAO),
  });

  const resposta = await chamarErp(erpClient, `${CAMINHO_GET_LISTA_CLIENTES}?${query.toString()}`, {
    method: 'GET',
  });
  if (!resposta.ok) {
    throw new ErroRedeErp();
  }

  const validado = getListaClientesOutputSchema.safeParse(await resposta.json());
  if (!validado.success) {
    throw new ErroRespostaInvalida('GetListaClientes', validado.error.message);
  }

  return validado.data.ListaClientes;
}

/**
 * Busca por termo livre para o modal (`CLI-02`).
 *
 * `staleTime: 0` — ao contrário do produto (`staleTime: Infinity`, que garante
 * preço estável durante a venda), o resultado da busca de cliente não alimenta
 * cálculo nenhum: é lista de escolha, e vale a mais recente. O piso de
 * caracteres entra pelo `enabled`, não por um `if` dentro do `queryFn`, para o
 * TanStack Query nem agendar a requisição.
 */
export function useBuscaClientes(
  termo: string,
  parametros: ParametrosBuscaClientes,
  deps: ClienteQueriesDeps = {},
): UseQueryResult<CheckoutListaClientes, Error> {
  const termoLimpo = termo.trim();
  const pagina = parametros.pagina ?? PAGINA_INICIAL;

  return useQuery({
    queryKey: ['busca-clientes', termoLimpo, pagina] as const,
    queryFn: () => fetchListaClientes(termoLimpo, parametros, deps),
    enabled: termoLimpo.length >= parametros.qtdMinCharParaConsulta,
    staleTime: 0,
  });
}

/**
 * Cadastro simplificado (`CLI-03`).
 *
 * Envia **exatamente** os 11 campos que `PCheckout_PostCliente` grava (AD-024):
 * `LimiteCredito`/`PermiteVendaCredito` nunca entram no payload, mesmo o schema
 * do contrato os aceitando — o ERP os ignora em silêncio, e enviá-los faria o
 * operador acreditar que configurou algo que nunca foi persistido (AD-026).
 * `CliTip` também não é enviado: é hardcoded `'F'` dentro da procedure.
 *
 * `PostCliente` responde só um array de mensagens, sem o cliente criado — daí a
 * chamada encadeada a `fetchClientePorDocumento`, única forma de obter o
 * `CodCliente` do registro recém-criado.
 */
export async function postCliente(
  dados: CadastroSimplificadoInput,
  empresa: number,
  deps: ClienteQueriesDeps = {},
): Promise<ClienteCheckout> {
  const erpClient = deps.erpClient ?? criarErpClient();
  const resposta = await chamarErp(erpClient, CAMINHO_POST_CLIENTE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      Cliente: {
        Empresa: empresa,
        nome: dados.nome,
        cpf: dados.cpf,
        email: dados.email,
        celular: dados.celular,
        cep: dados.cep,
        endereco: dados.endereco,
        bairro: dados.bairro,
        numero: dados.numero,
        cidade: dados.cidade,
        uf: dados.uf,
      },
    }),
  });

  if (!resposta.ok) {
    throw new ErroRedeErp();
  }

  // O ERP recusa por regra de negócio com `200` + `Type: 1` (padrão GeneXus,
  // mesmo de `FaturarNFCe` na feature 004). Sem esta checagem, "CPF já
  // cadastrado" seguiria para o `GetCliente` abaixo, tomaria `404` e chegaria
  // ao operador como "não foi possível consultar o cliente" — ele tentaria de
  // novo indefinidamente sem saber o motivo real (`SC-003`).
  const validado = postClienteOutputSchema.safeParse(await resposta.json());
  if (!validado.success) {
    throw new ErroRespostaInvalida('PostCliente', validado.error.message);
  }

  const erro = primeiroErroDeNegocio(validado.data);
  if (erro !== null) {
    throw new ErroCadastroRecusado(erro.Description);
  }

  return fetchClientePorDocumento(dados.cpf, deps);
}

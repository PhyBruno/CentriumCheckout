import { z } from 'zod';

/**
 * Validação de fronteira das respostas de `GetCliente` e `GetListaClientes`, e
 * do corpo de `PostCliente` (T002, Constitution IV,
 * `contracts/erp-cliente-api.md`).
 *
 * Os objetos são *loose* pelo mesmo motivo de `produto.schema.ts` e
 * `bootstrap.schema.ts`: o Checkout valida só o que consome e repassa o resto
 * do payload do ERP íntegro, sem reinterpretar (Constitution III).
 *
 * **Nenhum campo de status/`Ativo`** é declarado aqui — não é omissão de
 * mapeamento: o contrato do ERP não tem esse campo nem como parâmetro de
 * filtro nem como campo de resposta (AD-093). Inventá-lo para alimentar o chip
 * "Ativo" que o Pencil desenha seria exibir dado que o ERP não fornece.
 *
 * Nenhuma conversão numérica acontece aqui, ao contrário de `produto.schema.ts`:
 * `DescontoConvenio` é **percentual** (`0`–`100`), não valor monetário — a
 * aplicação em centavos é do domínio de precificação da feature 003
 * (Constitution V).
 */

/** `SDTCheckout_GetCliente`/`ClienteCheckout` — retorno de `GetCliente`. */
export const clienteCheckoutSchema = z.looseObject({
  Empresa: z.number().int(),
  CodCliente: z.number().int(),
  nome: z.string(),
  cpf: z.string(),
  email: z.string(),
  celular: z.string(),
  cep: z.string(),
  endereco: z.string(),
  bairro: z.string(),
  numero: z.string(),
  cidade: z.string(),
  uf: z.string(),
  /**
   * Presentes no contrato, **nunca** consumidos nem enviados pelo Checkout
   * (AD-026, `research.md` D5). Declarados como opcionais só para documentar
   * que a ausência deles no payload não é erro de fronteira — o cadastro
   * simplificado não os grava.
   */
  LimiteCredito: z.number().optional(),
  PermiteVendaCredito: z.boolean().optional(),
  CodigoConvenio: z.number().int(),
  NomeConvenio: z.string(),
  /** Percentual `0`–`100`, não valor absoluto (AD-023). */
  DescontoConvenio: z.number(),
  ListaPreco: z.number().int(),
});

/** Envelope de `GET /ApiCentriumOAuth/GetCliente` (`GetClienteOutput`). */
export const getClienteOutputSchema = z.looseObject({
  Cliente: clienteCheckoutSchema,
});

/**
 * Candidato do modal de busca por termo livre.
 *
 * Tem `ListaPreco`, mas **não** `DescontoConvenio`/`CodigoConvenio`/`email` —
 * por isso montar o `ClienteVenda` a partir da lista é proibido: selecionar um
 * candidato sempre dispara `GetCliente` pelo documento dele antes de associar
 * (`research.md` D1, mesmo princípio de AD-091 para produto).
 */
export const enderecoDaListaSchema = z.looseObject({
  cep: z.string(),
  endereco: z.string(),
  bairro: z.string(),
  numero: z.string(),
  cidade: z.string(),
  uf: z.string(),
});

export const clienteDaListaSchema = z.looseObject({
  ClienteCodigo: z.number().int(),
  ClienteNome: z.string(),
  CPF: z.string(),
  ListaPreco: z.number().int(),
  Celular: z.string(),
  Telefone: z.string(),
  Endereco: enderecoDaListaSchema,
});

export const checkoutListaClientesSchema = z.looseObject({
  PaginaAtual: z.number().int(),
  RegistrosPorPagina: z.number().int(),
  TotalRegistros: z.number().int(),
  TotalPaginas: z.number().int(),
  Clientes: z.array(clienteDaListaSchema),
});

/** Envelope de `GET /ApiCentriumOAuth/GetListaClientes`. */
export const getListaClientesOutputSchema = z.looseObject({
  ListaClientes: checkoutListaClientesSchema,
});

/**
 * `GeneXus.Common.Messages_Message` — o corpo inteiro de `PostCliente`.
 *
 * `Type` distingue aviso de erro: no padrão GeneXus a **recusa de negócio vem
 * como `200` com `Type: 1`**, não como status HTTP de erro — a feature 004 já
 * trata `FaturarNFCe` assim (`faturarNFCe.schema.ts`). Sem validar este corpo,
 * um "CPF já cadastrado" passaria por sucesso e só falharia no `GetCliente`
 * seguinte, com a mensagem genérica errada para o operador (`SC-003`).
 */
const TIPO_MENSAGEM_ERRO = 1;

export const mensagemErpSchema = z.looseObject({
  Id: z.string(),
  Type: z.number().int(),
  Description: z.string(),
});

export const postClienteOutputSchema = z.array(mensagemErpSchema);

export type MensagemErp = z.infer<typeof mensagemErpSchema>;

/** A primeira mensagem de erro do lote, ou `null` quando são todas avisos. */
export function primeiroErroDeNegocio(mensagens: readonly MensagemErp[]): MensagemErp | null {
  return mensagens.find((mensagem) => mensagem.Type === TIPO_MENSAGEM_ERRO) ?? null;
}

export type ClienteCheckout = z.infer<typeof clienteCheckoutSchema>;
export type ClienteDaLista = z.infer<typeof clienteDaListaSchema>;
export type CheckoutListaClientes = z.infer<typeof checkoutListaClientesSchema>;

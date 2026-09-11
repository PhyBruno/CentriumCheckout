import { z } from 'zod';
import { inteiroErp, numeroErp, semEnvelope } from './erpJson';

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
  Empresa: inteiroErp,
  CodCliente: inteiroErp,
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
  LimiteCredito: numeroErp.optional(),
  PermiteVendaCredito: z.boolean().optional(),
  CodigoConvenio: inteiroErp,
  NomeConvenio: z.string(),
  /** Percentual `0`–`100`, não valor absoluto (AD-023). */
  DescontoConvenio: numeroErp,
  ListaPreco: inteiroErp,
});

/**
 * `GET /ApiCentriumOAuth/GetCliente` — **sem** o envelope `{"Cliente": …}` que
 * o `GetClienteOutput` do YAML desenha: o ERP real devolve os campos do cliente
 * na raiz (verificado ao vivo em 2026-09-04 — AD-165). `semEnvelope` aceita as
 * duas formas e entrega sempre o cliente.
 */
export const getClienteOutputSchema = semEnvelope('Cliente', clienteCheckoutSchema);

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
  /** `int64` — chega como string (`"1"`) no ERP real, número no `erp-mock`. */
  ClienteCodigo: inteiroErp,
  ClienteNome: z.string(),
  CPF: z.string(),
  ListaPreco: inteiroErp,
  Celular: z.string(),
  Telefone: z.string(),
  Endereco: enderecoDaListaSchema,
});

export const checkoutListaClientesSchema = z.looseObject({
  PaginaAtual: inteiroErp,
  RegistrosPorPagina: inteiroErp,
  TotalRegistros: inteiroErp,
  TotalPaginas: inteiroErp,
  /**
   * **Ausente quando a busca não acha ninguém.** O ERP não devolve `[]`: ele
   * omite a chave e manda só `PaginaAtual`/`RegistrosPorPagina`/
   * `TotalRegistros: 0`/`TotalPaginas: 0` (medido ao vivo 2026-09-11 contra
   * `GetListaClientes`, e o mesmo vale para produto, vendedor, DAV e rascunho).
   *
   * Exigir a chave fazia **toda** busca sem resultado reprovar na fronteira: o
   * operador via erro de resposta inválida em vez do "nenhum cliente
   * encontrado" da tela. O `erp-mock` devolvia `[]` e escondia isso da suíte.
   */
  Clientes: z.array(clienteDaListaSchema).optional().default([]),
});

/**
 * `GET /ApiCentriumOAuth/GetListaClientes` — também **sem** envelope no ERP
 * real: `Clientes`/`PaginaAtual`/`TotalRegistros` vêm na raiz (AD-165).
 */
export const getListaClientesOutputSchema = semEnvelope(
  'ListaClientes',
  checkoutListaClientesSchema,
);

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

/**
 * `POST /ApiCentriumOAuth/PostCliente` — o ERP real embrulha as mensagens em
 * **`{"messages": [...]}`**, não devolve o array nu que o YAML desenha.
 *
 * Medido ao vivo em 2026-09-11 (tenant `c0lj6mvzeh`), nas duas saídas possíveis:
 *
 * - recusa → `{"messages":[{"Id":"9998","Type":1,"Description":"CPF do cliente
 *   é obrigatório"}]}`;
 * - **sucesso** → `{"messages":[{"Id":"1","Type":2,"Description":"37 - FULANO
 *   DE TAL"}]}` (o `Description` do sucesso é `<código gravado> - <nome>`).
 *
 * Com `z.array(...)` puro, **nenhuma** das duas casava: o cadastro simplificado
 * de cliente (feature 005) reprovava na fronteira em toda chamada contra o ERP
 * real — inclusive quando o cliente era gravado, caso em que o operador via
 * erro para um cadastro que existia de verdade.
 *
 * O `preprocess` aceita as duas formas e entrega sempre o array, então quem
 * consome (`primeiroErroDeNegocio`) não muda e o `erp-mock`/YAML seguem válidos.
 *
 * O desembrulho só acontece quando a chave `messages` **está presente**: um
 * objeto qualquer sem ela continua sendo erro de fronteira, em vez de virar
 * lista vazia e passar por sucesso silencioso — é a mesma razão pela qual
 * `semEnvelope` valida a raiz quando não encontra a chave, e não um `[]` de
 * conveniência.
 */
export const postClienteOutputSchema = z.preprocess((valor: unknown) => {
  if (typeof valor === 'object' && valor !== null && !Array.isArray(valor) && 'messages' in valor) {
    return (valor as Record<string, unknown>).messages;
  }
  return valor;
}, z.array(mensagemErpSchema));

export type MensagemErp = z.infer<typeof mensagemErpSchema>;

/** A primeira mensagem de erro do lote, ou `null` quando são todas avisos. */
export function primeiroErroDeNegocio(mensagens: readonly MensagemErp[]): MensagemErp | null {
  return mensagens.find((mensagem) => mensagem.Type === TIPO_MENSAGEM_ERRO) ?? null;
}

export type ClienteCheckout = z.infer<typeof clienteCheckoutSchema>;
export type ClienteDaLista = z.infer<typeof clienteDaListaSchema>;
export type CheckoutListaClientes = z.infer<typeof checkoutListaClientesSchema>;

/**
 * Snapshot do cliente atual da venda (T004, `data-model.md` §1).
 *
 * Domínio puro: só o tipo e os seus invariantes documentados. Mora aqui, e não
 * dentro de `clienteSlice.ts`, porque o mapper (`services/cliente/`) e o slice
 * (`stores/slices/`) precisam do mesmo tipo — declará-lo no slice criaria um
 * ciclo de importação type-only entre os dois (mesmo problema resolvido assim
 * na feature 001).
 *
 * É uma **cópia** dos campos relevantes, feita no momento da seleção — nunca
 * uma referência viva ao cache do TanStack Query, mesma regra de fronteira que
 * a feature 003 aplica ao produto (`.specs/codebase/ARCHITECTURE.md`).
 */

/**
 * Como o cliente entrou na venda.
 *
 * `'DAV'` foi acrescentado em 2026-08-31 (AD-115, `FR-016`) para a importação
 * de DAV (feature 006) — extensão puramente aditiva: não muda a regra
 * `CLIENTE_SELECIONADO` vs. `CLIENTE_TROCADO` (`research.md` D9).
 */
export type OrigemCliente =
  'DEFAULT' | 'BUSCA_DOCUMENTO' | 'BUSCA_LIVRE' | 'CADASTRO_SIMPLIFICADO' | 'DAV';

/** As origens que representam uma escolha explícita do operador (D9). */
export type OrigemSelecaoCliente = Exclude<OrigemCliente, 'DEFAULT' | 'CADASTRO_SIMPLIFICADO'>;

export interface ClienteVenda {
  readonly codigoCliente: number;
  readonly nome: string;
  /** CPF/CNPJ. `null` só para `origem = 'DEFAULT'` — `GetSessao` não o devolve. */
  readonly documento: string | null;
  /**
   * Contato exibido no campo "Contato" do card de cliente (nó `iL0FC` do
   * Pencil). Acrescentado ao `data-model.md` §1 durante a implementação: sem
   * ele o campo desenhado ficaria permanentemente vazio. `null` para
   * `'DEFAULT'` pelo mesmo motivo de `documento` — `GetSessao` só devolve
   * código e nome do cliente default.
   */
  readonly celular: string | null;
  /**
   * Lista de preço do cliente. Para `'DEFAULT'` vem de
   * `SessaoUsuario.ListaPrecoDefault` (AD-108), **não** `null`.
   *
   * `null` significa "o cadastro deste cliente não define o campo" e hoje só
   * ocorre em `'CADASTRO_SIMPLIFICADO'`. Nunca recebe fallback inventado
   * (`0`/`1`): um valor "seguro" esconderia a ausência de dado atrás de algo
   * que parece válido, e produziria preço sutilmente errado em produção
   * (`research.md` D10).
   */
  readonly listaPreco: number | null;
  /**
   * Percentual de convênio (`0`–`100`). Para `'DEFAULT'` é sempre `0` — o
   * cliente default não tem convênio por regra de negócio (AD-108). `null` só
   * em `'CADASTRO_SIMPLIFICADO'`, pelo mesmo motivo de `listaPreco`.
   */
  readonly descontoConvenio: number | null;
  readonly codigoConvenio: number | null;
  readonly origem: OrigemCliente;
}

/** Entrada do formulário de cadastro simplificado (`data-model.md` §4). */
export interface CadastroSimplificadoInput {
  readonly nome: string;
  readonly cpf: string;
  readonly email: string;
  readonly celular: string;
  readonly cep: string;
  readonly endereco: string;
  readonly bairro: string;
  readonly numero: string;
  readonly cidade: string;
  readonly uf: string;
}

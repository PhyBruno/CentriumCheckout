import { z } from 'zod';
import { inteiroErp } from './erpJson';

/**
 * Configuração do ponto de venda devolvida por `GET /api/bootstrap`
 * (`data-model.md` § Configuração do Ponto de Venda).
 *
 * O payload real do `GetSessao` tem ~5MB e muitos campos consumidos por outras
 * features. Os objetos são *loose* de propósito: esta feature valida só o que
 * precisa garantir na fronteira e repassa o resto íntegro para o Dexie, sem
 * transformar — o Checkout não reinterpreta dado do ERP (Constitution III).
 */

/** Tipo de preço padrão do PDV — inteiro de 1 a 11 no contrato do ERP. */
const TIPO_PRECO_MIN = 1;
const TIPO_PRECO_MAX = 11;

/**
 * Todo campo numérico de `SessaoUsuario` usa `inteiroErp`, não `z.number()`:
 * o `GetSessao` real devolve `int64` como string (`"ClienteDefaultCodigo":
 * "999999"`, `"QtdMinCharParaConsulta": "3"`, `"caixa": "0"`), enquanto o
 * `erp-mock` produz número. `inteiroErp` aceita os dois (AD-165).
 */
export const sessaoUsuarioSchema = z.looseObject({
  TipoPreco: inteiroErp.pipe(z.number().min(TIPO_PRECO_MIN).max(TIPO_PRECO_MAX)),
  /**
   * Identidade exibida na barra superior do PDV — nome da empresa, operador
   * logado e caixa (`ApiCentriumOAuth.yaml`, schema `SessaoUsuario`).
   *
   * `optional()` de propósito, ao contrário dos demais campos deste schema:
   * nenhum deles decide comportamento de venda, só rótulo. Um cadastro de
   * empresa sem nome fantasia não pode derrubar o bootstrap inteiro e travar o
   * caixa — a barra simplesmente omite o pedaço que falta
   * (`identidadePdv.ts`). Declarados aqui, e não deixados ao `looseObject`,
   * porque `SessaoUsuario` é o tipo por onde a UI os lê.
   */
  EmpresaNomeFantasia: z.string().optional(),
  EmpresaRazaoSocial: z.string().optional(),
  UsuarioNome: z.string().optional(),
  /** Número do caixa. Minúsculo no contrato do ERP — não é typo. */
  caixa: inteiroErp.optional(),
  CadMaqCod: z.string(),
  /**
   * Série da NFCe do PDV. Enviada como `CadSerieNFCe` em toda finalização/
   * suspensão — **nunca** escolhida pelo operador (AD-034, feature 004).
   */
  CadSerieNFCe: z.string(),
  /**
   * `host:porta` do serviço de impressão local do PDV (AD-083, feature 004).
   * Pode vir **vazio**: o Checkout então usa `127.0.0.1:4545`, o mesmo default
   * do PDV atual, avisando o operador (`contracts/impressao-local-api.md`).
   */
  CadMaqHost: z.string(),
  /**
   * Caminho de entrega do documento fiscal: `'E'` (impressão direta pelo
   * serviço local) ou `'P'` (PDF para visualização/download) — `FR-008`/AD-082.
   *
   * União fechada, e não `z.string()`: é aqui que um terceiro valor é barrado,
   * na fronteira, antes de `decidirMecanismoImpressao` precisar decidir o que
   * fazer com ele (Constitution IV, `data-model.md` §5 da feature 004).
   */
  TipoImpressao: z.enum(['E', 'P']),
  /**
   * Lista de preço do cliente default (`CliListCod` dele, com fallback `1`
   * aplicado pelo ERP) — AD-108. Não é "lista padrão da empresa": esse conceito
   * não existe no domínio (AD-092).
   */
  ListaPrecoDefault: inteiroErp,
  /**
   * Repassado como está, sem interpretar nem reformatar (AD-104). A estrutura
   * interna (array JSON de strings com 7 campos delimitados por `;`) é validada
   * pela feature 013, não aqui.
   */
  CenarioPagamento: z.string(),
  /**
   * Piso de caracteres para disparar `GetListaProdutos` (AD-024). O ERP já
   * aplica o mínimo de 3 em `PCheckout_GetSessao` — o Checkout consome o valor
   * publicado e **nunca** hardcoda 3 (feature 003).
   */
  QtdMinCharParaConsulta: inteiroErp.pipe(z.number().min(1)),
  /**
   * Enviado **sempre** como `Tipocodproduto` em `GetProduto`, nunca inferido
   * por chamada (AD-033, feature 003).
   */
  UsuarioTipoCodigoProduto: z.string(),
  /**
   * Cliente que abre toda venda antes de qualquer identificação (AD-032).
   * Enviado como `Codcliente` em `GetProduto` desde a primeira inserção.
   *
   * `0` é o "vazio" deste campo — `int64` não anulável no contrato do ERP —, e
   * significa que a empresa não configurou cliente default: a venda nasce com o
   * campo cliente vazio, exigindo seleção manual (`FR-005`/`CLI-06` da feature
   * 005).
   */
  ClienteDefaultCodigo: inteiroErp,
  /**
   * Nome do cliente default, exibido no campo cliente da venda desde a
   * pré-seleção automática (feature 005, `research.md` D3).
   *
   * `optional()` pelo mesmo motivo dos rótulos da barra superior: é rótulo, não
   * decisão de venda — um cadastro sem nome não pode derrubar o bootstrap e
   * travar o caixa. A lista de preço do cliente default vem de
   * `ListaPrecoDefault` acima, e o desconto de convênio dele é `0` por regra de
   * negócio (AD-108), então `GetCliente` nunca é chamado para completá-lo.
   */
  ClienteDefaultNome: z.string().optional(),
  /**
   * Vendedor **do PDV**, exibido na pílula do card de cliente (nó `EqzJM` do
   * Pencil). Vem de `SessaoUsuario`, não de `GetCliente`: o schema
   * `ClienteCheckout` do contrato não tem nenhum campo de vendedor — o cadastro
   * do cliente não carrega vendedor associado. A troca de vendedor durante a
   * venda é a feature 012 (`GetListaVendedores`).
   *
   * `optional()` pelo mesmo motivo dos demais rótulos: um cadastro sem vendedor
   * definido omite a pílula em vez de derrubar o bootstrap.
   */
  VendedorCodigo: inteiroErp.optional(),
  VendedorNome: z.string().optional(),
});

export const bootstrapPayloadSchema = z.looseObject({
  /** Faz parte da chave do registro no Dexie — isola tenants (FR-009). */
  tenant: z.string().min(1),
  /** Reenviado como `Empresa` nas chamadas via `/api/erp/*` (AD-019). */
  codigoEmpresa: z.string().min(1),
  SessaoUsuario: sessaoUsuarioSchema,
});

export type SessaoUsuario = z.infer<typeof sessaoUsuarioSchema>;
export type BootstrapPayload = z.infer<typeof bootstrapPayloadSchema>;

import { z } from 'zod';
import { centavos, type Centavos } from '../../client/domain/precificacao/dinheiro';
import { MEIOS_PAGTO_NFE, type MeioPagtoNFe } from '../../client/domain/pagamento/formaPagamento';

/**
 * Validação de fronteira do catálogo de pagamento e do vale devolução (T007,
 * Constitution IV, `contracts/erp-pagamento-api.md` §1-2).
 *
 * Não existe endpoint dedicado de formas/condições de pagamento (`research.md`
 * D1 → AD-097): o catálogo chega embutido em `SessaoUsuario` de `GET
 * /api/bootstrap`. `bootstrap.schema.ts` valida `SessaoUsuario` como
 * `looseObject` e **não** declara `CondicoesDePagamento`/`ConfiguracoesTEF`/
 * `ConfiguracoesPIX` — este módulo é quem garante esses três campos na
 * fronteira, lendo o mesmo payload de sessão com um schema próprio.
 *
 * Mesma convenção de `produto.schema.ts`: objetos `looseObject` (Constitution
 * III — o Checkout valida o que consome e repassa o resto íntegro) e conversão
 * `double → Centavos` feita **na fronteira**, nunca no componente/slice
 * (Constitution V).
 */

/** `number/format: double` do ERP → `Centavos` inteiros (mesmo padrão de `precoEmCentavos`). */
const valorEmCentavos = z.number().transform((valor) => centavos(Math.round(valor * 100)));

/**
 * `FormaIntegracaoCartao`: `'1'` = TEF, `'2'` = POS/avulso. `null`/ausente vira
 * `''` — o contrato de conversão (`erp-pagamento-api.md` §1) exige isso porque
 * a maioria das formas (dinheiro, PIX) nunca preenche o campo.
 */
const integracaoCartaoSchema = z
  .union([z.literal('1'), z.literal('2'), z.literal('')])
  .nullable()
  .optional()
  .transform((valor): '1' | '2' | '' => valor ?? '');

/**
 * `FormaFpgUtiCar`: `''`/ausente significa **elegível** para vale devolução
 * (AD-048, `research.md` D10) — decisão direta do usuário, contrária à
 * recomendação original. O campo só é preenchido quando a empresa tem regra
 * dinâmica de forma de pagamento configurada; no fallback do ERP ele vem vazio.
 */
const fpgUtiCarSchema = z
  .string()
  .nullable()
  .optional()
  .transform((valor) => valor ?? '');

/**
 * Forma de pagamento **antes** do filtro de `FormaMeioPagtoNFe` — aqui o campo
 * ainda é `string` livre, não a união fechada `MeioPagtoNFe`. A checagem contra
 * `MEIOS_PAGTO_NFE` acontece em `filtrarFormasValidas`, fora do parse do Zod,
 * porque um valor desconhecido não pode reprovar o array inteiro (ver TSDoc
 * daquela função).
 */
const formaPagamentoBrutaSchema = z.looseObject({
  FormaCodigo: z.number().int(),
  FormaDescricao: z.string(),
  /**
   * `FpgEnt` do ERP — **obrigatório** (`FR-022`/AD-111). Sem ele o ERP calcula
   * crediário zero e o gate de validação prévia (feature 014) aprova
   * exatamente o que deveria barrar. Diferente de `FormaIntegracaoCartao`/
   * `FormaFpgUtiCar`, a ausência aqui é erro de fronteira, não um `''` default.
   */
  FormaEntrada: z.string(),
  FormaMeioPagtoNFe: z.string(),
  FormaIntegracaoCartao: integracaoCartaoSchema,
  FormaTipoTransacaoTEF: z.string(),
  FormaFpgUtiCar: fpgUtiCarSchema,
});

type FormaPagamentoBruta = z.infer<typeof formaPagamentoBrutaSchema>;

/** Forma já com `FormaMeioPagtoNFe` estreitado para a união fechada do domínio. */
export interface FormaPagamentoValidada {
  readonly FormaCodigo: number;
  readonly FormaDescricao: string;
  readonly FormaEntrada: string;
  readonly FormaMeioPagtoNFe: MeioPagtoNFe;
  readonly FormaIntegracaoCartao: '1' | '2' | '';
  readonly FormaTipoTransacaoTEF: string;
  readonly FormaFpgUtiCar: string;
}

const MEIOS_PAGTO_NFE_CONHECIDOS = new Set<string>(MEIOS_PAGTO_NFE);

function ehMeioPagtoNfeConhecido(valor: string): valor is MeioPagtoNFe {
  return MEIOS_PAGTO_NFE_CONHECIDOS.has(valor);
}

/**
 * Descarta, isoladamente, cada forma cujo `FormaMeioPagtoNFe` não pertence à
 * união fechada conhecida — em vez de reprovar a condição inteira.
 *
 * **Por que o descarte silencioso (com `console.warn`) é preferível ao erro
 * duro aqui:** `MeioPagtoNFe` é uma união fechada sobre o domínio
 * `NFCe_FormaPagto` da KB do ERP (AD-023). Um cadastro novo no ERP — uma forma
 * de pagamento criada pelo lojista depois do último deploy do Checkout — pode
 * usar um `FormaMeioPagtoNFe` que a união ainda não conhece. Se o schema
 * falhasse o array inteiro (como faria um `z.enum` comum dentro de
 * `z.array`), **todas** as formas da condição — inclusive dinheiro e PIX, que
 * o operador usa o dia inteiro — ficariam indisponíveis por causa de uma única
 * forma nova e sem uso ainda. `data-model.md` §1 é explícito: o valor fora da
 * união "não derruba a tela: a forma é descartada do catálogo com um aviso no
 * console, para que um valor novo cadastrado no ERP não impeça o operador de
 * vender pelas demais formas".
 *
 * **Por que isso não contradiz a Constitution IV** (toda resposta do ERP
 * validada na fronteira antes de entrar no domínio): a Constitution exige que
 * dado inválido não entre no domínio sem validação — e ele não entra: a forma
 * rejeitada nunca vira um `FormaPagamento` do domínio, nunca é oferecida ao
 * operador, nunca participa de `resolverIntegracao`. O que este descarte evita
 * é o efeito colateral de propagar a falha de **uma** forma para a
 * indisponibilidade de **todas** — o mesmo princípio de `getListaProdutosOutputSchema`
 * teria aplicado a um item de lista malformado, só que aqui a decisão é
 * explícita e documentada, não um acidente de composição de schema. A
 * campo-a-campo (`FormaCodigo`, `FormaDescricao` etc.) continua validado a
 * risca por `formaPagamentoBrutaSchema` — só `FormaMeioPagtoNFe` desconhecido
 * é tolerado, e é tolerado com aviso, não em silêncio absoluto.
 */
export function filtrarFormasValidas(
  brutas: readonly FormaPagamentoBruta[],
  condicaoCodigo: number,
): readonly FormaPagamentoValidada[] {
  const validas: FormaPagamentoValidada[] = [];

  for (const forma of brutas) {
    if (!ehMeioPagtoNfeConhecido(forma.FormaMeioPagtoNFe)) {
      console.warn(
        `[pagamento.schema] FormaMeioPagtoNFe desconhecido "${forma.FormaMeioPagtoNFe}" ` +
          `descartado da condição ${String(condicaoCodigo)} (forma ${String(forma.FormaCodigo)}).`,
      );
      continue;
    }

    validas.push({ ...forma, FormaMeioPagtoNFe: forma.FormaMeioPagtoNFe });
  }

  return validas;
}

const condicaoDePagamentoBrutaSchema = z.looseObject({
  CondicaoCodigo: z.number().int(),
  CondicaoDescricao: z.string(),
  CondicaoPrazo: z.number().int(),
  CondicaoMinimoEntrada: valorEmCentavos,
  /** Percentual da condição — **não** é dinheiro, sem conversão. */
  CondicaoDesconto: z.number(),
  CondicaoDescontoMaximo: z.number(),
  CondicaoFormasDePagamento: z.array(formaPagamentoBrutaSchema),
});

export interface CondicaoPagamentoValidada {
  readonly CondicaoCodigo: number;
  readonly CondicaoDescricao: string;
  readonly CondicaoPrazo: number;
  readonly CondicaoMinimoEntrada: Centavos;
  readonly CondicaoDesconto: number;
  readonly CondicaoDescontoMaximo: number;
  /**
   * Já filtrado por `filtrarFormasValidas` — pode ficar **vazio** quando toda
   * forma da condição tinha `FormaMeioPagtoNFe` desconhecido. Uma condição sem
   * nenhuma forma não é selecionável; é o mapper (`pagamentoMapper.ts`) que
   * exclui essas condições do catálogo devolvido, não este schema.
   */
  readonly CondicaoFormasDePagamento: readonly FormaPagamentoValidada[];
}

/** `SessaoUsuario.CondicoesDePagamento[]` — array já com formas filtradas. */
export const condicoesDePagamentoSchema = z
  .array(condicaoDePagamentoBrutaSchema)
  .transform((condicoes): readonly CondicaoPagamentoValidada[] =>
    condicoes.map((condicao) => ({
      ...condicao,
      CondicaoFormasDePagamento: filtrarFormasValidas(
        condicao.CondicaoFormasDePagamento,
        condicao.CondicaoCodigo,
      ),
    })),
  );

/**
 * `ConfiguracoesTEF` — o bloco inteiro pode estar **ausente** num bootstrap
 * antigo (empresa que ainda não passou pela migração que introduziu o campo).
 * Tratado como TEF desligado (`false`), não como erro de fronteira: uma
 * integração que nunca existiu para aquela empresa não pode derrubar o
 * bootstrap inteiro. O `.optional()` aqui é o que permite a leitura
 * `sessao.ConfiguracoesTEF?.TEFAtivo ?? false` no mapper.
 */
export const configuracoesTEFSchema = z.looseObject({
  TEFAtivo: z.boolean(),
});

/**
 * `ConfiguracoesPIX` — mesmo raciocínio de `configuracoesTEFSchema`: bloco
 * ausente vira PIX desligado.
 *
 * `MinimoPix` chega do ERP como `double` **em reais** e é convertido a
 * `Centavos` aqui, na fronteira, como todo valor monetário (Constitution V,
 * `contracts/pix-domain-api.md` §1) — antes da feature 009 ele só atravessava o
 * `looseObject` sem uso. Continua `optional()`: empresa sem piso configurado não
 * é erro de fronteira, e quem lê trata a ausência como zero.
 *
 * `TempoEspera` segue sem uso — o intervalo de sondagem do PIX é fixo em 10s por
 * AD-026, decisão de produto que **não** vem do bootstrap. Deixá-lo aqui só
 * documenta o campo do contrato.
 */
export const configuracoesPIXSchema = z.looseObject({
  UtilizaCentriumPAG: z.boolean(),
  MinimoPix: valorEmCentavos.optional(),
  TempoEspera: z.number().optional(),
});

/**
 * `SessaoUsuario`, recortado só nos campos de pagamento que este módulo
 * garante. `looseObject`: o restante de `SessaoUsuario` (já coberto por
 * `bootstrap.schema.ts`) segue íntegro, sem reinterpretação (Constitution III).
 */
export const sessaoPagamentoSchema = z.looseObject({
  CondicoesDePagamento: condicoesDePagamentoSchema,
  ConfiguracoesTEF: configuracoesTEFSchema.optional(),
  ConfiguracoesPIX: configuracoesPIXSchema.optional(),
});

/** Envelope de `GET /api/bootstrap`, recortado nos campos desta feature. */
export const bootstrapPagamentoSchema = z.looseObject({
  SessaoUsuario: sessaoPagamentoSchema,
});

/**
 * `ValidaTicketDevolucaoOutput` (`erp-pagamento-api.md` §2, yaml linhas
 * 693-701). `ValorTicket` é o único `double` deste endpoint — convertido aqui,
 * nunca no mapper/query.
 */
export const validaTicketDevolucaoOutputSchema = z.looseObject({
  ValorTicket: valorEmCentavos,
  Valido: z.boolean(),
  Mensagem: z.string(),
});

export type SessaoPagamento = z.infer<typeof sessaoPagamentoSchema>;
export type BootstrapPagamento = z.infer<typeof bootstrapPagamentoSchema>;
export type ValidaTicketDevolucaoOutput = z.infer<typeof validaTicketDevolucaoOutputSchema>;

import { z } from 'zod';
import { inteiroErp, semEnvelope } from './erpJson';

/**
 * Fronteira dos três endpoints SmartTEF (T010, `data-model.md` §3,
 * `contracts/erp-tef-api.md` §4, AD-259).
 *
 * **Dois estágios.** `CriarCardPagamento`, `ConsultarStatusCard` e
 * `EstornarPagamento` devolvem o mesmo envelope de transporte,
 * `SDTSmartTefResposta`, e o dado da SmartTEF chega dentro dele como **texto**
 * JSON (`RespostaJson`). Validar só o envelope deixaria entrar sem schema o campo
 * que decide o dinheiro (`payment_status`) — mesmo erro que
 * `corpo-da-nfce-viaja-envelopado` registrou para o retrato. Quem encadeia os
 * dois estágios é `services/tef/tefMapper.ts`.
 *
 * **Formas lidas na KB, não medidas ao vivo.** O usuário ainda não tem o
 * terminal de homologação para a medição de `research.md` D17 (T001, AD-260).
 * Os pontos não confirmados estão marcados **[medir]** e são aceitos nas duas
 * formas possíveis, para que a medição troque uma linha e não o desenho.
 */

/**
 * `SDTSmartTefResposta`.
 *
 * - `Sucesso` é "a SmartTEF respondeu 2xx" — **não** é veredito de pagamento. A
 *   recusa de negócio chega por `Sucesso: false` + `MensagemErro`, e não por
 *   `messages[]`: nenhum dos três métodos declara `out:&Messages`.
 * - `CodigoStatusHttp` é `0` quando a chamada nem saiu (recusa local do
 *   `PSmartTEF`, como "Serial do POS … nao localizado"). Número ou texto, como
 *   todo número do GeneXus (`inteiroErp`).
 * - Envelope `{ RespostaSmartTEF: … }` ou plano: **[medir]**, aceitos os dois
 *   (`semEnvelope`, regra de AD-218).
 */
export const respostaSmartTefSchema = semEnvelope(
  'RespostaSmartTEF',
  z.looseObject({
    Sucesso: z.boolean(),
    CodigoStatusHttp: inteiroErp,
    MensagemErro: z.string(),
    RespostaJson: z.string(),
  }),
);

/**
 * Campo de detalhe da SmartTEF que o Checkout só **exibe**: ausente, `null` ou
 * numérico viram texto. A tela mostra "—" para vazio, e nada aqui entra em
 * cálculo — o valor cobrado é sempre o do Checkout (Constitution V).
 */
const detalheTexto = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((valor) => (valor === null || valor === undefined ? '' : String(valor)));

/**
 * `JSON.parse(RespostaJson)` de `CriarCardPagamento` (`SDTSmartTefCriarCardResp`).
 *
 * `payment_identifier` não vazio: é a chave da consulta, do estorno e do
 * `TEFPagId` da NFCe. Sem ele não existe cobrança que o Checkout consiga
 * acompanhar, e a resposta é tratada como fora do contrato.
 */
export const criarCardRespSchema = z.looseObject({
  payment_identifier: z.string().min(1),
  payment_status: z.string(),
});

/**
 * Um item de `ConsultarStatusCard` (`SDTSmartTefConsultaCard`, 40 campos na KB).
 *
 * `payment_status` é `string` livre: o estreitamento é das funções de domínio
 * (`interpretarStatusTef.ts`), cada uma com ramo `default` (T1).
 * `autorization_code` é a grafia da SmartTEF, sem o "h".
 */
export const consultaCardItemSchema = z.looseObject({
  payment_identifier: z.string(),
  payment_status: z.string(),
  card_brand: detalheTexto,
  nsu_host: detalheTexto,
  autorization_code: detalheTexto,
  reason: detalheTexto,
});

/**
 * `RespostaJson` de `ConsultarStatusCard`: **lista** na KB (`.Count` em
 * `PSmartTEF`). Objeto único também é aceito e normalizado para lista
 * **[medir]** — quem consome escolhe o item pelo `payment_identifier`.
 */
export const consultaCardRespSchema = z.union([
  z.array(consultaCardItemSchema),
  consultaCardItemSchema.transform((item) => [item]),
]);

/**
 * `RespostaJson` de `EstornarPagamento` (`SDTSmartTefCancelamentoResp`, objeto
 * único). `payment_status` normalmente `SOL_EST`, às vezes já `EST`
 * (`research.md` D14).
 */
export const estornoRespSchema = z.looseObject({
  payment_identifier: z.string(),
  payment_status: z.string(),
});

export type RespostaSmartTef = z.infer<typeof respostaSmartTefSchema>;
export type CriarCardResp = z.infer<typeof criarCardRespSchema>;
export type ConsultaCardItem = z.infer<typeof consultaCardItemSchema>;
export type EstornoResp = z.infer<typeof estornoRespSchema>;
